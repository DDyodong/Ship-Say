import csv
from collections import defaultdict
import re
from dataclasses import dataclass, field
from datetime import datetime
from itertools import combinations
from pathlib import Path

BASE_DIR = Path(__file__).parent
RISK_ORDER = {"승인": 0, "보류": 1, "반려": 2}

# ⚠️ 2026-08: KOSHA 안전작업허가지침(P-94-2019)의 분류 체계를 그대로 반영.
#   · 주작업 = "무슨 일을 하는가" (제3·4장의 화기작업 / 일반위험작업)
#   · 보충작업 = "어디서·무엇으로·어떤 절차로 하는가" (제4.1항의 6종)
# 예전엔 이 둘을 work_types 하나에 섞어 담았는데, 냉정히 보면 7개 중
# '작업 행위'를 뜻하는 건 화기뿐이고 나머지는 장소(밀폐공간·고소)·장비
# (중장비·방사선)·절차(정전)라서 성격이 완전히 달랐음.
MAIN_WORK_TYPES = ["화기", "도장", "전기작업"]
CONDITION_TYPES = ["밀폐공간", "정전", "굴착", "방사선", "고소", "중장비"]

# 법령상 '적정공기' 전체 정의 = 제618조 제3호(수치 확인됨: 산업안전보건기준에
# 관한 규칙 제618조 제3호 "적정공기란 산소농도의 범위가 18% 이상 23.5% 미만,
# 이산화탄소 1.5% 미만, 일산화탄소 30ppm 미만, 황화수소 10ppm 미만인 수준의
# 공기를 말한다"). KOSHA 안전작업허가지침(P-94-2019) 별지 양식1·2에 인쇄된
# 참고 수치("1.HC:0%, 2.O2:18%이상, 3.CO:30ppm미만, 4.CO2:1.5%미만,
# 5.H2S:10ppm미만")는 O2 하한만 적고 상한(23.5%)은 생략돼 있음 — 그래서
# ⚠️ 2026-08-06까지는 코드도 양식 인쇄 문구를 그대로 따라 O2 하한만 검사하고
# 있었음(산소 과잉 상태도 그 자체로 화재·폭발 위험을 높이는데 못 잡던 공백).
# 사용자 요청으로 permit_rules.csv/conflict_matrix.csv를 법령 원문과 전수
# 대조하다가 발견해서 법령 원문 그대로(상한 23.5% 미만 포함) 수정함.
# HC(탄화수소)는 제618조 '적정공기' 정의 4개 항목엔 포함 안 되고 양식의
# 화기작업 가스농도측정 참고수치에서만 등장 — 화기작업 인화성가스 측정
# 관행(가연성가스 0% 확인 후 작업) 근거로 별도 유지.
GAS_LIMITS = {
    "HC":  ([("<=", 0.0)],              "%",   "탄화수소"),
    "O2":  ([(">=", 18.0), ("<", 23.5)], "%",  "산소"),
    "CO":  ([("<",  30.0)],             "ppm", "일산화탄소"),
    "CO2": ([("<",  1.5)],              "%",   "이산화탄소"),
    "H2S": ([("<",  10.0)],             "ppm", "황화수소"),
}


