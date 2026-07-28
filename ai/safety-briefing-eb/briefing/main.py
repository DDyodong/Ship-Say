"""FastAPI 엔드포인트 + 파이프라인 오케스트레이션 (명세 §9.5) + 배치 러너 (§4-H).

이 모듈이 시스템의 진입점이다. 두 가지 사용 방식:

1. **API 서버** — ②모듈(또는 UI)이 승인 결과 JSON 을 POST 하면 체크리스트·번역을 생성·저장하고
   재생용 매니페스트를 반환한다. 현장은 저장된 매니페스트/오디오를 GET 으로 가져간다.
2. **배치 러너** — 허가서 JSON 수십~수백 건을 한 번에 처리하고 검수 리포트를 낸다.
   실제 운용은 "허가서 대량 업로드 → 사전 생성"이므로 이쪽이 주 사용 경로다.

생성은 시간이 걸리므로 비동기 처리도 고려 대상이지만, 데모 규모는 동기로 시작한다
(§9.5). TODO(팀확인): 대량 처리 시 작업 큐/백그라운드 태스크 도입.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import storage, tts
from .categories import load_config
from .generate import (
    GenerationError,
    LLMClient,
    RejectedPermitError,
    build_all,
    default_client,
)
from .models import Manifest, PermitApproval
from .tts import TTSEngine


def _default_langs() -> list[str]:
    cfg = load_config()["languages"]
    return [cfg["source"], *cfg["targets"]]


# --------------------------------------------------------------------------
# 배치 검수 리포트 (§4-H)
# --------------------------------------------------------------------------


class PermitOutcome(BaseModel):
    """허가서 한 건의 처리 결과."""

    permit_id: str
    status: str  # generated | rejected | error
    item_count: int = 0
    input_warnings: list[str] = Field(default_factory=list)
    needs_review_count: int = 0  # 번역 검증에 걸린 항목 수 (§9.4)
    error: Optional[str] = None


class BatchReport(BaseModel):
    """배치 전체 요약. 수백 건 중 무엇이 문제였는지 한눈에 본다."""

    total: int = 0
    generated: int = 0
    rejected: int = 0
    errored: int = 0
    with_input_warnings: int = 0
    outcomes: list[PermitOutcome] = Field(default_factory=list)

    def summary_line(self) -> str:
        return (
            f"총 {self.total}건 | 생성 {self.generated} · 반려 {self.rejected} · "
            f"오류 {self.errored} | 입력경고 있는 허가서 {self.with_input_warnings}건"
        )


# --------------------------------------------------------------------------
# 한 건 생성·저장 (API·배치 공용)
# --------------------------------------------------------------------------


async def generate_and_store(
    permit: PermitApproval,
    langs: list[str],
    *,
    root: Optional[Path] = None,
    client: Optional[LLMClient] = None,
    render_audio: bool = False,
    engine: Optional[TTSEngine] = None,
) -> tuple[Manifest, list[str]]:
    """한 허가서를 생성·번역·(선택)오디오 렌더·저장하고 (매니페스트, 입력경고) 를 반환한다.

    render_audio=True 면 T10 TTS 로 매니페스트의 audio/duration_sec 를 채운다 (§5.4, §8).
    """
    root = root or storage.default_root()
    warnings: list[str] = []
    checklists = await build_all(permit, langs, client=client, warnings=warnings)
    manifest = storage.persist(checklists, root=root)
    if render_audio:
        manifest, _ = await tts.render_manifest(manifest, root=root, engine=engine)
    return manifest, warnings


async def run_batch(
    permit_paths: list[Path],
    langs: list[str],
    *,
    root: Optional[Path] = None,
    client: Optional[LLMClient] = None,
    render_audio: bool = False,
    engine: Optional[TTSEngine] = None,
) -> BatchReport:
    """허가서 JSON 여러 건을 순차 처리한다.

    무료 티어에서는 레이트 리미터가 병목이라 순차가 안전하다. 유료 전환 후
    허가서 단위 병렬은 §4-H 에 적어둔 대로 별도 상한 관리가 필요하므로 지금은 넣지 않는다.
    render_audio=True 면 사전 생성(§1) 방식대로 오디오까지 미리 만든다.
    """
    root = root or storage.default_root()
    report = BatchReport(total=len(permit_paths))

    for path in permit_paths:
        try:
            with path.open(encoding="utf-8") as f:
                permit = PermitApproval.model_validate(json.load(f))
        except Exception as exc:  # 깨진 JSON·스키마 불일치도 배치를 멈추지 않는다
            report.errored += 1
            report.outcomes.append(
                PermitOutcome(
                    permit_id=path.stem, status="error", error=f"입력 파싱 실패: {exc}"
                )
            )
            continue

        try:
            manifest, warnings = await generate_and_store(
                permit, langs, root=root, client=client,
                render_audio=render_audio, engine=engine,
            )
        except RejectedPermitError:
            report.rejected += 1
            report.outcomes.append(
                PermitOutcome(permit_id=permit.permit_no, status="rejected")
            )
            continue
        except Exception as exc:  # GenerationError·네트워크·쿼터 등 — 배치를 멈추지 않는다
            report.errored += 1
            report.outcomes.append(
                PermitOutcome(
                    permit_id=permit.permit_no,
                    status="error",
                    error=f"{type(exc).__name__}: {exc}",
                )
            )
            continue

        needs_review = sum(
            1 for item in manifest.items for flag in item.needs_review.values() if flag
        )
        report.generated += 1
        if warnings:
            report.with_input_warnings += 1
        report.outcomes.append(
            PermitOutcome(
                permit_id=permit.permit_no,
                status="generated",
                item_count=len(manifest.items),
                input_warnings=warnings,
                needs_review_count=needs_review,
            )
        )

    return report


# --------------------------------------------------------------------------
# FastAPI 앱 (§9.5)
# --------------------------------------------------------------------------

app = FastAPI(title="다국어 안전 소통 모듈 (기능 ④)", version="0.1.0")


def get_client() -> LLMClient:
    """LLM 클라이언트 의존성. 테스트는 app.dependency_overrides 로 가짜를 주입한다."""
    return default_client()


def get_engine() -> TTSEngine:
    """TTS 엔진 의존성. 테스트는 가짜 엔진으로 교체해 네트워크 없이 검증한다."""
    return tts.default_engine()


def get_root() -> Path:
    return storage.default_root()


@app.post("/briefing/generate", response_model=Manifest)
async def generate_briefing(
    permit: PermitApproval,
    lang: str = Query(
        default="",
        description="쉼표로 구분한 언어 코드. 비우면 config.yaml 의 전체 언어",
    ),
    audio: bool = Query(
        default=True,
        description="오디오까지 생성(§9.5). false 면 텍스트만 — 응답이 빠르다",
    ),
    client: LLMClient = Depends(get_client),
    engine: TTSEngine = Depends(get_engine),
    root: Path = Depends(get_root),
) -> Manifest:
    """②승인결과 JSON → 체크리스트·번역·(선택)오디오 일괄 생성·저장 후 매니페스트 반환 (§9.5)."""
    langs = [x.strip() for x in lang.split(",") if x.strip()] or _default_langs()
    try:
        manifest, _ = await generate_and_store(
            permit, langs, root=root, client=client,
            render_audio=audio, engine=engine,
        )
    except RejectedPermitError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except GenerationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return manifest


@app.get("/briefing", response_model=list[str])
async def list_briefings(root: Path = Depends(get_root)) -> list[str]:
    """저장된 허가서 id 목록 (매니페스트가 있는 것만)."""
    return storage.list_permits(root)


@app.get("/briefing/{permit_id}", response_model=Manifest)
async def get_briefing(permit_id: str, root: Path = Depends(get_root)) -> Manifest:
    """저장된 매니페스트 조회 (현장 재생용)."""
    try:
        return storage.load_manifest(root, permit_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"매니페스트 없음: {permit_id}")


@app.get("/briefing/{permit_id}/audio/{lang}/{item_id}")
async def get_audio(
    permit_id: str, lang: str, item_id: str, root: Path = Depends(get_root)
) -> FileResponse:
    """오디오 서빙. T10(TTS) 전까지는 파일이 없으므로 404."""
    path = storage.audio_abs_path(root, permit_id, lang, item_id)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"오디오 없음: {permit_id}/{lang}/{item_id} (T10 미구현이거나 미생성)",
        )
    return FileResponse(path, media_type="audio/mpeg")


# --------------------------------------------------------------------------
# CLI — batch / serve
# --------------------------------------------------------------------------


def _collect_permit_paths(target: str) -> list[Path]:
    p = Path(target)
    if p.is_dir():
        return sorted(p.glob("*.json"))
    if p.is_file():
        return [p]
    # glob 패턴 지원 (예: fixtures/PTW-*.json)
    matches = sorted(Path().glob(target))
    if not matches:
        raise SystemExit(f"허가서 JSON 을 찾지 못함: {target}")
    return matches


def _cmd_batch(args) -> int:
    paths = _collect_permit_paths(args.target)
    langs = [x.strip() for x in args.lang.split(",") if x.strip()] if args.lang else _default_langs()
    root = Path(args.out).resolve() if args.out else storage.default_root()
    render_audio = not args.no_audio

    audio_note = "오디오 포함" if render_audio else "텍스트만"
    print(
        f"배치 시작: {len(paths)}건 → {root} (언어: {', '.join(langs)}, {audio_note})",
        file=sys.stderr,
    )
    report = asyncio.run(run_batch(paths, langs, root=root, render_audio=render_audio))

    # 검수 리포트 (§4-H)
    print("\n" + report.summary_line())
    for o in report.outcomes:
        if o.status == "generated":
            note = f"항목 {o.item_count}"
            if o.needs_review_count:
                note += f", 검토필요 {o.needs_review_count}"
            if o.input_warnings:
                note += f", 입력경고 {len(o.input_warnings)}"
            print(f"  ✓ {o.permit_id}: {note}")
        elif o.status == "rejected":
            print(f"  – {o.permit_id}: 반려 (체크리스트 생성 안 함)")
        else:
            print(f"  ✗ {o.permit_id}: {o.error}")

    # 입력경고 상세 (있을 때만)
    flagged = [o for o in report.outcomes if o.input_warnings]
    if flagged:
        print("\n[입력경고 상세]")
        for o in flagged:
            for w in o.input_warnings:
                print(f"  {o.permit_id}: {w}")

    if args.report:
        Path(args.report).write_text(
            json.dumps(report.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\n리포트 저장: {args.report}", file=sys.stderr)

    return 1 if report.errored else 0


def _cmd_serve(args) -> int:
    import uvicorn

    uvicorn.run("briefing.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="다국어 안전 소통 모듈 (기능 ④)")
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("batch", help="허가서 JSON 디렉터리/파일/글롭을 일괄 처리")
    b.add_argument("target", help="디렉터리, 단일 JSON, 또는 글롭 패턴")
    b.add_argument("--lang", help="쉼표 구분 언어 (기본: config 전체)")
    b.add_argument("--out", help="저장 루트 override")
    b.add_argument("--report", help="검수 리포트 JSON 저장 경로")
    b.add_argument("--no-audio", action="store_true", help="오디오 생성 건너뛰기 (텍스트만)")
    b.set_defaults(func=_cmd_batch)

    s = sub.add_parser("serve", help="FastAPI 서버 실행")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    s.add_argument("--reload", action="store_true")
    s.set_defaults(func=_cmd_serve)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
