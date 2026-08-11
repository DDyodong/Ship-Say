import re
from datetime import datetime

import pdfplumber

from permit_engine import Permit

BOX_EMPTY_CHARS = {"\u25A1", "\u2610"}                                       # □ ☐
BOX_CHECKED_ALT = {"\u2611", "\u2612", "\u25A0", "\u2714", "\u2713", "R", "\uF052"}  # ☑ ☒ ■ ✔ ✓ R \uf052(개발도구)
CIRCLE_EMPTY_CHARS = {"\u25CB", "\uF099"}                                    # ○ (+개발도구 PUA, 미체크)
CIRCLE_FILLED_ALT = {"\u25CF", "\u2B24", "\u26AB", "\uF098"}                 # ● ⬤ ⚫ (+개발도구 PUA, 체크됨)

BOX_ANY = "".join(BOX_EMPTY_CHARS | BOX_CHECKED_ALT)
CIRCLE_ANY = "".join(CIRCLE_EMPTY_CHARS | CIRCLE_FILLED_ALT)

# "☑● 항목명" / "□ ○ 항목명" / "\uf052 \uf098 항목명" (사이 공백 허용)
ITEM_RE = re.compile(rf"([{BOX_ANY}])\s*([{CIRCLE_ANY}])\s*([^{BOX_ANY}{CIRCLE_ANY}|]+)")
BOX_ONLY_RE = re.compile(rf"([{BOX_ANY}])\s*([^{BOX_ANY}{CIRCLE_ANY}]+)")

SUPPLEMENTARY = ["밀폐공간", "정전", "굴착", "방사선", "고소", "중장비"]
ATTACHMENTS = ["작업계획서", "소화기목록", "특수작업절차서", "기술자료", "안전장구목록", "굴착도면"]


def _is_checked(ch):
    return ch in BOX_CHECKED_ALT


def _is_filled(ch):
    return ch in CIRCLE_FILLED_ALT


KNOWN_LABELS = {
    "허가번호", "허가일자", "신청인", "부서", "직책", "성명(서명)", "성명", "(인)",
    "작업허가기간", "허가기간", "정비작업", "신청번호", "장치번호", "장 치 명", "장치명",
    "작업지역(장소)", "작업지역", "작업 개요", "작업개요", "첨부 서류", "첨부서류",
    "발급자", "승인자", "관련부서", "협조자", "확인자", "입회자", "작업자",
}


def _is_placeholder(s):
    """'____', '___', '' 같은 빈 칸 표시이거나, 다른 필드의 라벨 글자인지"""
    if not s:
        return True
    t = s.strip()
    if not t or set(t) <= {"_", "-", "·", ".", " "}:
        return True
    return t in KNOWN_LABELS


def _clean(s):
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"허가기간.*$", "", s)
    s = re.sub(r"확인\s*자.*$", "", s)
    s = re.sub(r"운전원.*$", "", s)   # '부속장구 운전원 이운전'처럼 뒤에 값이 붙는 필드
    s = re.sub(r"\(점검자[^)]*\)", "", s)
    s = re.sub(r"※.*$", "", s)
    s = re.sub(r"(안전조치 요구사항|보충작업허가|가스농도측정결과).*$", "", s)
    return s.strip(" :·,|")


# ══════════════════════════════════════════════════════
# 표 → 허가서 단위로 분할
# ══════════════════════════════════════════════════════
def _extract_rows(pdf_path):
    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    cells = [c.strip() if c else "" for c in row]
                    if any(cells):
                        rows.append(cells)
    return rows


PERMIT_ID_LABELS = ["허가번호"]


def _split_by_permit(rows):
    """허가번호(류) 라벨이 나올 때마다 새 허가서 시작.
    한 PDF에 여러 양식이 이어붙어 있는 경우(원본 템플릿) 대응."""
    groups, cur = [], []
    for r in rows:
        first = r[0] if r else ""
        if any(first.startswith(lbl) for lbl in PERMIT_ID_LABELS) and cur:
            groups.append(cur)
            cur = []
        cur.append(r)
    if cur:
        groups.append(cur)
    return groups