@dataclass
class Permit:
    permit_id: str = ""
    form_type: str = "일반위험"           # 화기 | 일반위험

    # ⚠️ 2026-08 구조 개편: 예전엔 work_types 하나에 주작업과 보충작업을
    # 전부 섞어서 담았는데, KOSHA 안전작업허가지침(P-94-2019)은 이 둘을
    # 명확히 구분한다 —
    #   · 제4장: 허가 종류를 '화기작업허가', '일반위험작업허가',
    #     '보충적인 작업허가'로 구분
    #   · 제3장: '보충적인 작업'은 화기/일반위험작업을 하는 과정에서
    #     보충적으로 병행 수행되는 작업(밀폐공간·정전·굴착·방사선·고소·중장비 6종)
    # 지침의 이 분류 체계를 코드 구조에 그대로 반영하기 위해 두 필드로 분리함.
    main_works: list = field(default_factory=list)   # 주작업(화기·도장·전기작업)
    conditions: list = field(default_factory=list)   # 보충작업 6종

    start: datetime = None
    end: datetime = None
    zone: str = ""
    area_type: str = ""
    work_summary: str = ""
    issue_date: str = ""
    issue_date_dt: datetime = None

    # 양식의 2단계 체크
    marked_required: list = field(default_factory=list)   # □ 표시
    confirmed: list = field(default_factory=list)         # ○ 표시

    attachments: list = field(default_factory=list)       # 첨부된 서류
    risk_assessment: bool = False                          # 위험성평가 실시
    change_review: bool = False                            # 변화·작업 상이 검토

    # 서명류: 값이 있으면 서명된 것으로 간주
    applicant: str = ""
    issuer: str = ""
    approver: str = ""
    supplementary_confirmer: dict = field(default_factory=dict)  # {"밀폐공간": "홍길동"}

    gas_results: dict = field(default_factory=dict)
    equipment_type: str = ""   # 투입장비 칸에 실제로 적힌 값 (예: "지게차")
    driver_name: str = ""      # 운전원 칸에 실제로 적힌 이름
    worker_name: str = ""      # 작업자 칸에 적힌 이름
    witness_name: str = ""     # 입회자 칸에 적힌 이름

    # 굴착 보충작업허가의 점검자
    excavation_inspector: str = ""

    # ⚠️ 2026-08 신규: 체크박스가 없는 유형(도장, 전기작업 등)을 작업개요
    # 키워드로 추정해 넣을 때, work_types와는 별도로 "이건 추정이었다"는
    # 사실을 여기 남긴다. 기존 7개(체크박스 기반)는 신뢰도가 높지만, 이
    # 방식은 텍스트 매칭이라 신뢰도가 낮으므로 화면/저장 시 구분 표시한다.
    inferred_types: list = field(default_factory=list)

    # ⚠️ 하위호환: 예전 코드/테스트가 Permit(work_types=[...])로 생성하는
    # 경우를 계속 지원하기 위한 입력 전용 필드. __post_init__에서 곧바로
    # main_works/conditions로 나눠 담고 비운다. 읽을 때는 이 필드가 아니라
    # 아래 all_types 프로퍼티(또는 main_works/conditions)를 쓸 것.
    work_types: list = field(default_factory=list)

    def __post_init__(self):
        if isinstance(self.work_types, str):
            self.work_types = [self.work_types]
        for wt in self.work_types:
            if wt in MAIN_WORK_TYPES and wt not in self.main_works:
                self.main_works.append(wt)
            elif wt in CONDITION_TYPES and wt not in self.conditions:
                self.conditions.append(wt)
        self.work_types = []   # 분배 끝났으므로 비움(이후엔 all_types를 씀)

        # 화기작업허가서 양식이면 '화기'는 주작업으로 확정(지침 제3·4장)
        if self.form_type == "화기" and "화기" not in self.main_works:
            self.main_works.insert(0, "화기")

    @property
    def all_types(self):
        """주작업 + 보충작업을 합친 목록.
        ⚠️ 판정 로직(개별규칙 applies_to 매칭, SIMOPS 조합 검사)은 주작업과
        보충작업을 구분하지 않고 '이 허가서에 이 유형이 걸려있는지'만 보면
        되므로, 그 용도로 둘을 합쳐서 제공한다. 저장되는 실제 데이터는
        main_works/conditions 두 개이고 이건 그로부터 계산되는 값이다."""
        return list(self.main_works) + list(self.conditions)

    @property
    def main_work_label(self):
        """화면 표시용 주작업 이름.
        ⚠️ 지침 제3장 정의상 '일반위험작업'은 화염·스파크를 발생시키는 작업
        '이외의' 작업을 포괄하는 범주라, 주작업 키워드가 하나도 안 잡히는 게
        오류가 아니라 정상이다(실제 샘플의 약 47%). 이 경우 '(미파악)' 같은
        표현 대신 지침 용어인 '일반작업'으로 표시한다."""
        return ", ".join(self.main_works) if self.main_works else "일반작업"

    def _match(self, pool, target):
        t = target.replace(" ", "")
        return any(t in x.replace(" ", "") or x.replace(" ", "") in t for x in pool if x)

    def to_dict(self):
        # 허가서의 모든 핵심 정보를 JSON 저장가능한 dict로 뽑아냄
        return {
            "permit_id": self.permit_id,
            "form_type": self.form_type,
            "main_works": self.main_works,
            "conditions": self.conditions,
            # ⚠️ work_types는 이제 main_works+conditions를 합친 계산값. 예전
            # 형식으로 저장된 JSON을 읽는 코드와의 호환을 위해 함께 저장한다.
            "work_types": self.all_types,
            "inferred_types": self.inferred_types,
            "zone": self.zone,
            "area_type": self.area_type,
            "period": {
                "start": self.start.isoformat() if self.start else None,
                "end": self.end.isoformat() if self.end else None,
            },
            "work_summary": self.work_summary,
            "issue_date": self.issue_date,
            "people": {
                "applicant": self.applicant,
                "issuer": self.issuer,
                "approver": self.approver,
                "worker_name": self.worker_name,
                "witness_name": self.witness_name,
                "supplementary_confirmer": self.supplementary_confirmer,
                "excavation_inspector": self.excavation_inspector,
                "driver_name": self.driver_name,
            },
            "equipment_type": self.equipment_type,
            "gas_results": self.gas_results,
            "attachments": self.attachments,
            "risk_assessment": self.risk_assessment,
            "change_review": self.change_review,
        }

    def is_confirmed(self, target):
        # 텍스트 입력형 필드는 confirmed 리스트가 아니라 전용 값으로 확인
        t = target.replace(" ", "")
        if "투입장비" in t:
            return bool(self.equipment_type)
        if "운전원" in t:
            return bool(self.driver_name)
        if t == "작업자":
            return bool(self.worker_name)
        if t == "입회자":
            return bool(self.witness_name)
        return self._match(self.confirmed, target)

    def is_marked(self, target):
        return self._match(self.marked_required, target)

    def has_attachment(self, target):
        return self._match(self.attachments, target)


