"""프롬프트 문자열 전부 (명세 §9.2, §9.3).

프롬프트는 튜닝하느라 자주 고치는 부분이라 별도 파일로 분리한다 (§4).
제약 문구를 임의로 완화하지 말 것 — 없는 안전 조치를 지어내면 그대로 사고다.
"""

from __future__ import annotations

from .models import Activation, CategoryDef, MatchedTerm, PermitApproval

# --------------------------------------------------------------------------
# 체크리스트 생성 (§9.2)
# --------------------------------------------------------------------------

CHECKLIST_SYSTEM = """\
당신은 조선소 현장의 산업안전 담당자다. 승인된 작업허가서의 조건을 근거로
TBM(작업 전 안전점검회의)에서 근로자에게 전달할 안전 체크리스트 항목을 작성한다.

반드시 지킬 것:
- 제공된 승인 조건과 카테고리 생성 기준에 없는 내용을 추가하지 마라.
- 지정된 카테고리에 해당하는 항목만 생성하라. 다른 카테고리 주제를 포함하지 마라.
- 각 항목은 현장 근로자가 즉시 실행 가능한 단일 행동으로 작성하라.
- 언제·무엇을·기준치가 드러나야 한다. "산소농도 측정"이 아니라
  "탱크 진입 전 산소농도를 측정하고 18% 이상인지 확인한다"처럼 쓴다.
- 수치 기준이 필요하면 아래 제공된 허용기준 표의 값만 인용하라. 임의 수치 금지.
- 각 항목이 어떤 승인 조건에서 도출되었는지 source_action 에 명시하라.
- 한국어로 작성한다.
"""

CHECKLIST_USER = """\
## 카테고리
코드: {code}
이름: {name_ko}
이 카테고리의 생성 기준:
{criteria}

## 이 카테고리가 활성화된 이유 (승인 조건에서 도출됨)
{reasons}

## 작업 정보
허가번호: {permit_no}
양식 종류: {permit_form}
작업 구역: {block_id} ({area_type})
작업 기간: {period_start} ~ {period_end}
작업 개요: {work_summary}

## ②모듈 권고사항
{recommended_actions}

## ②모듈 지적 위반사항
{violations}

## 가스농도 허용기준 (작업허가서 양식 인쇄값)
{gas_thresholds}

## 요구사항
- 항목 수: 최대 {max_items}개
- 이 카테고리의 우선순위는 "{priority}" 다. 각 항목의 priority 에 이 값을 쓰되,
  명백히 덜 급한 항목만 normal 로 낮출 수 있다.
- phase 는 작업전 / 작업중 / 비상시 중 하나를 고른다.
- terms_used 에는 항목 문장에 쓴 산업안전 전문용어를 적는다.
"""


def _bullets(values: list[str], empty: str = "(없음)") -> str:
    if not values:
        return empty
    return "\n".join(f"- {v}" for v in values)


def build_checklist_prompt(
    permit: PermitApproval,
    definition: CategoryDef,
    activation: Activation,
    gas_threshold_lines: list[str],
) -> str:
    return CHECKLIST_USER.format(
        code=definition.code.value,
        name_ko=definition.name_ko,
        criteria=_bullets(definition.generation_criteria),
        reasons=_bullets(activation.reasons),
        permit_no=permit.permit_no,
        permit_form=permit.permit_form.value,
        block_id=permit.zone.block_id,
        area_type=permit.zone.area_type.value,
        period_start=permit.work_period.start.isoformat(),
        period_end=permit.work_period.end.isoformat(),
        work_summary=permit.work_summary,
        recommended_actions=_bullets(permit.recommended_actions),
        violations=_bullets(
            [f"{v.summary} ({v.legal_basis})" for v in permit.violations]
        ),
        gas_thresholds=_bullets(gas_threshold_lines),
        max_items=definition.max_items,
        priority=activation.priority.value,
    )


# --------------------------------------------------------------------------
# 번역 (§9.3)
# --------------------------------------------------------------------------

TRANSLATION_SYSTEM = """\
당신은 산업안전 분야 전문 번역가다. 조선소 외국인 근로자에게 전달할
안전 지시문을 번역한다. 오역은 곧 사고다.

반드시 지킬 것:
- 안전 지시문이므로 의미를 추가·생략·완화하지 마라.
- 숫자·단위·기준치는 원문 그대로 유지하라. (예: 18% → 18%, 30ppm → 30ppm)
- 아래에 지정 역어가 제시된 용어는 반드시 그 역어를 그대로 사용하라.
- 현장 근로자가 즉시 이해할 수 있는 평이한 문장으로 쓴다.
- 설명이나 주석을 덧붙이지 말고 번역문만 출력하라.
"""

TRANSLATION_USER = """\
## 목표 언어
{lang_name} ({lang})

## 반드시 사용해야 하는 지정 역어
{terms}

## 번역할 안전 지시문 (한국어)
{text}
"""

TRANSLATION_RETRY_SUFFIX = """\

## 직전 번역의 문제점 — 반드시 고칠 것
{issues}
"""

LANG_NAMES = {
    "ko": "한국어",
    "en": "영어",
    "ne": "네팔어",
    "uz": "우즈베크어",
}


def build_translation_prompt(
    text: str,
    lang: str,
    matched: list[MatchedTerm],
    issues: list[str] | None = None,
) -> str:
    if matched:
        term_lines = []
        for m in matched:
            target = m.target or "(역어 미등재 — 문맥에 맞게 번역하되 의미를 바꾸지 말 것)"
            line = f'- "{m.entry.ko}" → "{target}"'
            if m.entry.definition:
                line += f" | 뜻: {m.entry.definition}"
            if m.translation and m.translation.note:
                line += f" | 주의: {m.translation.note}"
            term_lines.append(line)
        terms = "\n".join(term_lines)
    else:
        terms = "(이 문장에서 사전 등재 용어가 탐지되지 않았다)"

    prompt = TRANSLATION_USER.format(
        lang_name=LANG_NAMES.get(lang, lang),
        lang=lang,
        terms=terms,
        text=text,
    )
    if issues:
        prompt += TRANSLATION_RETRY_SUFFIX.format(issues=_bullets(issues))
    return prompt