def _split_text_by_permit(text):
    # 텍스트를 허가서 단위로 분할
    label_pat = "|".join(PERMIT_ID_LABELS)
    lines = text.split("\n")
    starts = []
    for i, line in enumerate(lines):
        if re.match(rf"\s*(?:{label_pat})\s*\S", line):
            begin = i
            if i > 0 and re.search(r"작\s*업\s*허\s*가\s*서\s*$", lines[i - 1]):
                begin = i - 1
            starts.append(begin)

    if not starts:
        return [text] if any(lbl in text for lbl in PERMIT_ID_LABELS) else []

    chunks = []
    for idx, s in enumerate(starts):
        e = starts[idx + 1] if idx + 1 < len(starts) else len(lines)
        chunks.append("\n".join(lines[s:e]))
    return chunks


def _find_row(rows, label):

    key = label.replace(" ", "")
    for r in rows:
        for cell in r:
            if cell and cell.replace(" ", "").startswith(key):
                return r
    return None


def _find_label_index(row, label):
    """행 안에서 라벨이 들어있는 셀의 인덱스를 찾음."""
    key = label.replace(" ", "")
    for i, cell in enumerate(row):
        if cell and cell.replace(" ", "").strip() == key:
            return i
    # 정확히 일치하는 게 없으면 시작하는 것으로 재시도
    for i, cell in enumerate(row):
        if cell and cell.replace(" ", "").startswith(key):
            return i
    return -1


def _row_value(row, skip=1, label=None):
    """라벨 다음 '첫 비어있지 않은 셀'을 값으로 반환.
    label을 주면 그 라벨 칸의 위치를 직접 찾아서 그 뒤부터 탐색
    (라벨이 r[0]이 아닌 경우까지 대응). label 없으면 기존처럼 skip 인덱스부터."""
    if not row:
        return ""
    start = skip
    if label is not None:
        idx = _find_label_index(row, label)
        if idx >= 0:
            start = idx + 1
    for cell in row[start:]:
        if cell and cell.strip() and not _is_placeholder(cell):
            return cell.strip()
    return ""


def _row_values_after(row, label, count=1):
    """라벨 뒤에 오는 값을 여러 개(count) 순서대로 반환 (예: 허가번호, 허가일자
    두 라벨이 한 행에 같이 있을 때 각각의 값을 따로 뽑기 위함)."""
    idx = _find_label_index(row, label)
    if idx < 0:
        return [""] * count
    vals = []
    i = idx + 1
    while len(vals) < count and i < len(row):
        cell = row[i]
        if cell and cell.strip() and not _is_placeholder(cell):
            vals.append(cell.strip())
        i += 1
    while len(vals) < count:
        vals.append("")
    return vals


def _row_all_values_after(row, label):
    """라벨 뒤에 오는 '비어있지 않은 모든 셀'을 공백으로 이어붙여서 반환.
    첨부서류처럼 항목 하나하나가 별도 셀로 잘게 쪼개진 경우, 첫 셀만으론
    부족하고 뒤에 오는 셀을 전부 모아야 함."""
    idx = _find_label_index(row, label)
    if idx < 0:
        return ""
    parts = []
    for cell in row[idx + 1:]:
        if cell and cell.strip() and not _is_placeholder(cell):
            parts.append(cell.strip())
    return " ".join(parts)


# ══════════════════════════════════════════════════════
# 필드 파서
# ══════════════════════════════════════════════════════
def _parse_date_only(date_str):
    """'2026.07.31' 같은 단일 날짜 문자열을 datetime으로 변환.
    작업허가기간(_parse_period)과 같은 DATE 패턴을 재사용해서,
    허가일자 vs 작업기간 시작일 비교(X04)에 쓴다."""
    if not date_str:
        return None
    m = re.search(r"(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?", date_str)
    if not m:
        return None
    y, mo, d = (int(x) for x in m.groups())
    try:
        return datetime(y, mo, d)
    except ValueError:
        return None