def load_rules(path=None):
    path = path or BASE_DIR / "data" / "permit_rules.csv"
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _applies(rule, permit):
    """규칙이 이 허가서에 적용되는지 (applies_to: 전체 | 작업유형 | A|B | 조건부)"""
    tgt = rule["applies_to"]
    if tgt == "전체":
        return True
    if tgt == "조건부":
        return False   # 배관·용기 작업 여부를 판별할 정보가 없어 현재는 미적용
    return any(t in permit.all_types for t in tgt.split("|"))


# ⚠️ 체크박스만으로는 놓칠 수 있는 작업유형을 작업개요 자유서술문에서
#    보조적으로 감지하기 위한 키워드 사전. "이 키워드가 있으면 무조건 그
#    작업유형이다"라고 자동 분류하는 게 아니라, "체크박스 결과와 다르면
#    경고한다"는 안전장치 용도. 오탐 가능성이 있는 만큼 각 유형의 가장
#    명확한 키워드 몇 개만 엄선했다.
CHECKBOX_TYPE_KEYWORDS = {
    "화기": ["용접", "용단", "절단", "그라인더", "화기작업", "가스절단"],
    "밀폐공간": ["탱크 내부", "맨홀", "밀폐공간", "탱크내부", "콤파트먼트"],
    "고소": ["고소작업", "비계", "고소부", "타워크레인 붐"],
    "굴착": ["굴착", "터파기", "매설물"],
    "정전": ["정전작업", "전원차단", "차단기 조작"],
    "방사선": ["방사선", "RT촬영", "감마선"],
    "중장비": ["지게차", "크레인", "굴삭기", "이동식크레인"],
}


