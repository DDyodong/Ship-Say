"""파일 입출력 + 매니페스트 조회 (명세 §5.4, §4 저장 계층).

이 모듈은 LLM을 부르지 않는다 — 이미 생성된 체크리스트를 디스크에 쌓고, 언어별
체크리스트를 항목 기준으로 병합해 재생용 매니페스트(§5.4)를 만들 뿐이다.
그래서 API 키·쿼터 없이 완결·테스트된다.

파일시스템 레이아웃 (저장 루트 아래):

    <root>/
      audio/<permit_id>/<lang>/<item_id>.mp3      # T10(TTS)에서 생성
      <permit_id>/
        checklist.<lang>.json                     # 언어별 원본
        manifest.json                             # 병합된 재생용 뷰

audio 경로를 permit 디렉터리 밖 최상위 audio/ 아래 두는 것은 §2·§5.4 표기를 따른 것이다
(`audio/{permit_id}/{lang}/{item_id}.mp3`).

DB는 쓰지 않는다 (§4: 데모 규모는 파일시스템 + JSON). TODO(팀확인): S3/DB 전환.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from .categories import BASE_DIR, load_config
from .models import Checklist, Manifest, ManifestItem

# --------------------------------------------------------------------------
# 경로
# --------------------------------------------------------------------------


def default_root() -> Path:
    """config.yaml 의 storage.root. 저장소 루트(briefing/ 의 부모) 기준으로 해석해
    실행 위치(cwd)와 무관하게 항상 같은 곳을 가리키게 한다."""
    return (BASE_DIR.parent / load_config()["storage"]["root"]).resolve()


def permit_dir(root: Path, permit_id: str) -> Path:
    return root / permit_id


def checklist_path(root: Path, permit_id: str, lang: str) -> Path:
    return permit_dir(root, permit_id) / f"checklist.{lang}.json"


def manifest_path(root: Path, permit_id: str) -> Path:
    return permit_dir(root, permit_id) / "manifest.json"


def audio_rel_path(permit_id: str, lang: str, item_id: str) -> str:
    """매니페스트에 기록할 오디오 상대경로 (§5.4). 저장 루트 기준.

    T10 이 이 경로에 실제 파일을 쓰고 매니페스트 audio 필드를 채운다. 그 전까지는
    아무도 이 경로를 매니페스트에 넣지 않는다 — 파일이 없는 경로를 넣으면 §11
    오디오 무결성 검사가 깨지기 때문이다.
    """
    return f"audio/{permit_id}/{lang}/{item_id}.mp3"


def audio_abs_path(root: Path, permit_id: str, lang: str, item_id: str) -> Path:
    return root / audio_rel_path(permit_id, lang, item_id)


# --------------------------------------------------------------------------
# 체크리스트 입출력
# --------------------------------------------------------------------------


def _write_json(path: Path, model) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(model.model_dump(mode="json"), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def save_checklist(root: Path, checklist: Checklist) -> Path:
    return _write_json(
        checklist_path(root, checklist.permit_id, checklist.lang), checklist
    )


def load_checklist(root: Path, permit_id: str, lang: str) -> Checklist:
    path = checklist_path(root, permit_id, lang)
    with path.open(encoding="utf-8") as f:
        return Checklist.model_validate(json.load(f))


# --------------------------------------------------------------------------
# 매니페스트 빌드 (언어별 체크리스트 → 항목 기준 병합)
# --------------------------------------------------------------------------


def build_manifest(checklists: dict[str, Checklist]) -> Manifest:
    """언어별 체크리스트를 item_id 기준으로 병합한다.

    항목 구조(순서·카테고리·phase·priority)는 **원본 언어(config 의 source, 보통 ko)**
    체크리스트를 기준으로 삼는다. 번역본은 같은 item_id 를 공유하므로(§9.3 에서 코드가
    item_id 를 보존한다) text[lang] 만 채운다. 원본 언어가 없으면 첫 체크리스트를 기준으로.

    audio / duration_sec 는 채우지 않는다 — T10 의 몫이다.
    """
    if not checklists:
        raise ValueError("병합할 체크리스트가 없다.")

    source_lang = load_config()["languages"]["source"]
    base_lang = source_lang if source_lang in checklists else next(iter(checklists))
    base = checklists[base_lang]

    # 언어 순서: 원본 먼저, 그다음 삽입 순서(build_all 이 source→targets 로 넣는다)
    languages = [base_lang] + [l for l in checklists if l != base_lang]

    items: list[ManifestItem] = []
    for base_item in base.items:
        entry = ManifestItem(
            item_id=base_item.item_id,
            category=base_item.category,
            phase=base_item.phase,
            priority=base_item.priority,
        )
        for lang in languages:
            match = _find_item(checklists[lang], base_item.item_id)
            if match is None:
                continue
            entry.text[lang] = match.text
            entry.needs_review[lang] = match.needs_review
        items.append(entry)

    return Manifest(
        permit_id=base.permit_id,
        languages=languages,
        activated_categories=base.activated_categories,
        generated_at=datetime.now(),
        items=items,
    )


def _find_item(checklist: Checklist, item_id: str):
    for item in checklist.items:
        if item.item_id == item_id:
            return item
    return None


def save_manifest(root: Path, manifest: Manifest) -> Path:
    return _write_json(manifest_path(root, manifest.permit_id), manifest)


def load_manifest(root: Path, permit_id: str) -> Manifest:
    path = manifest_path(root, permit_id)
    with path.open(encoding="utf-8") as f:
        return Manifest.model_validate(json.load(f))


# --------------------------------------------------------------------------
# 편의: 한 허가서의 전체 결과를 저장하고 매니페스트까지 만든다
# --------------------------------------------------------------------------


def persist(
    checklists: dict[str, Checklist], root: Optional[Path] = None
) -> Manifest:
    """언어별 체크리스트를 저장하고 매니페스트를 빌드·저장한 뒤 반환한다.

    generate.build_all() 의 출력을 그대로 받는다.
    """
    root = root or default_root()
    for checklist in checklists.values():
        save_checklist(root, checklist)
    manifest = build_manifest(checklists)
    save_manifest(root, manifest)
    return manifest


def list_permits(root: Optional[Path] = None) -> list[str]:
    """저장된 허가서 id 목록 (매니페스트가 있는 것만)."""
    root = root or default_root()
    if not root.exists():
        return []
    return sorted(
        p.name for p in root.iterdir() if p.is_dir() and manifest_path(root, p.name).exists()
    )