def _parse_period(text):
    # 작업허가기간 파싱. 구분자(. - / 년월일)와 범위 표기(부터~까지, ~, -, to)를 최대한 넓게 인식


    DATE = r"(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?"
    TIME = r"(\d{1,2})\s*[:시]\s*(\d{2})\s*분?"
    SEP = r"(?:부터|~|-|–|—|to|TO|내지)"

    # 기존 확정 형식 (안정성 위해 먼저 시도)
    m = re.search(rf"{DATE}\.\s*{TIME}\s*부터\s*{TIME}\s*까지", text)
    if m:
        y, mo, d, sh, sm, eh, em = (int(x) for x in m.groups())
        return datetime(y, mo, d, sh, sm), datetime(y, mo, d, eh, em)

    # 종료일이 시작일과 다른 경우 (날짜가 두 번 나옴)
    m = re.search(rf"{DATE}\.?\s*{TIME}\s*{SEP}\s*{DATE}\.?\s*{TIME}\s*(?:까지)?", text)
    if m:
        vals = [int(x) for x in m.groups()]
        y1, mo1, d1, sh1, sm1, y2, mo2, d2, eh1, em1 = vals
        return datetime(y1, mo1, d1, sh1, sm1), datetime(y2, mo2, d2, eh1, em1)

    # 같은 날짜, 시간만 두 번 (가장 흔한 형식)
    m = re.search(rf"{DATE}\.?\s*{TIME}\s*{SEP}\s*{TIME}\s*(?:까지)?", text)
    if m:
        y, mo, d, sh, sm, eh, em = (int(x) for x in m.groups())
        return datetime(y, mo, d, sh, sm), datetime(y, mo, d, eh, em)

    return None, None


def _parse_zone(rows, text):
    row = _find_row(rows, "작업지역")
    raw = _row_value(row, label="작업지역") if row else ""
    if not raw:
        m = re.search(r"작업지역\(장소\)\s*([^\n]+)", text)
        raw = m.group(1).strip() if m else ""
        raw = re.sub(r"장\s*치\s*명.*$", "", raw).strip()
    if "·" in raw:
        a, b = raw.split("·", 1)
        return a.strip(), b.strip()
    return raw, ""


def _parse_attachments(rows, text):
    row = _find_row(rows, "첨부 서류") or _find_row(rows, "첨부서류")
    src = _row_all_values_after(row, "첨부") if row else ""
    if not src:
        m = re.search(r"첨부\s*서류\s*:?([^\n]*)", text)
        src = m.group(1) if m else ""
    found = []
    for box, name in BOX_ONLY_RE.findall(src):
        if not _is_checked(box):
            continue
        name = _clean(name)
        for a in ATTACHMENTS:
            if a in name:
                found.append(a)
    return found


def _parse_risk_assessment(rows, text):
    row = _find_row(rows, "작업 전 위험성평가")
    src = _row_all_values_after(row, "작업 전 위험성평가") if row else ""
    if not src:
        m = re.search(r"작업\s*전\s*위험성평가\s*:?([^\n]*)", text)
        src = m.group(1) if m else ""

    def reviewed(keyword_pat):
        seg = re.search(rf"{keyword_pat}\s*([{BOX_ANY}])\s*유\s*([{BOX_ANY}])\s*무", src)
        if not seg:
            return False
        # 유/무 중 하나라도 체크되어 있으면 '검토했다'로 본다
        return _is_checked(seg.group(1)) or _is_checked(seg.group(2))

    # '변화·작업 상이'(원본) / '변화 작업 상이'(작성본) 둘 다 매칭
    return reviewed("필요작업절차서"), reviewed(r"변화\s*[·]?\s*작업\s*상이")


def _parse_marks(text):
    """☑(필요)/●(확인) 수집 + ☐인데 ●인 불일치 기록"""
    marked, confirmed, mismatches = [], [], []
    for box, circle, name in ITEM_RE.findall(text):
        name = _clean(name)
        if not name or len(name) < 2:
            continue
        boxed, filled = _is_checked(box), _is_filled(circle)
        if boxed:
            marked.append(name)
        if filled:
            confirmed.append(name)
        if filled and not boxed:
            mismatches.append(f"'{name}': 필요(☑) 표시 없이 확인(●)만 되어 있음 — 신청서 확인 필요")
    return marked, confirmed, mismatches