def judge_permit(permit, rules):
    """허가서 1건의 모든 항목 검증"""
    violations = []

    for r in rules:
        if not _applies(r, permit):
            continue

        kind, target = r["check_kind"], r["target"]
        ok = True

        if kind == "field":
            ok = bool(getattr(permit, {
                "permit_id": "permit_id", "issue_date": "issue_date",
                "applicant": "applicant", "zone": "zone",
                "work_summary": "work_summary",
                "작업자": "worker_name", "입회자": "witness_name",
            }.get(target, target), None)) if target != "period" else \
                (permit.start is not None and permit.end is not None)

        elif kind == "attachment":
            ok = permit.has_attachment(target)

        elif kind == "assessment":
            ok = permit.risk_assessment if target == "risk_assessment" else permit.change_review

        elif kind in ("measure", "supplementary"):
            ok = permit.is_confirmed(target)

        elif kind == "signature":
            if target == "issuer":
                ok = bool(permit.issuer)
            elif target == "approver":
                ok = bool(permit.approver)
            elif target == "confirmer":
                sec = r["section"].replace("보충-", "")
                ok = bool(permit.supplementary_confirmer.get(sec))

        if not ok:
            violations.append({
                "permit_id": permit.permit_id,
                "section": r["section"],
                "rule_id": r["rule_id"],
                "risk": "반려" if r["severity"] == "HARD" else "보류",
                "reason": r["reason"],
                "resolution": r["resolution"],
                "legal_ref": r["legal_ref"],
            })

    # ── X01: □(필요)로 표시했는데 ○(확인)이 안 된 항목 ──
    for m in permit.marked_required:
        if not permit.is_confirmed(m):
            violations.append({
                "permit_id": permit.permit_id, "section": "일관성",
                "rule_id": "X01", "risk": "반려",
                "reason": f"'{m}'을(를) 필요 항목(□)으로 표시했으나 확인(○)되지 않음",
                "resolution": f"{m} 조치 완료 후 확인 표시",
                "legal_ref": "-",
            })

    # ── X03: 작업개요 텍스트에 위험 키워드가 있는데 작업유형에 반영 안 됨 ──
    # ⚠️ 실측으로 발견된 실제 위험 시나리오: '일반위험작업허가서' 양식으로
    #    용접작업을 신청하면서 보충작업허가 체크박스를 하나도 안 누르면,
    #    작업유형이 완전히 미분류(work_types=[])되어 화기 관련 안전조치
    #    6개(가스농도측정·비산불티차단막·환기장비·소화기 등)가 통째로
    #    검사 대상에서 빠지는 것을 실제로 확인함. 체크박스만 믿지 않고
    #    작업개요 자유서술문도 최소한의 키워드로 대조해서, 놓치면 강하게 경고한다.
    for wt in violations_check_keyword_mismatch(permit):
        violations.append(wt)

    # ── 가스농도: 실측값 자체가 비어있는지 + 값이 적정공기 기준 미달인지 ──
    # ⚠️ 2026-08-05 확장: 예전엔 "밀폐공간" 작업유형 + gas_results가 이미
    #    채워져 있을 때만 검사해서, 두 가지를 놓치고 있었음 —
    #    (1) 화기·도장(R17·R56이 가스농도측정을 요구하는 작업유형인데도)
    #        작업유형 조건에서 아예 빠져 있어서 실측값 검사 대상이 아니었음
    #    (2) gas_results가 완전히 비어있으면(체크박스는 확인했는데 실제
    #        측정값을 하나도 안 적은 경우) "if ... and permit.gas_results"
    #        조건 자체가 거짓이 되어 검사를 통째로 건너뛰었음 — 실사용
    #        테스트로 발견된 실제 안전 공백(가스농도측정 ☑·● 확인은 됐는데
    #        정작 HC·O2·CO 등 실측 수치가 하나도 없어도 승인되던 문제)
    GAS_REQUIRED_TYPES = ("화기", "밀폐공간", "도장")  # R17(화기|밀폐공간)·R56(도장) 대상과 동일
    if any(t in permit.all_types for t in GAS_REQUIRED_TYPES):
        if not permit.gas_results:
            violations.append({
                "permit_id": permit.permit_id, "section": "가스농도",
                "rule_id": "G-전체미측정", "risk": "반려",
                "reason": "가스농도측정 항목은 확인(●)되었으나 실제 측정값(HC·O2·CO·CO2·H2S)이 전혀 기재되지 않음",
                "resolution": "작업 전 HC·O2·CO·CO2·H2S 실측 후 수치 기재",
                "legal_ref": "제618조;제619조의2",
            })
        else:
            for k, (conditions, unit, label) in GAS_LIMITS.items():
                if k not in permit.gas_results:
                    violations.append({
                        "permit_id": permit.permit_id, "section": "가스농도",
                        "rule_id": f"G-{k}-미측정", "risk": "반려",
                        "reason": f"{label}({k}) 측정값 누락",
                        "resolution": f"{label} 농도 측정 후 기재",
                        "legal_ref": "제618조;제619조의2",
                    })
                    continue
                v = permit.gas_results[k]

                def _cond_ok(op, lim, v=v):
                    return {"<=": v <= lim, ">=": v >= lim, "<": v < lim, ">": v > lim}[op]

                failed = [(op, lim) for op, lim in conditions if not _cond_ok(op, lim)]
                if failed:
                    limit_desc = " · ".join(f"{op} {lim}{unit}" for op, lim in conditions)
                    violations.append({
                        "permit_id": permit.permit_id, "section": "가스농도",
                        "rule_id": f"G-{k}", "risk": "반려",
                        "reason": f"{label}({k}) 측정값 {v}{unit} — 적정공기 기준({limit_desc}) 미달",
                        "resolution": "환기 실시 후 재측정. 기준 충족 전 작업 금지",
                        "legal_ref": "제618조;제619조의2;제620조",
                    })

    # X02: 작업허가기간 유효성(종료가 시작보다 빠르거나 같음) 
    if permit.start and permit.end and permit.end <= permit.start:
        violations.append({
            "permit_id": permit.permit_id, "section": "기본정보",
            "rule_id": "X02", "risk": "반려",
            "reason": "작업 종료시각이 시작시각보다 빠르거나 같음",
            "resolution": "작업허가기간 정정",
            "legal_ref": "-",
        })

    # X04: 허가일자가 작업 시작일보다 늦은 모순 
    if permit.issue_date_dt and permit.start and permit.issue_date_dt.date() > permit.start.date():
        violations.append({
            "permit_id": permit.permit_id, "section": "일관성",
            "rule_id": "X04", "risk": "반려",
            "reason": f"허가일자({permit.issue_date})가 작업 시작일({permit.start.date()})보다 늦음",
            "resolution": "허가일자 또는 작업허가기간 정정 (허가가 나기 전에 작업이 시작될 수 없음)",
            "legal_ref": "-",
        })

    return violations


