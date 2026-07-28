"""체크리스트 생성 + 용어 매칭 + 번역 + 검증 — LLM 호출 전부 (명세 §9.2~§9.4).

파일 분할 기준은 "기능"이 아니라 "바뀌는 이유"다 (§4). LLM을 부르는 코드는
전부 여기 모으고, 프롬프트 문자열만 prompts.py 로 뺀다.

호출 흐름:
    ②승인결과 → categories.activate() → generate_checklist() → translate_checklist()
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import unicodedata
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple, Optional, Protocol, TypeVar

from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError

from .categories import (
    BASE_DIR,
    activate,
    load_categories,
    load_config,
    load_gas_thresholds,
)
from .models import (
    Activation,
    CategoryCode,
    CategoryItemsResponse,
    Checklist,
    ChecklistItem,
    Criticality,
    GeneratedItem,
    GlossaryEntry,
    GlossaryTranslation,
    MatchedTerm,
    PermitApproval,
    Priority,
    TranslatedText,
    Verdict,
)
from .prompts import (
    CHECKLIST_SYSTEM,
    TRANSLATION_SYSTEM,
    build_checklist_prompt,
    build_translation_prompt,
)

T = TypeVar("T", bound=BaseModel)


class RejectedPermitError(ValueError):
    """반려된 허가서로 체크리스트를 생성하려 한 경우 (§5.1, §12)."""


class GenerationError(RuntimeError):
    """재시도 후에도 카테고리 생성에 실패한 경우."""


# --------------------------------------------------------------------------
# LLM 클라이언트
#
# Protocol 로 좁게 정의해 두면 테스트가 google-genai 없이도 파이프라인 전체를
# 검증할 수 있다. 엔진 교체 시 갈아끼울 지점도 여기 하나다.
# --------------------------------------------------------------------------


class LLMClient(Protocol):
    async def generate_json(
        self, *, system: str, prompt: str, schema: type[T]
    ) -> Optional[T]: ...


def _parse_response(response, schema: type[T]) -> Optional[T]:
    """구조화 출력이라도 방어한다 (§9.2 "파싱 실패 방어 코드 필수")."""
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, schema):
        return parsed
    text = getattr(response, "text", None)
    if not text:
        return None
    try:
        return schema.model_validate_json(text)
    except ValidationError:
        pass
    # 모델이 코드펜스로 감싸는 경우까지만 추가로 봐 준다.
    stripped = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    try:
        return schema.model_validate(json.loads(stripped))
    except (ValidationError, json.JSONDecodeError):
        return None


_RETRY_DELAY_RE = re.compile(r"'retryDelay':\s*'(\d+(?:\.\d+)?)s'")


def retry_delay_seconds(exc: BaseException) -> Optional[float]:
    """429(RESOURCE_EXHAUSTED)면 서버가 알려준 대기 초를 돌려준다. 아니면 None.

    무료 티어는 분당 요청 수가 작아서(모델에 따라 5회) 카테고리 병렬 호출이 그대로
    할당량을 넘긴다. 429 는 실패가 아니라 "기다렸다 다시 오라"는 뜻이므로
    카테고리를 통째로 버리지 않고 대기 후 재시도한다.
    """
    message = str(exc)
    if "429" not in message and "RESOURCE_EXHAUSTED" not in message:
        return None
    match = _RETRY_DELAY_RE.search(message)
    return float(match.group(1)) if match else 30.0


class _RateLimiter:
    """요청 간 최소 간격을 강제한다. 429 를 맞고 나서 대응하는 것보다 싸다."""

    def __init__(self, requests_per_minute: int) -> None:
        self._interval = 60.0 / requests_per_minute if requests_per_minute > 0 else 0.0
        self._lock = asyncio.Lock()
        self._next_at = 0.0

    async def acquire(self) -> None:
        if self._interval <= 0:
            return
        async with self._lock:
            now = asyncio.get_running_loop().time()
            wait = max(0.0, self._next_at - now)
            self._next_at = max(now, self._next_at) + self._interval
        if wait:
            await asyncio.sleep(wait)


class GeminiClient:
    """google-genai 기반 구현. API 키는 .env 의 GEMINI_API_KEY 에서 읽는다."""

    def __init__(
        self,
        model: str,
        timeout_sec: int = 60,
        requests_per_minute: int = 5,
        max_429_retries: int = 3,
    ) -> None:
        from google import genai  # 지연 import — 테스트는 이 패키지가 없어도 돈다

        load_dotenv(BASE_DIR / ".env")
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY 가 없다. briefing/.env.example 을 .env 로 복사한 뒤 키를 채울 것."
            )
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._timeout_sec = timeout_sec
        self._limiter = _RateLimiter(requests_per_minute)
        self._max_429_retries = max_429_retries

    async def generate_json(
        self, *, system: str, prompt: str, schema: type[T]
    ) -> Optional[T]:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
        )

        for attempt in range(self._max_429_retries + 1):
            await self._limiter.acquire()
            try:
                response = await self._client.aio.models.generate_content(
                    model=self._model, contents=prompt, config=config
                )
            except Exception as exc:
                delay = retry_delay_seconds(exc)
                if delay is None or attempt == self._max_429_retries:
                    raise
                print(
                    f"[대기] 할당량 초과 — {delay + 1:.0f}초 후 재시도 "
                    f"({attempt + 1}/{self._max_429_retries})",
                    file=sys.stderr,
                )
                await asyncio.sleep(delay + 1)
                continue
            return _parse_response(response, schema)
        return None


@lru_cache(maxsize=1)
def default_client() -> LLMClient:
    llm = load_config()["llm"]
    return GeminiClient(
        model=llm["model"],
        timeout_sec=llm.get("timeout_sec", 60),
        requests_per_minute=llm.get("requests_per_minute", 5),
        max_429_retries=llm.get("max_429_retries", 3),
    )


# --------------------------------------------------------------------------
# 용어사전 (§9.3 1~2단계)
# --------------------------------------------------------------------------


def _glossary_dir() -> Path:
    return BASE_DIR / load_config()["paths"]["glossary_dir"]


def _read_json(path: Path) -> list:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_glossary_base() -> list[GlossaryEntry]:
    rows = _read_json(_glossary_dir() / "glossary.base.json")
    return [GlossaryEntry.model_validate(r) for r in rows]


@lru_cache(maxsize=8)
def load_glossary_translations(lang: str) -> dict[str, GlossaryTranslation]:
    """사전이 비어 있어도(스텁 상태여도) 정상 동작해야 한다 (§10 병렬화 지침)."""
    rows = _read_json(_glossary_dir() / f"glossary.{lang}.json")
    entries = [GlossaryTranslation.model_validate(r) for r in rows]
    return {e.term_id: e for e in entries}


def normalize(text: str) -> str:
    """굴절·조사·띄어쓰기 차이를 흡수하기 위한 정규화.

    완전 일치가 아니라 정규화 후 부분 일치를 쓴다 (§9.4).
    TODO(팀확인): 형태소 분석기(Kiwi/Mecab) 도입 시 이 함수를 대체한다.
    """
    text = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"\s+", "", text)


def match_terms(
    text: str, category: Optional[CategoryCode], lang: str
) -> list[MatchedTerm]:
    """항목 텍스트에서 사전 표제어를 탐지한다 (동의어 포함).

    항목의 category 와 용어의 safety_categories 를 교차해 우선 매칭한다.
    전체 사전을 프롬프트에 넣지 않기 위해 상한을 둔다 (§12).
    """
    haystack = normalize(text)
    translations = load_glossary_translations(lang)

    matched: list[tuple[int, int, MatchedTerm]] = []
    for entry in load_glossary_base():
        surfaces = [entry.ko, *entry.synonyms]
        if not any(normalize(s) and normalize(s) in haystack for s in surfaces):
            continue
        category_rank = 0 if category and category in entry.safety_categories else 1
        criticality_rank = {
            Criticality.HIGH: 0,
            Criticality.MEDIUM: 1,
            Criticality.LOW: 2,
        }[entry.criticality]
        matched.append(
            (
                category_rank,
                criticality_rank,
                MatchedTerm(entry=entry, translation=translations.get(entry.term_id)),
            )
        )

    matched.sort(key=lambda row: (row[0], row[1], row[2].entry.term_id))
    limit = load_config()["glossary"]["max_terms_per_item"]
    return [row[2] for row in matched[:limit]]


# --------------------------------------------------------------------------
# 검증 (§9.4)
# --------------------------------------------------------------------------

_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
_UNIT_TOKENS = ("%", "ppm")


def _numbers(text: str) -> list[str]:
    """숫자 집합. 언어를 몰라도 검증 가능한 가장 확실한 수단이다."""
    values = [n.rstrip("0").rstrip(".") if "." in n else n for n in _NUMBER_RE.findall(text)]
    return sorted(values)


class ValidationResult(NamedTuple):
    issues: list[str]
    hard: bool  # True 면 재시도 필수


def validate_translation(
    source: str, translated: str, matched: list[MatchedTerm]
) -> ValidationResult:
    """지정 역어 사용 + 수치 무결성 검증."""
    issues: list[str] = []
    hard = False

    # 수치 무결성 — 원문과 번역문의 숫자 집합이 일치해야 한다
    src_numbers, dst_numbers = _numbers(source), _numbers(translated)
    if src_numbers != dst_numbers:
        issues.append(
            f"수치 불일치: 원문 {src_numbers or '없음'} vs 번역문 {dst_numbers or '없음'}"
        )
        hard = True

    for unit in _UNIT_TOKENS:
        if source.lower().count(unit) != translated.lower().count(unit):
            issues.append(f"단위 '{unit}' 개수 불일치")
            hard = True

    # 지정 역어 — 굴절·조사가 붙을 수 있으므로 정규화 후 부분 일치
    haystack = normalize(translated)
    for term in matched:
        target = term.target
        if not target:
            continue  # 역어 미등재. 검사 대상 아님
        if normalize(target) in haystack:
            continue
        issues.append(f'지정 역어 누락: "{term.entry.ko}" → "{target}"')
        if term.entry.criticality is Criticality.HIGH:
            hard = True  # criticality high 누락은 하드 실패

    return ValidationResult(issues, hard)


# --------------------------------------------------------------------------
# 체크리스트 생성 (§9.2)
# --------------------------------------------------------------------------


def _gas_threshold_lines() -> list[str]:
    return [
        f"{t.substance} ({t.name_ko}): {t.display}"
        for t in load_gas_thresholds().values()
    ]


async def _generate_one_category(
    client: LLMClient,
    permit: PermitApproval,
    code: CategoryCode,
    activation: Activation,
    semaphore: asyncio.Semaphore,
) -> tuple[CategoryCode, list[GeneratedItem]]:
    """카테고리 하나에 대한 개별 LLM 호출 (§6.4)."""
    definition = load_categories()[code]
    prompt = build_checklist_prompt(
        permit, definition, activation, _gas_threshold_lines()
    )
    retries = load_config()["llm"]["max_retries"]

    last_error: Optional[str] = None
    for _ in range(retries + 1):
        async with semaphore:
            try:
                response = await client.generate_json(
                    system=CHECKLIST_SYSTEM,
                    prompt=prompt,
                    schema=CategoryItemsResponse,
                )
            except Exception as exc:  # 네트워크·쿼터 등 — 실패한 카테고리만 재시도
                last_error = f"{type(exc).__name__}: {exc}"
                continue
        if response is not None and response.items:
            return code, response.items[: definition.max_items]
        last_error = "빈 응답 또는 JSON 파싱 실패"

    raise GenerationError(f"{code.value} 생성 실패 ({last_error})")


def _clamp_priority(item_priority: Priority, category_priority: Priority) -> Priority:
    """항목 우선순위가 카테고리 활성화 우선순위를 넘지 못하게 한다.

    critical 은 "필요=Y, 확인=N" 판정에서만 나와야 한다 (§6.2 표4). LLM 이 문장을
    쓰다가 스스로 격상시키면 이행 완료된 항목까지 critical 이 되어 §15 오탐 검증이
    무의미해진다.
    """
    if category_priority is Priority.NORMAL and item_priority is Priority.CRITICAL:
        return Priority.NORMAL
    return item_priority


def _bigrams(text: str) -> set[str]:
    normalized = normalize(text)
    if len(normalized) < 2:
        return {normalized} if normalized else set()
    return {normalized[i : i + 2] for i in range(len(normalized) - 1)}


# 이보다 짧은 문장은 중복 판정에서 제외한다. 겹침 계수는 짧은 문자열에서 과민해서
# ("가연물 제거 확인" vs "점화원 관리 확인" 같은 짧은 문장은 공통 어미만으로 0.7을 넘는다)
# 서로 다른 지시를 지워 버린다. 실제 체크리스트 항목은 30자 이상이라 걸리지 않는다.
_MIN_BIGRAMS_FOR_DEDUP = 20


def _overlap(a: set[str], b: set[str]) -> float:
    """겹침 계수. 짧은 쪽이 긴 쪽에 대부분 포함되면 1에 가깝다.

    Jaccard 를 쓰지 않는 이유: 같은 지시라도 카테고리마다 문장 길이가 크게 달라서
    ("산소농도 18% 이상 확인" vs "산소 18% 이상, CO 30ppm 미만, H2S 10ppm 미만 확인")
    Jaccard 는 길이 차이만으로 점수를 깎아 중복을 놓친다.
    """
    if len(a) < _MIN_BIGRAMS_FOR_DEDUP or len(b) < _MIN_BIGRAMS_FOR_DEDUP:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def _dedupe(
    pairs: list[tuple[CategoryCode, GeneratedItem]], threshold: float
) -> tuple[list[tuple[CategoryCode, GeneratedItem]], int]:
    """앞선 항목과 사실상 같은 문장을 버린다. 입력은 우선순위 순으로 정렬돼 있어야 한다.

    카테고리가 통째로 비면 §11 커버리지 기준을 깨므로, 버려진 항목이라도
    그 카테고리의 유일한 항목이면 되살린다. 중복 하나를 남기는 편이
    활성 카테고리가 브리핑에서 사라지는 것보다 낫다.
    """
    kept: list[tuple[CategoryCode, GeneratedItem]] = []
    dropped: list[tuple[CategoryCode, GeneratedItem]] = []
    signatures: list[set[str]] = []

    for pair in pairs:
        signature = _bigrams(pair[1].text)
        if any(_overlap(signature, seen) >= threshold for seen in signatures):
            dropped.append(pair)
            continue
        signatures.append(signature)
        kept.append(pair)

    removed = len(dropped)
    covered = {code for code, _ in kept}
    for code, item in dropped:
        if code not in covered:
            kept.append((code, item))
            covered.add(code)
            removed -= 1
    return kept, removed


def _assemble(
    generated: dict[CategoryCode, list[GeneratedItem]],
    activations: dict[CategoryCode, Activation],
) -> list[ChecklistItem]:
    """중복 제거 → 항목 수 통제 → item_id 부여 (§6.3).

    전체 상한을 넘으면 critical 우선으로 절삭하되, **활성 카테고리마다 최소 1개**는
    남긴다. §11의 카테고리 커버리지 기준과 충돌하지 않게 하기 위해서다.
    """
    config = load_config()["checklist"]
    max_total = config["max_total_items"]
    threshold = config.get("dedup_threshold", 0)
    order = {code: i for i, code in enumerate(load_categories())}

    def rank(code: CategoryCode) -> tuple[int, int]:
        critical = activations[code].priority is Priority.CRITICAL
        return (0 if critical else 1, order[code])

    # 0) 중복 제거 — 우선순위 높은 카테고리가 그 문장의 임자다
    ordered = [
        (code, item) for code in sorted(generated, key=rank) for item in generated[code]
    ]
    if threshold > 0:
        ordered, removed = _dedupe(ordered, threshold)
        if removed:
            print(f"[정리] 중복 항목 {removed}개 제거", file=sys.stderr)

    survivors: dict[CategoryCode, list[GeneratedItem]] = {}
    for code, item in ordered:
        survivors.setdefault(code, []).append(item)

    # 1) 카테고리마다 대표 1개씩 확보 (critical 카테고리 우선)
    reserved: list[tuple[CategoryCode, GeneratedItem]] = []
    remainder: list[tuple[CategoryCode, GeneratedItem]] = []
    for code in sorted(survivors, key=rank):
        items = survivors[code]
        if not items:
            continue
        reserved.append((code, items[0]))
        remainder.extend((code, item) for item in items[1:])

    selected = reserved[:max_total]

    # 2) 남는 자리를 critical 항목부터 채운다
    def item_rank(pair: tuple[CategoryCode, GeneratedItem]) -> tuple[int, int]:
        code, item = pair
        priority = _clamp_priority(item.priority, activations[code].priority)
        return (0 if priority is Priority.CRITICAL else 1, order[code])

    remainder.sort(key=item_rank)
    selected.extend(remainder[: max(0, max_total - len(selected))])

    # 3) 출력 순서를 정리하고 item_id 를 코드가 부여한다
    selected.sort(key=item_rank)
    return [
        ChecklistItem(
            item_id=f"CHK-{i:03d}",
            category=code,
            phase=item.phase,
            text=item.text,
            # 우선순위는 룰엔진 판정이지 LLM 재량이 아니다 (§6.2 표4).
            # 카테고리가 normal 인데 LLM 이 critical 을 붙이면 오탐이 되므로 깎는다.
            # 반대 방향(critical 카테고리에서 normal 로 낮추기)은 허용한다.
            priority=_clamp_priority(item.priority, activations[code].priority),
            terms_used=item.terms_used,
            source_action=item.source_action,
        )
        for i, (code, item) in enumerate(selected, start=1)
    ]


async def generate_checklist(
    permit: PermitApproval,
    *,
    client: Optional[LLMClient] = None,
    strict: bool = False,
    warnings: Optional[list[str]] = None,
) -> Checklist:
    """②승인결과 → 한국어 체크리스트.

    strict=True 면 카테고리 하나라도 실패했을 때 예외를 올린다.
    기본값(False)은 실패한 카테고리를 건너뛰고 나머지로 진행한다.
    warnings 리스트를 주면 활성화 단계의 입력 데이터 경고를 stderr 대신 거기 모은다 (§4-H).
    """
    if permit.verdict is Verdict.REJECTED:
        raise RejectedPermitError(
            f"{permit.permit_no} 는 반려된 허가서다. 체크리스트를 생성하지 않는다."
        )

    activations = activate(permit, warnings=warnings)
    if not activations:
        raise GenerationError(f"{permit.permit_no}: 활성화된 카테고리가 없다.")

    client = client or default_client()
    semaphore = asyncio.Semaphore(load_config()["llm"]["max_concurrency"])

    results = await asyncio.gather(
        *(
            _generate_one_category(client, permit, code, activation, semaphore)
            for code, activation in activations.items()
        ),
        return_exceptions=True,
    )

    generated: dict[CategoryCode, list[GeneratedItem]] = {}
    failures: list[str] = []
    for result in results:
        if isinstance(result, BaseException):
            if strict:
                raise result
            failures.append(str(result))
            continue
        code, items = result
        generated[code] = items

    if failures:
        print(f"[경고] 일부 카테고리 생성 실패: {'; '.join(failures)}", file=sys.stderr)

    return Checklist(
        permit_id=permit.permit_no,
        lang=load_config()["languages"]["source"],
        generated_at=datetime.now(),
        activated_categories=list(activations),
        items=_assemble(generated, activations),
    )


# --------------------------------------------------------------------------
# 번역 (§9.3)
# --------------------------------------------------------------------------


async def _translate_item(
    client: LLMClient,
    item: ChecklistItem,
    lang: str,
    semaphore: asyncio.Semaphore,
) -> ChecklistItem:
    matched = match_terms(item.text, item.category, lang)
    retries = load_config()["llm"]["max_retries"]

    issues: list[str] = []
    translated_text: Optional[str] = None

    for _ in range(retries + 1):
        prompt = build_translation_prompt(item.text, lang, matched, issues or None)
        async with semaphore:
            try:
                response = await client.generate_json(
                    system=TRANSLATION_SYSTEM, prompt=prompt, schema=TranslatedText
                )
            except Exception as exc:
                issues = [f"번역 호출 실패: {type(exc).__name__}: {exc}"]
                continue
        if response is None or not response.text.strip():
            issues = ["빈 응답 또는 JSON 파싱 실패"]
            continue

        translated_text = response.text.strip()
        result = validate_translation(item.text, translated_text, matched)
        if not result.issues:
            issues = []
            break
        issues = result.issues
        if not result.hard:
            break  # 소프트 이슈는 기록만 하고 재시도하지 않는다

    if translated_text is None:
        # 번역 자체를 못 얻었다. 원문을 남기고 사람 검토 큐로 보낸다.
        return item.model_copy(
            update={
                "needs_review": True,
                "validation_issues": issues or ["번역 실패"],
            }
        )

    return item.model_copy(
        update={
            "text": translated_text,
            "terms_used": [m.entry.ko for m in matched],
            "needs_review": bool(issues),
            "validation_issues": issues,
        }
    )


async def translate_checklist(
    checklist: Checklist, lang: str, *, client: Optional[LLMClient] = None
) -> Checklist:
    """한국어 체크리스트 → 대상 언어. 항목 단위 병렬 호출."""
    client = client or default_client()
    semaphore = asyncio.Semaphore(load_config()["llm"]["max_concurrency"])

    items = await asyncio.gather(
        *(_translate_item(client, item, lang, semaphore) for item in checklist.items)
    )
    return checklist.model_copy(update={"lang": lang, "items": list(items)})


async def build_all(
    permit: PermitApproval,
    langs: list[str],
    *,
    client: Optional[LLMClient] = None,
    warnings: Optional[list[str]] = None,
) -> dict[str, Checklist]:
    """한국어 생성 + 요청된 대상 언어 번역을 한 번에."""
    client = client or default_client()
    source_lang = load_config()["languages"]["source"]

    korean = await generate_checklist(permit, client=client, warnings=warnings)
    result = {source_lang: korean}
    for lang in langs:
        if lang == source_lang:
            continue
        result[lang] = await translate_checklist(korean, lang, client=client)
    return result


# --------------------------------------------------------------------------
# CLI — 데모·스모크 테스트용
# --------------------------------------------------------------------------


def main(argv: Optional[list[str]] = None) -> int:
    config = load_config()
    parser = argparse.ArgumentParser(description="다국어 안전 체크리스트 생성 (T1~T5, T9)")
    parser.add_argument("--permit", required=True, help="②모듈 승인 결과 JSON 경로")
    parser.add_argument(
        "--lang",
        default=",".join([config["languages"]["source"], *config["languages"]["targets"]]),
        help="쉼표로 구분한 언어 코드 (기본: config.yaml 의 전체)",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="storage.root 에 체크리스트+매니페스트를 저장한다 (§5.4). 생략 시 표준출력",
    )
    parser.add_argument(
        "--out",
        help="저장 루트 override (기본: config.yaml 의 storage.root). --save 와 함께 쓴다",
    )
    args = parser.parse_args(argv)

    with open(args.permit, encoding="utf-8") as f:
        permit = PermitApproval.model_validate(json.load(f))

    langs = [lang.strip() for lang in args.lang.split(",") if lang.strip()]
    checklists = asyncio.run(build_all(permit, langs))

    if args.save or args.out:
        from . import storage

        root = Path(args.out).resolve() if args.out else storage.default_root()
        manifest = storage.persist(checklists, root=root)
        print(f"저장 완료: {storage.permit_dir(root, permit.permit_no)}")
        print(f"  체크리스트 {len(checklists)}개 언어 + manifest.json ({len(manifest.items)}개 항목)")
        flagged = sum(
            1 for item in manifest.items for v in item.needs_review.values() if v
        )
        if flagged:
            print(f"  ⚠ 검토 필요 번역 {flagged}건 (needs_review)")
    else:
        for lang, checklist in checklists.items():
            print(json.dumps(checklist.model_dump(mode="json"), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