def _parse_gas(rows, text):
    # 가스농도측정 실측값 표 파싱
    header_idx = None
    for i, r in enumerate(rows):
        joined = "".join(c for c in r if c).replace(" ", "")
        if "물질명" in joined and "결과" in joined:
            header_idx = i
            break
    if header_idx is None or header_idx + 1 >= len(rows):
        return {}

    KEY_MAP = {"HC": "HC", "O2": "O2", "O₂": "O2", "CO2": "CO2", "CO₂": "CO2",
               "CO": "CO", "H2S": "H2S", "H₂S": "H2S", "LEL": "LEL"}

    out = {}
    checked = 0
    for r in rows[header_idx + 1:]:
        vals = [c.strip() for c in r if c and c.strip()]
        if not vals:
            continue  # 완전히 빈 행은 개수에 포함하지 않고 건너뜀
        if any("기타" in v and "특별사항" in v for v in vals):
            break  # 다음 섹션 시작 — 가스표는 여기서 끝
        checked += 1
        if checked > 10:
            break
        # 좌측 세트: 물질명, 결과, 측정시간, 측정자  /  우측 세트도 동일 패턴 반복
        i = 0
        while i < len(vals):
            name = vals[i]
            key = KEY_MAP.get(name.replace(" ", ""))
            if key and i + 1 < len(vals):
                m = re.search(r"[\d.]+", vals[i + 1])
                if m:
                    out[key] = float(m.group())
                i += 4  # 물질명·결과·측정시간·측정자 4칸씩 건너뜀
            else:
                i += 1
    return out


def _parse_work_types(rows, text, form_type):
    """보충작업허가 6종 중 ☑ 표시된 것.
    원본은 '고 소 □'처럼 글자 사이 공백이 있음 → 글자별 \\s* 허용"""
    types = ["화기"] if form_type == "화기" else []
    for name in SUPPLEMENTARY:
        pat = r"\s*".join(name)
        # 표에서 먼저 찾고, 없으면 전체 텍스트에서
        found = False
        for r in rows:
            if r and re.match(rf"^{pat}\s*[{BOX_ANY}]", r[0].strip()):
                m = re.search(rf"{pat}\s*([{BOX_ANY}])", r[0])
                if m and _is_checked(m.group(1)):
                    types.append(name)
                found = True
                break
        if not found:
            m = re.search(rf"^{pat}\s*([{BOX_ANY}])", text, re.MULTILINE)
            if m and _is_checked(m.group(1)):
                types.append(name)
    return types


def _parse_excavation_inspectors(text):

    m = re.search(r"점검자\s*([^\s)]+)", text)
    if m and not _is_placeholder(m.group(1)) and m.group(1) not in KNOWN_LABELS:
        return m.group(1)
    return ""


def _parse_worker_witness(text):
# 안전조치 확인쪽은 혹시 몰라 보조로만 남겨둠
    worker = witness = ""

    m = re.search(r"작업완료\s*시간\s*[^\n]*?입회자\s*(.+?)[^\S\n]*작업자[^\S\n]*([^\n]+)", text)
    if m:
        w1, wk1 = m.group(1), m.group(2)
        if not _is_placeholder(w1) and w1 not in KNOWN_LABELS:
            witness = w1
        if not _is_placeholder(wk1) and wk1 not in KNOWN_LABELS:
            worker = wk1

    if not witness:
        m2 = re.search(r"책임자\s*([^\s(]+)\s*\(서명\)[^가-힣]*입회자\s*([^\s(]+)\s*\(서명\)", text)
        if m2 and not _is_placeholder(m2.group(2)):
            witness = m2.group(2)

    return worker, witness