# SIMOPS 
def load_matrix(path=None):
    path = path or BASE_DIR / "data" / "conflict_matrix.csv"
    m = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            m[(row["work_a"], row["work_b"])] = row
            m[(row["work_b"], row["work_a"])] = row
    return m


def violations_check_keyword_mismatch(permit):
    """작업개요에 특정 작업유형의 명확한 키워드가 있는데, 실제 work_types엔
    그 유형이 없으면 강하게 경고(반려)한다.
    ⚠️ 실측으로 발견: '일반위험작업허가서'로 용접작업을 신청하며 보충작업허가
    체크박스를 하나도 안 누르면 work_types가 완전히 비어서, 화기 관련
    안전조치 6개가 통째로 검사 누락되는 걸 확인함. 이 함수가 그 케이스를 잡는다."""
    out = []
    summary = (permit.work_summary or "").replace(" ", "")
    for wt, keywords in CHECKBOX_TYPE_KEYWORDS.items():
        if wt in permit.all_types:
            continue  # 이미 정상적으로 분류돼 있으면 검사할 필요 없음
        for kw in keywords:
            if kw.replace(" ", "") in summary:
                out.append({
                    "permit_id": permit.permit_id, "section": "작업유형 불일치",
                    "rule_id": "X03", "risk": "반려",
                    "reason": f"작업개요에 '{kw}'가 언급되어 '{wt}' 작업으로 보이나, "
                              f"보충작업허가에서 '{wt}'가 체크되지 않아 관련 안전조치 검사가 누락됨",
                    "resolution": f"실제 {wt} 작업이 맞다면 보충작업허가에서 '{wt}' 항목 체크 후 재신청. "
                                  f"아니라면 작업개요를 더 명확히 기재",
                    "legal_ref": "-",
                })
                break  # 이 작업유형에 대해선 키워드 하나만 잡히면 충분
    return out



