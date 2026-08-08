import json
from io import BytesIO

from fastapi.testclient import TestClient
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from main import app


client = TestClient(app)


def sample_permit_pdf():
    buffer = BytesIO()
    pdfmetrics.registerFont(UnicodeCIDFont("HYSMyeongJo-Medium"))
    style = ParagraphStyle("Korean", fontName="HYSMyeongJo-Medium", fontSize=12)
    document = SimpleDocTemplate(buffer, pagesize=A4)
    rows = [
        ["허가번호", "PTW-2026-9001", "허가일자", "2026.08.06"],
        ["작업허가기간", "2026.08.06 09:00 ~ 2026.08.06 18:00", "", ""],
        ["작업지역(장소)", "B-11", "", ""],
        ["작업 개요", "용접 작업", "", ""],
        ["신청인", "김신청", "작업자", "이작업"],
    ]
    table = Table(rows, colWidths=[95, 190, 70, 100])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "HYSMyeongJo-Medium"),
        ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    document.build([Paragraph("화기작업허가서", style), Spacer(1, 10), table])
    return buffer.getvalue()


def test_health_reports_rule_inventory():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["permit_rule_count"] == 63
    assert response.json()["conflict_rule_count"] == 20


def test_rejects_non_pdf_content():
    response = client.post(
        "/v1/analyze",
        files={"file": ("permit.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert response.status_code == 415


def test_rejects_invalid_existing_permit_json():
    response = client.post(
        "/v1/analyze",
        files={"file": ("permit.pdf", b"%PDF-invalid", "application/pdf")},
        data={"existing_permits_json": json.dumps({"not": "an array"})},
    )
    assert response.status_code == 400


def test_analyzes_a_generated_work_permit_pdf_end_to_end():
    existing = [{
        "permit_id": "PTW-2026-EXISTING",
        "main_works": [],
        "conditions": ["중장비"],
        "zone": "B-11",
        "period": {"start": "2026-08-06T10:00:00", "end": "2026-08-06T12:00:00"},
    }]
    response = client.post(
        "/v1/analyze",
        files={"file": ("permit.pdf", sample_permit_pdf(), "application/pdf")},
        data={"expected_permit_no": "PTW-2026-9001", "existing_permits_json": json.dumps(existing)},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["parsed_permit"]["permit_id"] == "PTW-2026-9001"
    assert payload["parsed_permit"]["period"]["start"] == "2026-08-06T09:00:00"
    assert payload["parsed_permit"]["zone"] == "B-11"
    assert payload["permit_number_matches"] is True
    assert payload["decision"] in {"승인", "조건부 승인", "반려"}
    assert any(conflict["rule_id"] == "C004" for conflict in payload["pair_conflicts"])