def _parse_signatures(text):

    warnings = []

    def grab(label):
        """ '성명(서명)'처럼 라벨 자체에 괄호가 붙어 있는 경우가 있음(원문 확인됨).
        '성명' 바로 뒤 토큰이 실제 이름이 아니라 라벨의 일부(예: '(서명)')일 수 있어,
        괄호로만 이루어진 토큰은 건너뛰고 그다음 '진짜 글자'를 이름으로 잡는다. """ 
        m = re.search(
            rf"{label}\s*부서\s*[:：]?\s*(\S+)\s*직책\s*[:：]?\s*(\S+)\s*"
            rf"성명\s*[:：]?\s*(?:\([^)]*\)\s*)?([^\s(]+)",
            text
        )
        if not m:
            return ""
        vals = m.groups()
        if any(_is_placeholder(v) for v in vals):
            return ""
        return "/".join(vals)

    applicant = grab("신청인")

    # 부서/직책/성명 조합 전체를 순서대로 수집 (신청인 제외)
    tuples = []
    for m in re.finditer(
        r"부서\s*[:：]?\s*(\S+)\s*직책\s*[:：]?\s*(\S+)\s*성명\s*[:：]?\s*(?:\([^)]*\)\s*)?([^\s(]+)",
        text
    ):
        vals = m.groups()
        if any(_is_placeholder(v) for v in vals):
            continue
        joined = "/".join(vals)
        if joined != applicant:
            tuples.append(joined)

    issuer = tuples[0] if len(tuples) >= 1 else ""
    approver = tuples[1] if len(tuples) >= 2 else ""

    if issuer:
        warnings.append(f"발급자({issuer})는 표 레이아웃 순서로 추정한 값 — 원본 확인 권장")
    if approver:
        warnings.append(f"승인자({approver})는 표 레이아웃 순서로 추정한 값 — 원본 확인 권장")
    # 발급자·승인자 서명이 둘 다 비어 있는 경우 경고를 띄우던 부분 — 관리자 화면에서
    # 매번 뜨는 게 번거롭다는 요청으로 제거함. issuer/approver 값 자체는 그대로 비워둔
    # 채 반환되므로, 서명이 비었다는 사실 자체는 데이터에 남아있고 화면에만 안 뜬다.

    return applicant, issuer, approver, warnings


def _parse_confirmers(text, work_types):
    # 보충작업허가 확인자 서명 추출.
    section_start = text.find("보충작업허가")
    search_area = text[section_start:] if section_start >= 0 else text

    out = {}
    for wt in work_types:
        if wt == "화기":
            continue
        pat = r"\s*".join(wt)
        m = re.search(rf"{pat}.*?확인\s*자\s*([^\s(]+)", search_area, re.DOTALL)
        if m and not _is_placeholder(m.group(1)) and m.group(1) not in ("(서명)",):
            out[wt] = m.group(1)
    return out


def _parse_equipment_value(text):
    KNOWN_ITEM_WORDS = {"자격증", "현장책임자", "기상", "전선", "신호수", "부속장구", "매트", "운전원"}
    skip_chars = BOX_ANY + CIRCLE_ANY

    def _clean_val(v):
        return v if v and not _is_placeholder(v) else ""

    # 신 배치: 라벨 바로 옆
    m = re.search(
        rf"투입\s*장비\s*[:：]?\s*[{re.escape(skip_chars)}\s():]*"
        rf"([^\s{re.escape(skip_chars)}():][^\s():]*)",
        text
    )
    val = _clean_val(m.group(1)) if m else ""
    if val and val not in KNOWN_ITEM_WORDS:
        return val

    # 구 배치 예비 시도: '신호수' 바로 앞의 순수 글자 토큰
    m2 = re.search(
        rf"([^\s{re.escape(skip_chars)}():]+)\s*[{re.escape(skip_chars)}\s]*신\s*호\s*수",
        text
    )
    if m2:
        val2 = _clean_val(m2.group(1))
        if val2 and val2 not in KNOWN_ITEM_WORDS:
            return val2

    return ""


def _parse_driver_value(text):
    skip_chars = BOX_ANY + CIRCLE_ANY
    m = re.search(
        rf"운전원\s*[{re.escape(skip_chars)}\s]*"
        rf"([^\s{re.escape(skip_chars)}][^\s]*)",
        text
    )
    if not m:
        return ""
    val = m.group(1)
    if not val or _is_placeholder(val) or "허가기간" in val:
        return ""
    return val


