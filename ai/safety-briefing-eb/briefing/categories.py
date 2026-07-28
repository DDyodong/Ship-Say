"""카테고리 활성화 로직 (명세 §9.1) + 설정·규칙 파일 로딩.

**결정론적으로 구현한다. LLM 호출 금지.**
어떤 카테고리를 다룰지는 코드가 정하고, LLM은 활성화된 카테고리 안에서 문장만 생성한다.
(②모듈의 "판정은 룰엔진, 설명은 LLM"과 동일한 설계 철학.)

활성화는 추론이 아니라 **표 조회**다. 규칙은 전부 data/activation_rules.yaml 에 있고
이 파일은 표를 적용만 한다 (§6.2).

설정·데이터 로딩 함수도 여기 둔다. 파일을 더 쪼개지 않기 위한 선택이며(§12),
generate.py 가 `load_config` 등을 여기서 가져다 쓴다.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import yaml

from .models import (
    Activation,
    CategoryCode,
    CategoryDef,
    GasThreshold,
    MeasureState,
    PermitApproval,
    PermitForm,
    Priority,
    Verdict,
)

BASE_DIR = Path(__file__).parent


# --------------------------------------------------------------------------
# 로딩
# --------------------------------------------------------------------------


def _read_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache(maxsize=1)
def load_config() -> dict:
    return _read_yaml(BASE_DIR / "config.yaml")


def _resolve(key: str) -> Path:
    """config.yaml 의 paths.<key> 를 절대 경로로."""
    return BASE_DIR / load_config()["paths"][key]


@lru_cache(maxsize=1)
def load_categories() -> dict[CategoryCode, CategoryDef]:
    rows = _read_yaml(_resolve("categories"))
    defs = [CategoryDef.model_validate(row) for row in rows]
    missing = set(CategoryCode) - {d.code for d in defs}
    if missing:
        raise ValueError(f"categories.yaml 에 누락된 카테고리: {sorted(m.value for m in missing)}")
    return {d.code: d for d in defs}


@lru_cache(maxsize=1)
def load_activation_rules() -> dict:
    return _read_yaml(_resolve("activation_rules"))


@lru_cache(maxsize=1)
def load_gas_thresholds() -> dict[str, GasThreshold]:
    rows = _read_yaml(_resolve("gas_thresholds"))
    return {row["substance"]: GasThreshold.model_validate(row) for row in rows}


# --------------------------------------------------------------------------
# 가스 판정 (§5.5) — 수치를 코드에 박지 않는다
# --------------------------------------------------------------------------


def gas_issues(permit: PermitApproval) -> list[str]:
    """가스 측정 상태의 문제점을 사유 문장으로 반환한다. 빈 리스트면 이상 없음.

    미측정(배열이 비었거나 value가 null)과 기준 미달을 모두 잡는다.
    """
    thresholds = load_gas_thresholds()

    if not permit.gas_measurements:
        return ["가스농도 측정 결과 없음 (미측정)"]

    issues: list[str] = []
    for m in permit.gas_measurements:
        threshold = thresholds.get(m.substance)
        if m.value is None:
            issues.append(f"{m.substance} 미측정")
            continue
        if threshold is None:
            # 양식에 기준이 인쇄되지 않은 물질. 임의 판정하지 않는다.
            continue
        if not threshold.satisfies(m.value):
            issues.append(
                f"{m.substance} 기준 미달: 측정 {m.value}{threshold.unit} "
                f"(기준 {threshold.display})"
            )
    return issues


# --------------------------------------------------------------------------
# 활성화
# --------------------------------------------------------------------------


class _Accumulator:
    """활성 카테고리를 사유와 함께 모은다."""

    def __init__(self) -> None:
        self._items: dict[CategoryCode, Activation] = {}

    def add(
        self,
        code: CategoryCode,
        reason: str,
        *,
        critical: bool = False,
    ) -> Activation:
        activation = self._items.get(code)
        if activation is None:
            default = load_categories()[code].default_priority
            activation = Activation(category=code, priority=default)
            self._items[code] = activation
        activation.add_reason(reason)
        if critical:
            activation.escalate()
        return activation

    def result(self) -> dict[CategoryCode, Activation]:
        # 12개 카테고리 정의 순서를 유지해 출력이 결정론적이도록 한다.
        order = list(load_categories())
        return {c: self._items[c] for c in order if c in self._items}


def _apply_state(
    acc: _Accumulator,
    code: CategoryCode,
    label: str,
    state: MeasureState,
) -> None:
    """2단 상태 하나를 카테고리에 반영한다 (§6.2 표4).

    required=False  → 기여 없음
    required, 이행  → 활성 + normal (기본 우선순위 유지)
    required, 미이행 → 활성 + critical 강제  ← 체크리스트의 핵심 대상
    """
    if not state.required:
        return
    if state.is_gap:
        acc.add(code, f"{label}: 필요=Y, 확인=N (미이행 안전조치)", critical=True)
    else:
        acc.add(code, f"{label}: 필요=Y, 확인=Y (이행 완료)")


def activate(
    permit: PermitApproval,
    *,
    warnings: Optional[list[str]] = None,
) -> dict[CategoryCode, Activation]:
    """승인 결과 → 활성 카테고리 + 활성화 사유.

    반려된 허가서에는 체크리스트를 생성하지 않으므로 빈 결과를 반환한다 (§5.1, §12).

    입력 데이터 오류(양식과 모순되는 항목 등)는 조용히 삼키지 않는다:
    - `warnings=None` (기본, 단건 CLI): 함수 끝에서 stderr 로 `[입력경고]` 출력
    - `warnings=<list>` (배치): 그 리스트에 append 만 하고 출력하지 않는다 →
      main.run_batch 가 허가서별로 모아 검수 리포트로 집계한다 (§4-H)
    """
    if permit.verdict is Verdict.REJECTED:
        return {}

    rules = load_activation_rules()
    acc = _Accumulator()
    collecting = warnings is not None
    data_warnings: list[str] = warnings if collecting else []

    # (3) 공통 3개 — 항상 활성
    for name in rules["always_on"]:
        acc.add(CategoryCode(name), "모든 양식 공통 항목")

    # (3) 양식 종류
    form_rule = rules["permit_forms"].get(permit.permit_form.value, {})
    for name in form_rule.get("categories", []):
        acc.add(CategoryCode(name), f"양식 종류: {permit.permit_form.value}")

    # (1) 안전조치 요구사항
    is_hot_work = permit.permit_form is PermitForm.HOT_WORK
    measure_rules = rules["safety_measures"]
    for measure in permit.safety_measures:
        rule = measure_rules.get(measure.code.value)
        if rule is None:
            # 양식에 없는 코드. 임의 매핑하지 않고 무시한다 (§12).
            continue
        # 화기양식 전용 항목이 일반위험작업 허가서에 실려 오면 양식과 모순되는
        # 입력이다. 수십~수백 건 배치에서 이런 데이터 오류는 반드시 생기므로,
        # 조용히 무시하지 말고 표면화한다.
        if rule.get("hot_work_only") and not is_hot_work:
            data_warnings.append(
                f"{permit.permit_no}: 화기양식 전용 항목 '{rule['label']}'"
                f"({measure.code.value})가 {permit.permit_form.value} 허가서에 있음 — 무시함"
            )
            continue
        _apply_state(acc, CategoryCode(rule["category"]), rule["label"], measure)

    # (2) 보충작업허가 — 체크된 것만
    supp_rules = rules["supplementary_permits"]
    for field, permit_obj in permit.supplementary_permits.checked().items():
        rule = supp_rules.get(field)
        if rule is None:
            continue
        label = rule["label"]
        codes = [CategoryCode(c) for c in rule["categories"]]
        for code in codes:
            acc.add(code, f"보충작업허가 체크: {label}")
        # 하위 확인사항의 2단 상태도 동일 규칙으로 반영한다.
        for check_name, state in permit_obj.checks().items():
            for code in codes:
                _apply_state(acc, code, f"{label} 보충허가 - {check_name}", state)

    # (4) 추가 강제 규칙
    forced = rules["forced"]

    gas_rule = forced["confined_space_gas_check"]
    if gas_rule.get("enabled") and permit.supplementary_permits.confined_space:
        issues = gas_issues(permit)
        if issues:
            acc.add(
                CategoryCode(gas_rule["category"]),
                f"{gas_rule['reason']} — {'; '.join(issues)}",
                critical=True,
            )

    change_rule = forced["condition_changed"]
    if change_rule.get("enabled") and permit.risk_assessment.condition_changed:
        acc.add(CategoryCode(change_rule["category"]), change_rule["reason"])

    if not collecting:
        for warning in data_warnings:
            print(f"[입력경고] {warning}", file=sys.stderr)

    return acc.result()


def summarize(activations: dict[CategoryCode, Activation]) -> str:
    """사람이 눈으로 확인하기 위한 요약 (디버깅·데모용)."""
    if not activations:
        return "활성 카테고리 없음 (반려되었거나 입력이 비어 있음)"
    defs = load_categories()
    lines = []
    for code, act in activations.items():
        mark = "!" if act.priority is Priority.CRITICAL else " "
        lines.append(f"[{mark}] {code.value} ({defs[code].name_ko}) — {act.priority.value}")
        for reason in act.reasons:
            lines.append(f"      · {reason}")
    return "\n".join(lines)
