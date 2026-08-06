from __future__ import annotations

import json
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from permit_engine import Permit, load_matrix, load_rules, run_with_existing
from ptw_parser import parse_pdf


LOGGER = logging.getLogger("permit-analysis")
ENGINE_NAME = "ptw-rule-engine"
ENGINE_VERSION = "2026.08.06"
MAX_PDF_SIZE = 10 * 1024 * 1024

app = FastAPI(
    title="Work Permit Analysis Service",
    version=ENGINE_VERSION,
    description="작업허가서 PDF 파싱, 단일허가 규칙 판정, SIMOPS 충돌 분석 서비스",
)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _permit_from_snapshot(snapshot: dict[str, Any]) -> Permit:
    period = snapshot.get("period") or {}
    main_works = snapshot.get("main_works") or []
    conditions = snapshot.get("conditions") or []
    legacy_types = snapshot.get("work_types") or []
    if isinstance(main_works, str):
        main_works = [main_works]
    if isinstance(conditions, str):
        conditions = [conditions]
    if isinstance(legacy_types, str):
        legacy_types = [legacy_types]

    return Permit(
        permit_id=str(snapshot.get("permit_id") or snapshot.get("permit_no") or ""),
        form_type=str(snapshot.get("form_type") or "일반위험"),
        main_works=list(main_works),
        conditions=list(conditions),
        work_types=[] if main_works or conditions else list(legacy_types),
        start=_parse_datetime(period.get("start") or snapshot.get("start_time")),
        end=_parse_datetime(period.get("end") or snapshot.get("end_time")),
        zone=str(snapshot.get("zone") or snapshot.get("block_code") or ""),
        work_summary=str(snapshot.get("work_summary") or snapshot.get("work_content") or ""),
    )


def _load_existing(raw: str | None) -> list[Permit]:
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exception:
        raise HTTPException(status_code=400, detail="existing_permits_json이 올바른 JSON이 아닙니다.") from exception
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="existing_permits_json은 배열이어야 합니다.")
    return [_permit_from_snapshot(item) for item in payload if isinstance(item, dict)]


def _decision_for(permit_id: str, result: dict[str, Any]) -> tuple[str, str]:
    risk_order = {"승인": 0, "보류": 1, "반려": 2}
    overall = "승인"
    issues = [
        item
        for item in result["permit_violations"] + result["pair_conflicts"]
        if item.get("permit_id") == permit_id or permit_id in item.get("permits", ())
    ]
    for issue in issues:
        risk = issue.get("risk", "승인")
        if risk_order.get(risk, 0) > risk_order[overall]:
            overall = risk
    return {"승인": "승인", "보류": "조건부 승인", "반려": "반려"}[overall], overall


@app.get("/health")
def health() -> dict[str, Any]:
    matrix = load_matrix()
    return {
        "status": "ok",
        "engine": ENGINE_NAME,
        "version": ENGINE_VERSION,
        "permit_rule_count": len(load_rules()),
        "conflict_rule_count": len(matrix) // 2,
    }


@app.post("/v1/analyze")
async def analyze(
    file: UploadFile = File(...),
    expected_permit_no: str | None = Form(default=None),
    existing_permits_json: str | None = Form(default=None),
) -> dict[str, Any]:
    filename = file.filename or "permit.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="PDF 작업허가서만 분석할 수 있습니다.")

    existing = _load_existing(existing_permits_json)
    content = await file.read()
    if len(content) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF는 10MB 이하만 분석할 수 있습니다.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="파일 내용이 PDF 형식이 아닙니다.")

    try:
        with tempfile.TemporaryDirectory(prefix="permit-analysis-") as temp_dir:
            pdf_path = Path(temp_dir) / "permit.pdf"
            pdf_path.write_bytes(content)
            permits = parse_pdf(pdf_path)
    except Exception as exception:
        LOGGER.exception("작업허가서 PDF 파싱 실패")
        raise HTTPException(status_code=422, detail=f"작업허가서 PDF를 파싱하지 못했습니다: {exception}") from exception

    if not permits:
        raise HTTPException(status_code=422, detail="PDF에서 작업허가서 양식을 찾지 못했습니다.")
    if len(permits) != 1:
        raise HTTPException(status_code=422, detail=f"1개 허가서 PDF만 지원합니다. 감지된 허가서: {len(permits)}개")

    permit = permits[0]
    result = run_with_existing([permit], existing)
    decision, overall_risk = _decision_for(permit.permit_id, result)
    violations = [item for item in result["permit_violations"] if item.get("permit_id") == permit.permit_id]
    conflicts = [item for item in result["pair_conflicts"] if permit.permit_id in item.get("permits", ())]
    recommendations = list(
        dict.fromkeys(
            item.get("resolution")
            for item in violations
            if item.get("resolution")
        )
    )
    parsed = permit.to_dict()
    parsed["parse_warnings"] = list(getattr(permit, "_parse_warnings", []))
    permit_number_matches = not expected_permit_no or expected_permit_no.strip() == permit.permit_id.strip()

    summary = (
        f"{decision}: 단일허가 위반 {len(violations)}건, "
        f"동시작업 충돌 {len(conflicts)}건이 확인되었습니다."
    )
    return {
        "schema_version": "1.0",
        "engine": ENGINE_NAME,
        "engine_version": ENGINE_VERSION,
        "decision": decision,
        "overall_risk": overall_risk,
        "summary": summary,
        "permit_number_matches": permit_number_matches,
        "expected_permit_no": expected_permit_no,
        "parsed_permit": parsed,
        "permit_violations": violations,
        "pair_conflicts": conflicts,
        "recommended_conditions": recommendations,
    }