# ⚠️ 2026-08 신규: 기존 7개(화기·밀폐공간·정전·굴착·방사선·고소·중장비)는
# 전부 양식의 "제목" 또는 "보충작업허가 체크박스"로 확정되는 유형이다.
# 그런데 "도장"·"전기작업"은 우리 양식 어디에도 체크박스가 없다 — 실제
# 종이양식을 바꾸는 건 조직적 절차(안전관리 부서 승인 등)가 필요해 우리
# 선에서 당장 할 수 없으므로, 대신 "작업개요" 텍스트에서 키워드로 추정한다.
# ⚠️ 체크박스보다 신뢰도가 낮으므로, Permit.inferred_types에 "이건 추정"
# 이라는 사실을 별도로 남겨서 화면·저장 시 구분 표시한다.
#
# 근거:
#  - 도장: 2025 조선업 중대재해 사례집 Part.6(독립 챕터), 실제 사망사고
#    (RO탱크 스프레이 도장 중 화재·폭발 4명 사망) 기록, 공식 점검표에
#    "도장 및 화기작업 분리 수행 여부" 항목 존재
#  - 전기작업: 산업안전보건기준에 관한 규칙 제318조(전기작업자의 제한)에
#    정식 정의됨. 제38조(사전조사 및 작업계획서 작성 대상)에서 굴착·중량물
#    취급과 동일한 목록에 포함되는 법적 고위험작업
INFERRED_MAIN_WORK_KEYWORDS = {
    # ⚠️ 실사용 검증 중 발견: 단독 '도장' 키워드는 '도장 전/도장 후'처럼
    # 시간 표현에도 걸려서 오탐 발생(예: '도장 전 육안 검사' — 실제로는
    # 청소·검사 작업인데 도장으로 잘못 감지됨). '도장작업/도장공정'처럼
    # 명확한 행위 표현으로만 좁힘.
    "도장": ["도장작업", "도장공정", "도료도포", "도색", "페인트", "도료",
            "스프레이", "터치업", "방청", "표면처리", "전처리", "블라스팅",
            "산세척", "시너", "안료"],
    "전기작업": ["배선", "케이블포설", "전기설비 점검", "패널작업",
                "단자작업", "활선작업", "활선근접작업"],
}


def _infer_main_works_from_summary(work_summary):
    """작업개요 텍스트에서 키워드로 신규 유형(도장·전기작업)을 추정.
    체크박스가 없는 유형이라 신뢰도가 낮음 — 호출 측에서 반드시
    inferred_types에 별도 기록해 "추정"임을 표시해야 한다."""
    if not work_summary:
        return []
    found = []
    for wt, keywords in INFERRED_MAIN_WORK_KEYWORDS.items():
        for kw in keywords:
            if kw.replace(" ", "") in work_summary.replace(" ", ""):
                found.append(wt)
                break
    return found


# 허가서 1건 파싱
def _parse_one(rows, text):
    form_type = "화기" if "화기작업허가서" in text.replace(" ", "") else "일반위험"

    pid_row = None
    matched_label = None
    for lbl in PERMIT_ID_LABELS:
        pid_row = _find_row(rows, lbl)
        if pid_row:
            matched_label = lbl
            break

    permit_id = issue_date = ""
    if pid_row:
        permit_id, = _row_values_after(pid_row, matched_label, count=1)
        for date_lbl in ["허가일자", "발급일자", "작성일자", "신청일자"]:
            issue_date, = _row_values_after(pid_row, date_lbl, count=1)
            if issue_date:
                break
    if not permit_id:
        m = re.search(r"(PTW-[\d-]+)", text)
        permit_id = m.group(1) if m else ""

    start, end = _parse_period(text)
    zone, area_type = _parse_zone(rows, text)

    summary_row = _find_row(rows, "작업 개요") or _find_row(rows, "작업개요")
    work_summary = _row_value(summary_row, label="작업 개요") if summary_row else ""
    work_summary = re.sub(r"\s+", " ", work_summary).strip()

    attachments = _parse_attachments(rows, text)
    risk_assessment, change_review = _parse_risk_assessment(rows, text)
    marked, confirmed, mismatches = _parse_marks(text)
    work_types = _parse_work_types(rows, text, form_type)
    inferred_types = _infer_main_works_from_summary(work_summary)
    for wt in inferred_types:
        if wt not in work_types:
            work_types.append(wt)
    equipment_type = driver_name = ""
    if "중장비" in work_types:
        equipment_type = _parse_equipment_value(text)
        driver_name = _parse_driver_value(text)
    gas_results = _parse_gas(rows, text)
    applicant, issuer, approver, sig_warn = _parse_signatures(text)
    worker_name, witness_name = _parse_worker_witness(text)
    excavation_inspector = _parse_excavation_inspectors(text)
    confirmers = _parse_confirmers(text, work_types)

    warnings = list(sig_warn) + mismatches
    if not permit_id:
        warnings.append("허가번호를 찾지 못함")
    # ⚠️ 2026-08 정정: 예전엔 work_types가 비면 무조건 "작업유형을 판정하지
    #    못함"이라고 경고했는데, 지침 제3장 정의상 '일반위험작업'은 화염·스파크
    #    발생 작업 '이외의' 작업을 포괄하는 범주라 주작업이 안 잡히는 게 정상임
    #    (실제 샘플 19건 중 9건이 이 경우). 보충작업까지 하나도 없을 때만
    #    "정말 아무 정보가 없다"는 뜻이므로 그 경우에만 경고한다.
    if not work_types:
        warnings.append("작업유형·보충작업이 하나도 확인되지 않음 — 관리자 직접 확인 필요")

    p = Permit(
        permit_id=permit_id, form_type=form_type, work_types=work_types,
        start=start, end=end, zone=zone, area_type=area_type,
        work_summary=work_summary, issue_date=issue_date,
        issue_date_dt=_parse_date_only(issue_date),
        marked_required=marked, confirmed=confirmed,
        attachments=attachments,
        risk_assessment=risk_assessment, change_review=change_review,
        applicant=applicant, issuer=issuer, approver=approver,
        supplementary_confirmer=confirmers, gas_results=gas_results,
        equipment_type=equipment_type, driver_name=driver_name,
        worker_name=worker_name, witness_name=witness_name,
        excavation_inspector=excavation_inspector,
        inferred_types=inferred_types,
    )
    p._parse_warnings = warnings
    return p


