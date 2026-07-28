"""pydantic 스키마 전부 (명세 §5).

이 파일은 모든 작업의 계약이다. 특히 §5.1 입력 스키마는 ②모듈(작업허가서 승인 지원)의
출력과 1:1로 대응하므로 **필드명을 임의로 바꾸지 않는다** (§12). 최종 통합 시 공통 스키마를
별도 패키지로 추출할 때 충돌을 줄이기 위한 제약이다.

양식이 곧 스키마다. P-94 별지양식에 없는 필드·작업종류·안전조치 항목을 만들지 않는다.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------
# enum — 전부 양식/명세에 실재하는 값만
# --------------------------------------------------------------------------


class PermitForm(str, Enum):
    """양식 종류 2종. 밀폐공간·정전 등은 여기가 아니라 보충작업허가다 (§5.1)."""

    HOT_WORK = "화기작업"
    GENERAL_HAZARD = "일반위험작업"


class AreaType(str, Enum):
    BLOCK_INTERIOR = "블록내부"
    TANK = "탱크"
    DOCK = "도크"
    OPEN_AREA = "개방구역"


class Verdict(str, Enum):
    APPROVED = "승인"
    CONDITIONAL = "조건부승인"
    REJECTED = "반려"


class CategoryCode(str, Enum):
    """12개 안전 카테고리 (§6.1). 정의·생성기준은 data/categories.yaml."""

    RISK_ASSESSMENT = "RISK_ASSESSMENT"
    WORK_AREA_CONTROL = "WORK_AREA_CONTROL"
    FIRE_EXPLOSION = "FIRE_EXPLOSION"
    GAS_ATMOSPHERE = "GAS_ATMOSPHERE"
    HAZARDOUS_MATERIAL = "HAZARDOUS_MATERIAL"
    ENERGY_ISOLATION = "ENERGY_ISOLATION"
    VENTILATION_LIGHTING = "VENTILATION_LIGHTING"
    PPE_SAFETY_EQUIPMENT = "PPE_SAFETY_EQUIPMENT"
    CONFINED_SPACE = "CONFINED_SPACE"
    WORK_AT_HEIGHT = "WORK_AT_HEIGHT"
    EXCAVATION_HEAVY_EQUIPMENT = "EXCAVATION_HEAVY_EQUIPMENT"
    SPECIAL_EMERGENCY = "SPECIAL_EMERGENCY"


class SafetyMeasureCode(str, Enum):
    """양식 "안전조치 요구사항" 항목 (§6.2 표1). 이 목록 밖의 코드를 만들지 않는다."""

    AREA_CONTROL = "AREA_CONTROL"
    REMOVE_FLAMMABLE = "REMOVE_FLAMMABLE"
    SPARK_BARRIER = "SPARK_BARRIER"  # 화기양식 전용
    EXTINGUISHER = "EXTINGUISHER"
    GAS_TEST = "GAS_TEST"
    VALVE_ISOLATION = "VALVE_ISOLATION"
    BLIND_FLANGE = "BLIND_FLANGE"
    HAZMAT_PURGE = "HAZMAT_PURGE"
    PRESSURE_RELEASE = "PRESSURE_RELEASE"
    VESSEL_CLEANING = "VESSEL_CLEANING"
    INERT_PURGE = "INERT_PURGE"
    VENTILATION = "VENTILATION"
    LIGHTING = "LIGHTING"
    SAFETY_GEAR = "SAFETY_GEAR"
    SAFETY_TRAINING = "SAFETY_TRAINING"
    OPERATOR_ATTEND = "OPERATOR_ATTEND"


class Phase(str, Enum):
    """시점 축. category(안전 주제)와 별개 축이다 (§5.2)."""

    BEFORE = "작업전"
    DURING = "작업중"
    EMERGENCY = "비상시"


class Priority(str, Enum):
    CRITICAL = "critical"
    NORMAL = "normal"


class Criticality(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# --------------------------------------------------------------------------
# §5.1 입력 — ②모듈 승인 결과 (P-94 양식 기반)
# --------------------------------------------------------------------------


class MeasureState(BaseModel):
    """양식의 `□ ○` 2단 상태.

    □ = 필요(required), ○ = 확인(verified). 단순 boolean이 아니라 **필요 여부와
    이행 여부가 별개**다 (§5.1). `required=True, verified=False`가 위험 공백이며
    이 모듈의 핵심 처리 대상이다 (§6.2 표4).
    """

    required: bool
    verified: bool

    @property
    def is_gap(self) -> bool:
        """필요한데 미이행 = 위험 공백."""
        return self.required and not self.verified


class SafetyMeasure(MeasureState):
    """안전조치 요구사항 한 줄."""

    code: SafetyMeasureCode


class WorkPeriod(BaseModel):
    start: datetime
    end: datetime


class Zone(BaseModel):
    block_id: str  # 양식 "작업지역(장소)" 앞부분
    area_type: AreaType


class RiskAssessment(BaseModel):
    procedure_required: bool  # 필요작업절차서 유/무
    condition_changed: bool  # 변화·작업 상이 유/무


class SupplementaryPermit(BaseModel):
    """보충작업허가 공통 형태.

    하위 확인사항은 보충허가 종류마다 다르고 명세에 밀폐공간 예시만 제시되어 있다.
    양식에 없는 필드를 지어내지 않기 위해(§12) 알려진 항목만 타입으로 두고,
    나머지는 extra로 받아 `checks()`가 2단 상태로 해석한다.
    """

    model_config = ConfigDict(extra="allow")

    period: Optional[WorkPeriod] = None
    confirmed_by: Optional[str] = None

    def checks(self) -> dict[str, MeasureState]:
        """하위 확인사항을 {이름: 2단 상태}로 모아 준다."""
        result: dict[str, MeasureState] = {}
        declared = {"period", "confirmed_by"}
        for name, value in self.__dict__.items():
            if name in declared:
                continue
            if isinstance(value, MeasureState):
                result[name] = value
            elif isinstance(value, dict) and "required" in value:
                result[name] = MeasureState.model_validate(value)
        for name, value in (self.__pydantic_extra__ or {}).items():
            if isinstance(value, dict) and "required" in value:
                result[name] = MeasureState.model_validate(value)
        return result


class ConfinedSpacePermit(SupplementaryPermit):
    """밀폐공간 보충허가. 명세 §5.1에 하위 확인사항이 명시된 유일한 케이스."""

    communication: Optional[MeasureState] = None
    life_saving_gear: Optional[MeasureState] = None


class SupplementaryPermits(BaseModel):
    """체크된 것만 객체가 존재한다. null이면 미체크 (§5.1)."""

    confined_space: Optional[ConfinedSpacePermit] = None
    power_isolation: Optional[SupplementaryPermit] = None
    excavation: Optional[SupplementaryPermit] = None
    radiation: Optional[SupplementaryPermit] = None
    work_at_height: Optional[SupplementaryPermit] = None
    heavy_equipment: Optional[SupplementaryPermit] = None

    def checked(self) -> dict[str, SupplementaryPermit]:
        return {k: v for k, v in self.__dict__.items() if v is not None}


class GasMeasurement(BaseModel):
    """실측 결과. 미측정이면 value/measured_at 이 null이거나 배열 자체가 빈다."""

    substance: str  # HC | O2 | CO | CO2 | H2S — 기준값은 data/gas_thresholds.yaml
    value: Optional[float] = None
    measured_at: Optional[datetime] = None


class Violation(BaseModel):
    summary: str
    legal_basis: str


class PermitApproval(BaseModel):
    """②모듈 승인 결과. 이 모듈의 유일한 입력원 (§5.1, §13).

    필드명은 ②모듈의 출력과 1:1이다. 변경 금지.
    """

    permit_no: str
    permit_date: date
    permit_form: PermitForm
    work_period: WorkPeriod
    zone: Zone
    work_summary: str
    risk_assessment: RiskAssessment
    safety_measures: list[SafetyMeasure] = Field(default_factory=list)
    supplementary_permits: SupplementaryPermits = Field(
        default_factory=SupplementaryPermits
    )
    gas_measurements: list[GasMeasurement] = Field(default_factory=list)
    verdict: Verdict
    recommended_actions: list[str] = Field(default_factory=list)
    violations: list[Violation] = Field(default_factory=list)


# --------------------------------------------------------------------------
# data/*.yaml 로딩 결과
# --------------------------------------------------------------------------


class CategoryDef(BaseModel):
    """data/categories.yaml 한 행 (§6.1)."""

    code: CategoryCode
    name_ko: str
    generation_criteria: list[str] = Field(default_factory=list)
    default_priority: Priority = Priority.NORMAL
    max_items: int = 2


class GasThreshold(BaseModel):
    """data/gas_thresholds.yaml 한 행 — 양식 인쇄 고정값 (§5.5)."""

    substance: str
    name_ko: str
    op: str  # gte | lt | eq
    value: float
    unit: str
    display: str

    def satisfies(self, measured: float) -> bool:
        if self.op == "gte":
            return measured >= self.value
        if self.op == "lt":
            return measured < self.value
        if self.op == "eq":
            return measured == self.value
        raise ValueError(f"알 수 없는 비교 연산자: {self.op}")


# --------------------------------------------------------------------------
# 카테고리 활성화 결과 (§9.1) — 집합이 아니라 사유를 동반한다
# --------------------------------------------------------------------------


class Activation(BaseModel):
    """활성 카테고리 하나. reasons는 추적성 근거이자 프롬프트 주입 재료다."""

    category: CategoryCode
    priority: Priority = Priority.NORMAL
    reasons: list[str] = Field(default_factory=list)

    def add_reason(self, reason: str) -> None:
        if reason not in self.reasons:
            self.reasons.append(reason)

    def escalate(self) -> None:
        """critical로 승격. 한번 critical이 되면 normal로 내려가지 않는다."""
        self.priority = Priority.CRITICAL


# --------------------------------------------------------------------------
# §5.2 체크리스트
# --------------------------------------------------------------------------


class ChecklistItem(BaseModel):
    item_id: str  # CHK-001. LLM이 아니라 코드가 부여한다 (병렬 호출 중복 방지)
    category: CategoryCode
    phase: Phase
    text: str
    priority: Priority
    terms_used: list[str] = Field(default_factory=list)
    source_action: str  # 추적성: 어떤 승인 조건에서 왔는가

    # 번역 검증 결과 (§9.4). 원문(ko)에서는 항상 비어 있다.
    needs_review: bool = False
    validation_issues: list[str] = Field(default_factory=list)


class Checklist(BaseModel):
    permit_id: str  # 입력의 permit_no 를 그대로 옮긴다
    lang: str
    generated_at: datetime
    activated_categories: list[CategoryCode] = Field(default_factory=list)
    items: list[ChecklistItem] = Field(default_factory=list)


# --------------------------------------------------------------------------
# §5.4 재생용 매니페스트
#
# 언어별 체크리스트(Checklist)를 항목(item_id) 기준으로 병합한 현장 재생용 뷰다.
# 이것이 ①디지털 트윈·③PPE 감시와의 통합 계약(§13)이므로 구조를 먼저 고정한다.
# audio / duration_sec 는 T10(TTS)에서 채운다. 그 전까지는 빈 dict.
# 필드를 지어내지 말라는 §12 제약은 ②모듈 입력(§5.1)에 대한 것이고, 이 출력 매니페스트는
# 우리가 소유한다 — priority(재생 순서)·needs_review(검수 표시)를 실용상 포함한다.
# --------------------------------------------------------------------------


class ManifestItem(BaseModel):
    item_id: str
    category: CategoryCode
    phase: Phase
    priority: Priority
    text: dict[str, str] = Field(default_factory=dict)  # lang -> 문장
    audio: dict[str, str] = Field(default_factory=dict)  # lang -> 오디오 상대경로 (T10)
    duration_sec: dict[str, float] = Field(default_factory=dict)  # lang -> 길이 (T10)
    # 검수되지 않은 번역을 현장/QA가 식별할 수 있게 lang별 검토 플래그를 남긴다 (§9.4)
    needs_review: dict[str, bool] = Field(default_factory=dict)


class Manifest(BaseModel):
    permit_id: str
    languages: list[str] = Field(default_factory=list)
    activated_categories: list[CategoryCode] = Field(default_factory=list)
    generated_at: datetime
    items: list[ManifestItem] = Field(default_factory=list)


# --------------------------------------------------------------------------
# §5.3 용어사전
# --------------------------------------------------------------------------


class GlossaryEntry(BaseModel):
    """base — 한국어 표제어."""

    term_id: str
    ko: str
    synonyms: list[str] = Field(default_factory=list)
    definition: str = ""
    safety_categories: list[CategoryCode] = Field(default_factory=list)
    source: str = ""
    criticality: Criticality = Criticality.MEDIUM


class GlossaryTranslation(BaseModel):
    """언어별 역어. 검수 전에는 verified=False 를 유지한다 (§12)."""

    term_id: str
    lang: str
    translation: str
    note: str = ""
    verified: bool = False
    verified_by: Optional[str] = None


class MatchedTerm(BaseModel):
    """항목 텍스트에서 탐지된 용어 + 해당 언어 역어. 프롬프트에 주입되는 단위."""

    entry: GlossaryEntry
    translation: Optional[GlossaryTranslation] = None

    @property
    def target(self) -> Optional[str]:
        return self.translation.translation if self.translation else None


# --------------------------------------------------------------------------
# LLM 출력 스키마 — 구조화 출력(response_schema)으로 강제한다
#
# 도메인 모델과 분리하는 이유: item_id 부여, 카테고리 태깅, 검증 플래그는
# 코드의 책임이고 LLM에 맡기면 병렬 호출에서 충돌한다.
# Gemini 구조화 출력은 깊은 중첩·복잡 스키마를 거부할 수 있으므로 평평하게 유지한다.
# --------------------------------------------------------------------------


class GeneratedItem(BaseModel):
    text: str
    phase: Phase
    priority: Priority
    source_action: str
    terms_used: list[str] = Field(default_factory=list)


class CategoryItemsResponse(BaseModel):
    items: list[GeneratedItem] = Field(default_factory=list)


class TranslatedText(BaseModel):
    """번역은 항목 단위로 호출한다. 검증 실패 시 해당 항목만 재시도하기 위함 (§9.3)."""

    text: str