# ⚠️ 2026-08-05 갱신: 디지털트윈 담당자로부터 받은 시설 좌표가
#    (x,y,w,h) 사각형 데이터에서 GPS 위도·경도 "시설명+좌표 1점"짜리
#    데이터(data/shipyard_facilities_gps.csv)로 교체됨. 예전엔 두 시설의
#    테두리(사각형) 간 최단거리를 실측해서 인접 여부를 계산했지만, 새
#    데이터는 건물 크기 정보가 없어 "점(중심좌표) 간 거리"로만 계산 가능함.
#
#    ⚠️ 중요한 설계 결정 (2026-08-05, 사용자 확정): 점 간 거리로 "인접"을
#    판단하는 것은 채택하지 않기로 함 — 이 좌표는 시설(건물) 단위이지 세부
#    블록 단위가 아니라서, 두 건물이 GPS상 가까워 보여도(예: 144m) 실제로는
#    서로 무관한 별개 작업구역일 수 있고, 반대로 큰 건물 하나의 반대편
#    끝(같은 건물, 다른 구역)은 몇십m 거리인데도 점 좌표로는 이미 "같은
#    건물"로 잡히는 등 건물 크기가 클수록 점 거리 판단이 부정확해짐.
#    **대신 세부 블록 좌표가 들어오기 전까지는 "같은 건물(시설)"이면
#    무조건 인접구역으로 판단**하기로 확정. 시설 매칭이 안 되면(둘 중
#    하나라도 알려진 시설명과 안 겹치면) 예전처럼 구역명 번호 추정으로 폴백.
_ZONE_PATTERN = re.compile(r"([A-Za-z가-힣]+)[-\s]?(\d+)")

_facility_names_cache = None