def parse_pdf(pdf_path):
    """PDF 1개에서 허가서 여러 건을 모두 추출."""
    rows = _extract_rows(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        full_text = "\n".join((pg.extract_text() or "") for pg in pdf.pages)

    row_groups = _split_by_permit(rows)
    text_groups = _split_text_by_permit(full_text)

    # 표 그룹과 텍스트 그룹 개수가 맞으면 1:1 매칭, 아니면 전체 텍스트 사용
    permits = []
    for i, rg in enumerate(row_groups):
        tg = text_groups[i] if i < len(text_groups) else full_text
        permits.append(_parse_one(rg, tg))
    return permits


# 진단 모드: python ptw_parser.py <파일> --diag
def _diagnose(path):
    import pdfplumber as _pp
    print(f"pdfplumber 버전: {_pp.__version__}")
    with _pp.open(path) as pdf:
        print(f"페이지 수: {len(pdf.pages)}")
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            text = page.extract_text() or ""
            print(f"  [페이지{i}] 표 개수: {len(tables)}  /  텍스트 길이: {len(text)}자")
            if tables:
                print(f"           표 첫 행 예시: {tables[0][0] if tables[0] else '(빈 표)'}")
            else:
                print(f"           ⚠️ 표가 하나도 감지되지 않음")
            if text:
                print(f"           텍스트 앞부분: {text[:80]!r}")


if __name__ == "__main__":
    import sys
    if "--diag" in sys.argv:
        target = [a for a in sys.argv[1:] if a != "--diag"][0]
        _diagnose(target)
        sys.exit(0)
    path = sys.argv[1] if len(sys.argv) > 1 else "작업허가서.pdf"
    permits = parse_pdf(path)
    print(f"추출된 허가서: {len(permits)}건\n")
    for p in permits:
        print("=" * 68)
        print(f"허가번호 : {p.permit_id}  ({p.form_type}작업허가서)")
        print(f"기간     : {p.start} ~ {p.end}")
        print(f"구역     : {p.zone}" + (f" / {p.area_type}" if p.area_type else ""))
        print(f"주작업   : {p.main_work_label}")
        print(f"보충작업 : {p.conditions}")
        print(f"개요     : {p.work_summary[:65]}")
        print(f"첨부     : {p.attachments}")
        print(f"위험성평가: {p.risk_assessment} / 변화검토: {p.change_review}")
        print(f"필요(☑)  : {len(p.marked_required)}건   확인(●): {len(p.confirmed)}건")
        print(f"가스     : {p.gas_results}")
        print(f"서명     : 신청={p.applicant or '✗'} 발급={p.issuer or '✗'} 승인={p.approver or '✗'}")
        print(f"보충확인자: {p.supplementary_confirmer}")
        if getattr(p, "_parse_warnings", None):
            print("⚠️ 파싱 경고:")
            for w in p._parse_warnings:
                print(f"   - {w}")
        print()