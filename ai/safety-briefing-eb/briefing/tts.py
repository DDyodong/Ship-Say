"""TTS 렌더링 + 오디오 캐시 (명세 §8).

엔진을 바꾸면 통째로 갈아엎는 부분이므로 별도 파일로 둔다 (§4). 실제 엔진(edge-tts)은
`TTSEngine` 프로토콜 뒤에 있어서, 상용 전환 시 Google/Azure/Piper 로 교체할 때
이 파일 하나만 바뀐다 — LLM 클라이언트를 프로토콜로 추상화한 것과 같은 패턴.

캐시(§8 "반드시 구현"): 체크리스트 문장은 허가서 간 중복이 많다(공통 카테고리 항목은 특히).
`hash(text+lang+voice)` 로 캐시해 합성 호출(비용·시간의 대부분)을 건너뛴다. 캐시는 합성
호출만 아끼고, 매니페스트가 요구하는 허가서별 오디오 경로(§5.4)는 그대로 파일로 쓴다.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import sys
from pathlib import Path
from typing import NamedTuple, Optional, Protocol

from . import storage
from .categories import load_config
from .models import Manifest


class TTSEngine(Protocol):
    """텍스트 → (mp3 바이트, 재생 길이 초). 길이 계산은 엔진의 책임이다
    (edge-tts 는 WordBoundary 이벤트가 언어별로 일관되지 않아 mp3 에서 직접 측정한다)."""

    async def synthesize(self, text: str, voice: str) -> tuple[bytes, float]: ...


class EdgeTTSEngine:
    """Microsoft Edge 온라인 TTS. 무료·키 불필요. 비공식 엔드포인트."""

    async def synthesize(self, text: str, voice: str) -> tuple[bytes, float]:
        import edge_tts  # 지연 import — 테스트는 가짜 엔진을 쓰므로 없어도 된다
        from mutagen.mp3 import MP3

        communicate = edge_tts.Communicate(text, voice)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        data = bytes(audio)
        try:
            duration = round(MP3(io.BytesIO(data)).info.length, 2)
        except Exception:
            duration = 0.0  # 길이 측정 실패해도 오디오 자체는 유효할 수 있다
        return data, duration


def default_engine() -> TTSEngine:
    name = load_config()["tts"]["engine"]
    if name == "edge":
        return EdgeTTSEngine()
    # TODO(팀확인): google / piper 구현 추가 지점
    raise ValueError(f"알 수 없는 TTS 엔진: {name}")


def voice_for(lang: str) -> Optional[str]:
    """언어별 음성. 매핑에 없으면 None (오디오 생성을 건너뛴다)."""
    return load_config()["tts"]["voices"].get(lang)


# --------------------------------------------------------------------------
# 캐시 — hash(text+lang+voice) → (mp3, duration)
# --------------------------------------------------------------------------


def cache_key(text: str, lang: str, voice: str) -> str:
    raw = f"{lang}\x1f{voice}\x1f{text}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


def _cache_dir(root: Path) -> Path:
    return root / "audio" / "_cache"


def _cache_get(root: Path, key: str) -> Optional[tuple[bytes, float]]:
    mp3 = _cache_dir(root) / f"{key}.mp3"
    dur = _cache_dir(root) / f"{key}.dur"
    if mp3.exists() and dur.exists():
        try:
            return mp3.read_bytes(), float(dur.read_text())
        except (OSError, ValueError):
            return None
    return None


def _cache_put(root: Path, key: str, data: bytes, duration: float) -> None:
    d = _cache_dir(root)
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{key}.mp3").write_bytes(data)
    (d / f"{key}.dur").write_text(str(duration))


# --------------------------------------------------------------------------
# 렌더링
# --------------------------------------------------------------------------


class RenderStats(NamedTuple):
    rendered: int  # 실제 합성한 (item,lang) 수
    cached: int  # 캐시로 건너뛴 수
    skipped: int  # 음성 매핑 없어 건너뛴 수


async def render_manifest(
    manifest: Manifest,
    root: Optional[Path] = None,
    *,
    engine: Optional[TTSEngine] = None,
    langs: Optional[list[str]] = None,
    use_cache: Optional[bool] = None,
) -> tuple[Manifest, RenderStats]:
    """매니페스트의 각 항목·언어에 대해 오디오를 만들고 audio/duration_sec 를 채운다.

    §5.4 경로 `audio/{permit_id}/{lang}/{item_id}.mp3` 에 파일을 쓰고 매니페스트를 갱신·저장한다.
    langs 를 주면 그 언어만 렌더링한다(기본: 매니페스트의 모든 언어).
    """
    root = root or storage.default_root()
    engine = engine or default_engine()
    cfg = load_config()["tts"]
    use_cache = cfg.get("cache", True) if use_cache is None else use_cache
    target_langs = langs or manifest.languages
    semaphore = asyncio.Semaphore(cfg.get("max_concurrency", 4))

    rendered = cached = skipped = 0
    missing_voice_langs: set[str] = set()

    async def render_one(item, lang: str) -> str:
        """반환: 'rendered' | 'cached' | 'skipped'. 매니페스트 항목을 직접 채운다."""
        nonlocal rendered, cached, skipped
        text = item.text.get(lang)
        if not text:
            return "skipped"
        voice = voice_for(lang)
        if not voice:
            missing_voice_langs.add(lang)
            return "skipped"

        key = cache_key(text, lang, voice)
        hit = _cache_get(root, key) if use_cache else None
        if hit is not None:
            data, duration = hit
            outcome = "cached"
        else:
            async with semaphore:
                data, duration = await engine.synthesize(text, voice)
            if use_cache:
                _cache_put(root, key, data, duration)
            outcome = "rendered"

        path = storage.audio_abs_path(root, manifest.permit_id, lang, item.item_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        item.audio[lang] = storage.audio_rel_path(manifest.permit_id, lang, item.item_id)
        item.duration_sec[lang] = duration
        return outcome

    tasks = [
        render_one(item, lang)
        for item in manifest.items
        for lang in target_langs
    ]
    for outcome in await asyncio.gather(*tasks):
        if outcome == "rendered":
            rendered += 1
        elif outcome == "cached":
            cached += 1
        else:
            skipped += 1

    if missing_voice_langs:
        print(
            f"[TTS경고] {manifest.permit_id}: 음성 매핑 없는 언어 {sorted(missing_voice_langs)} "
            "→ 오디오 생성 건너뜀 (config.yaml 의 tts.voices 확인)",
            file=sys.stderr,
        )

    storage.save_manifest(root, manifest)
    return manifest, RenderStats(rendered, cached, skipped)


def verify_audio(manifest: Manifest, root: Optional[Path] = None) -> list[str]:
    """오디오 무결성 검사 (§11): 매니페스트가 참조하는 모든 오디오가 실재하고
    비어 있지 않으며 재생 길이가 잡혀 있는지 확인한다. 문제 목록을 반환(빈 목록이면 정상).

    운영 QA·§11 검증에 재사용한다. 매니페스트의 audio 경로는 저장 루트 기준 상대경로다.
    """
    root = root or storage.default_root()
    problems: list[str] = []
    for item in manifest.items:
        for lang, rel_path in item.audio.items():
            path = root / rel_path
            if not path.exists():
                problems.append(f"{item.item_id}/{lang}: 오디오 파일 없음 ({rel_path})")
            elif path.stat().st_size == 0:
                problems.append(f"{item.item_id}/{lang}: 오디오 파일이 비어 있음")
            duration = item.duration_sec.get(lang)
            if not duration or duration <= 0:
                problems.append(f"{item.item_id}/{lang}: 재생 길이 없음/0")
    return problems