def _load_facility_names(path=None):
    """data/shipyard_facilities_gps.csv에서 시설명 목록을 읽어온다(좌표는
    현재 인접판정에 쓰지 않음 — 위 주석 참고). 파일이 없으면 빈 리스트
    반환 — 이 경우 자동으로 예전 추정 방식으로만 동작."""
    global _facility_names_cache
    if _facility_names_cache is not None:
        return _facility_names_cache
    path = path or BASE_DIR / "data" / "shipyard_facilities_gps.csv"
    names = []
    if path.exists():
        with open(path, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                name = row.get("시설명")
                if name:
                    names.append(name)
    _facility_names_cache = names
    return names


def _norm_zone(s):
    return re.sub(r"[\s·]", "", s or "").replace("번", "")


def _match_facility(zone_text, facility_names):
    """구역 텍스트(예: '전처리 및 도장공장 B-11 일대')가 어느 시설명에
    해당하는지 찾는다. 매칭되는 시설명 문자열 자체를 반환(못 찾으면 None)."""
    if not zone_text:
        return None
    nz = _norm_zone(zone_text)
    for name in facility_names:
        if _norm_zone(name) in nz:
            return name
    return None


def _extract_zone_number(zone_text):
    """구역 문자열에서 'B-11' 같은 (접두어, 번호) 패턴을 추출. 못 찾으면 None."""
    if not zone_text:
        return None
    m = _ZONE_PATTERN.search(zone_text)
    if not m:
        return None
    return m.group(1), int(m.group(2))


def zones_adjacent_estimated(zone_a, zone_b, max_diff=1):
    """두 구역이 인접한지 판단. 두 구역 텍스트가 같은 시설(건물)명으로
    매칭되면 인접으로 간주(위 2026-08-05 결정 참고 — 세부 블록 좌표가
    없어 건물 단위로만 판단). 시설 매칭이 안 되면(둘 중 하나라도 알려진
    시설명과 안 겹치면) 예전처럼 구역명 번호 차이로 추정한다."""
    if zone_a == zone_b:
        return False  # 완전히 같은 구역 표기는 '인접'이 아니라 '동일'(judge_pairs가 별도 처리)

    facility_names = _load_facility_names()
    fa, fb = _match_facility(zone_a, facility_names), _match_facility(zone_b, facility_names)
    if fa and fb:
        return fa == fb

    pa, pb = _extract_zone_number(zone_a), _extract_zone_number(zone_b)
    if not pa or not pb:
        return False
    prefix_a, num_a = pa
    prefix_b, num_b = pb
    return prefix_a == prefix_b and 0 < abs(num_a - num_b) <= max_diff


def judge_pairs(permits, matrix):
    conflicts, seen = [], set()
    for a, b in combinations(permits, 2):
        if a.start is None or a.end is None or b.start is None or b.end is None:
            continue

        same_zone = a.zone == b.zone
        adjacent = (not same_zone) and zones_adjacent_estimated(a.zone, b.zone)
        if not ((same_zone or adjacent) and a.start < b.end and b.start < a.end):
            continue

        for wa in a.all_types:
            for wb in b.all_types:
                rule = matrix.get((wa, wb))
                if not rule:
                    continue
                # ⚠️ 2026-08 개선: 예전엔 모든 규칙이 "인접이면 무조건 한 단계
                #    낮춰서 적용"됐는데, 다시 검토해보니 18개 중 절반 이상이
                #    "정확히 같은 공간"이어야만 성립하는 위험이었음(예: 방사선
                #    출입제한구역은 '그 구역 안'인지가 핵심이라 인접은 아예
                #    무관, 밀폐공간 내부 가스도 마찬가지). 그래서 규칙별로
                #    "인접구역에도 적용 가능한지"(adjacent_applicable)를
                #    CSV에 미리 정해두고, 인접인 경우 이 값이 N이면 아예
                #    비교 후보에서 제외한다(등급을 낮추는 게 아니라 매칭 자체를 안 함).
                if adjacent and rule.get("adjacent_applicable") == "N":
                    continue
                key = (a.permit_id, b.permit_id, rule["rule_id"])
                if key in seen:
                    continue
                seen.add(key)
                # 인접구역은 실제 배치도 없이 이름으로 추정한 것이라 확신도가
                # 낮음 — 반려(가장 강한 등급)까지는 안 가고 한 단계 낮춤.
                risk = rule["risk"]
                if adjacent and risk == "반려":
                    risk = "보류"
                conflicts.append({
                    "permits": (a.permit_id, b.permit_id),
                    "work_types": (wa, wb), "risk": risk,
                    "rule_id": rule["rule_id"], "reason": rule["reason"],
                    "legal_ref": rule["legal_ref"],
                    "zone_relation": "동일구역" if same_zone else "인접구역(추정)",
                })
    return conflicts


def run(permits):
    rules = load_rules()
    matrix = load_matrix()

    permit_violations = []
    for p in permits:
        permit_violations.extend(judge_permit(p, rules))
    conflicts = judge_pairs(permits, matrix)

    overall = "승인"
    for it in permit_violations + conflicts:
        if RISK_ORDER[it["risk"]] > RISK_ORDER[overall]:
            overall = it["risk"]

    decision = {"승인": "승인", "보류": "조건부 승인", "반려": "반려"}[overall]

    return {"decision": decision, "overall_risk": overall,
            "permit_violations": permit_violations, "pair_conflicts": conflicts}


def run_with_existing(new_permits, existing_permits):
    """실제 운영 흐름(허가서 1건씩/여러건 업로드)을 위한 판정.
    신규 허가서만 개별 위반(permit_rules.csv) 판정을 새로 하고, 이미 예전에
    판정 끝난 기존 허가서는 재판정 안 함 — 대신 'SIMOPS 비교 대상'으로만
    신규 허가서와 함께 합쳐서 충돌 검사한다. 기존끼리의 충돌은 예전에 이미
    다 확인된 것이므로 다시 보여주지 않고, 신규 허가서가 관여된 충돌만
    리포트한다.

    ⚠️ 2026-08 설계 변경: 예전엔 "신규 허가서가 자기 위반만으로 이미 반려
    확정이면 SIMOPS 비교 자체를 생략"했었음. 그런데 SIMOPS(구역·시간·작업유형
    겹침)는 가스농도측정처럼 "물리적으로 시간이 걸리는" 개별위반과 완전히
    무관한 정보다. 개별위반이 반려라고 SIMOPS를 생략해버리면, "그 개별위반만
    나중에 고쳐지고 재제출됐을 때"에야 뒤늦게 SIMOPS 충돌이 드러나서, 먼저
    처리된 다른 허가서보다 불공평하게 늦게/불리하게 발견되는 문제가 생김.
    → 개별위반 상태와 무관하게 SIMOPS는 항상 전원 대상으로 계산한다."""
    rules = load_rules()
    matrix = load_matrix()

    permit_violations = []
    for p in new_permits:
        permit_violations.extend(judge_permit(p, rules))

    all_permits = list(existing_permits) + list(new_permits)
    all_conflicts = judge_pairs(all_permits, matrix)
    new_ids = {p.permit_id for p in new_permits}
    conflicts = [c for c in all_conflicts if any(pid in new_ids for pid in c["permits"])]

    overall = "승인"
    for it in permit_violations + conflicts:
        if RISK_ORDER[it["risk"]] > RISK_ORDER[overall]:
            overall = it["risk"]

    decision = {"승인": "승인", "보류": "조건부 승인", "반려": "반려"}[overall]

    return {"decision": decision, "overall_risk": overall,
            "permit_violations": permit_violations, "pair_conflicts": conflicts}


def print_report(result, verbose=True, label="최종 판정"):
    # ⚠️ 2026-08-06: run_pipeline.py의 ②단계(허가서 개별 자체위반만 검사,
    #    SIMOPS 계산 전)에서 이 함수를 "최종 판정"이라는 문구로 출력하다가
    #    실사용 중 혼동 발생 — SIMOPS 충돌까지 합쳐지면 등급이 달라질 수
    #    있는데 "최종"이라고 표시돼 있어서, 나중에 SIMOPS 반려가 붙어도
    #    이미 "승인"이라고 본 사용자가 혼란스러워함. 호출부에서 상황에 맞는
    #    label을 넘기도록 매개변수화(기본값은 기존 문구 그대로 유지).
    print(f"\n=== {label}: {result['decision']} (등급: {result['overall_risk']}) ===")
    pv, pc = result["permit_violations"], result["pair_conflicts"]
    print(f"  허가서 자체 위반 {len(pv)}건 / 작업 간 충돌 {len(pc)}건")
    if not pv and not pc:
        print("  ✅ 위반 없음")
        return
    by_sec = defaultdict(list)
    for v in pv:
        by_sec[v["section"]].append(v)
    for sec, items in by_sec.items():
        print(f"\n  ── [{sec}] {len(items)}건")
        for v in (items if verbose else items[:3]):
            print(f"     [{v['rule_id']}] {v['risk']} | {v['reason']}")
            print(f"          → {v['resolution']}  (근거: {v['legal_ref']})")
    for c in pc:
        print(f"\n  ── [작업 간 충돌] [{c.get('zone_relation','동일구역')}]")
        print(f"     [{c['rule_id']}] {c['work_types'][0]} x {c['work_types'][1]} "
              f"{c['risk']} | {c['reason']}")
        print(f"          (근거: {c['legal_ref']})")