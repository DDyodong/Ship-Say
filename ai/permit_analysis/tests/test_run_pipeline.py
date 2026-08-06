# -*- coding: utf-8 -*-
"""
run_pipeline.py 회귀테스트 — JSON 저장 구조(재제출 판단·승인/반려 폴더분리·
SIMOPS 비교범위·기존 허가서 갱신·버전선택)를 검증한다.

⚠️ 2026-08-06까지 run_pipeline.py의 저장 로직은 main() 안에 전부 중첩 함수로
있어서 외부에서 호출할 수 없었다(테스트 불가능한 구조였음 — 실제로 이 상태
에서 버전비교 버그(int>dict)와 _counterpart_note 순환논리 버그가 둘 다
수작업 재현으로만 뒤늦게 발견됨). 이 파일을 추가하면서 run_pipeline.py를
`process_permits()` 등 모듈 최상위 함수로 리팩터링해서 아래 테스트들이
실제 저장 로직을 그대로 호출해 검증할 수 있도록 했다(동작은 바꾸지 않음).
"""
import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from ptw_parser import Permit
from run_pipeline import (
    process_permits, _same_job, _load_existing_active_permits,
)


T1, T2 = datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18)


def _clean_permit(pid, main_works, zone, summary, applicant, conditions=None,
                   gas_results=None):
    """자체위반이 안 생기도록 필수 필드를 다 채운 '깨끗한' 허가서.
    SIMOPS·저장 구조만 순수하게 테스트하기 위한 헬퍼(tests/test_simops.py의
    _permit() 헬퍼와 같은 목적)."""
    conditions = conditions or []
    return Permit(
        permit_id=pid, form_type=(main_works[0] if main_works else "일반위험"),
        main_works=main_works, conditions=conditions,
        zone=zone, start=T1, end=T2, work_summary=summary,
        issue_date="2026.08.01", applicant=applicant,
        worker_name="이작업", witness_name="박입회",
        attachments=["작업계획서", "소화기목록", "특수작업절차서", "안전장구목록"],
        risk_assessment=True, change_review=True,
        marked_required=["작업구역설정", "작업주위 가연성물질 제거", "가스농도측정",
                          "비산불티 차단막 설치", "환기장비", "소화기", "안전장구",
                          "안전교육", "통신수단", "구명장구"],
        confirmed=["작업구역설정", "작업주위 가연성물질 제거", "가스농도측정",
                   "비산불티 차단막 설치", "환기장비", "소화기", "안전장구",
                   "안전교육", "통신수단", "구명장구"],
        gas_results=gas_results or {"HC": 0.0, "O2": 20.0, "CO": 20.0, "CO2": 1.0, "H2S": 5.0},
        supplementary_confirmer={c: "확인자" for c in conditions},
    )


class _TmpOutDir:
    """테스트마다 격리된 outputs/ 폴더를 만들고 끝나면 지운다."""

    def __enter__(self):
        self.path = Path(tempfile.mkdtemp(prefix="ptw_test_"))
        return self.path

    def __exit__(self, *a):
        shutil.rmtree(self.path, ignore_errors=True)


class Test재제출_판단:
    """구역·작업개요·신청인이 같으면 재제출, 하나라도 다르면 별개 작업."""

    def test_구역_개요_신청인_모두_같으면_같은작업(self):
        old = {"zone": "A구역", "work_summary": "용접", "people": {"applicant": "김신청"}}
        p = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
        assert _same_job(old, p) is True

    def test_구역만_달라도_다른작업(self):
        old = {"zone": "A구역", "work_summary": "용접", "people": {"applicant": "김신청"}}
        p = _clean_permit("PTW-1", ["화기"], "B구역", "용접", "김신청")
        assert _same_job(old, p) is False

    def test_작업시간은_판단기준에_포함되지_않음(self):
        """⚠️ 사용자가 '작업시간·작업개요·신청인'이 기준이라고 알고 있었는데,
        실제 코드는 구역·작업개요·신청인만 보고 작업시간은 안 본다.
        재제출 때 시간대가 살짝 조정되는 경우가 흔해서 의도적으로 뺀 것 —
        이 테스트는 그 사실을 코드로 못박아둔다."""
        old = {"zone": "A구역", "work_summary": "용접", "people": {"applicant": "김신청"}}
        p = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
        p.start, p.end = datetime(2026, 8, 2, 8), datetime(2026, 8, 2, 17)  # 시간만 다르게
        assert _same_job(old, p) is True


class Test승인반려_폴더분리_및_버전관리:

    def test_자체위반없으면_approved_폴더에_저장(self):
        with _TmpOutDir() as out_dir:
            p = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            proc = process_permits([p], out_dir, use_ai=False)
            assert proc["own_decision_map"]["PTW-1"] == "승인"
            assert len(proc["saved_paths"]) == 1
            assert proc["saved_paths"][0].parent.name == "approved"

    def test_재제출은_버전이_올라감(self):
        with _TmpOutDir() as out_dir:
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청",
                                gas_results={"HC": 0.0, "O2": 15.0, "CO": 20.0, "CO2": 1.0, "H2S": 5.0})  # O2 미달 -> 반려
            proc1 = process_permits([p1], out_dir, use_ai=False)
            assert proc1["own_decision_map"]["PTW-1"] == "반려"
            assert proc1["saved_paths"][0].name == "permit_PTW-1_v1.json"
            assert proc1["saved_paths"][0].parent.name == "rejected"

            # 같은 작업, 가스농도만 정상값으로 고쳐서 재제출
            p2 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            proc2 = process_permits([p2], out_dir, use_ai=False)
            assert proc2["own_decision_map"]["PTW-1"] == "승인"
            assert proc2["saved_paths"][0].name == "permit_PTW-1_v2.json"
            assert proc2["saved_paths"][0].parent.name == "approved"

    def test_번호만_같고_다른작업이면_CONFLICT_그룹으로_분리(self):
        with _TmpOutDir() as out_dir:
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            process_permits([p1], out_dir, use_ai=False)

            p2 = _clean_permit("PTW-1", ["도장"], "B구역", "도장작업", "박신청")
            proc2 = process_permits([p2], out_dir, use_ai=False)
            assert "_CONFLICT2_" in proc2["saved_paths"][0].name

    def test_완전동일결과_재실행시_새버전_생성안함(self):
        with _TmpOutDir() as out_dir:
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            proc1 = process_permits([p1], out_dir, use_ai=False)
            p1_again = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            proc2 = process_permits([p1_again], out_dir, use_ai=False)
            assert proc1["saved_paths"][0] == proc2["saved_paths"][0]
            assert proc2["saved_paths"][0].name == "permit_PTW-1_v1.json"


class TestSIMOPS_승인반려_무관하게_전부비교:
    """⚠️ 2026-08 설계: 개별판정이 반려든 승인이든 상관없이 outputs/의 모든
    기존 허가서가 SIMOPS 비교 대상에 포함된다(가스측정 미비 등으로 반려된
    허가서라도, '그 구역·시간에 그 작업이 계획돼 있다'는 사실 자체는
    유효하기 때문)."""

    def test_기존에_반려로_저장된_허가서도_SIMOPS_비교대상(self):
        with _TmpOutDir() as out_dir:
            # 1건: 가스농도 미달로 반려 상태인 화기작업 (rejected 폴더에 저장됨)
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청",
                                gas_results={"HC": 0.0, "O2": 15.0, "CO": 20.0, "CO2": 1.0, "H2S": 5.0})
            proc1 = process_permits([p1], out_dir, use_ai=False)
            assert proc1["saved_paths"][0].parent.name == "rejected"

            # 2건: 같은 구역·시간에 중장비작업(화기x중장비는 위험조합) 신규 제출
            p2 = _clean_permit("PTW-2", ["일반위험"], "A구역", "중장비 작업", "박신청",
                                conditions=["중장비"])
            p2.equipment_type, p2.driver_name = "지게차", "김기사"
            p2.marked_required += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                                    "전선·설비간섭", "신호수", "자격증", "부속장구"]
            p2.confirmed += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                              "전선·설비간섭", "신호수", "자격증", "부속장구"]
            proc2 = process_permits([p2], out_dir, use_ai=False)

            found = [c for c in proc2["result"]["pair_conflicts"]
                     if set(c["permits"]) == {"PTW-1", "PTW-2"}]
            assert found, "반려 상태인 기존 허가서와도 SIMOPS 충돌이 검출돼야 한다"


class Test기존허가서_카운터파트_갱신:
    """⚠️ 사용자가 '기존 SIMOPS 판정은 변함없다'고 이해하고 있었지만, 실제로는
    신규 허가서와 새로 충돌이 발견되면 그 상대방인 기존 허가서 쪽에도 새
    버전 파일이 만들어진다(제출순서 불공평 방지 — 2026-08 설계)."""

    def test_기존_승인허가서도_새충돌_발견되면_새버전_생성(self):
        with _TmpOutDir() as out_dir:
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            proc1 = process_permits([p1], out_dir, use_ai=False)
            assert proc1["saved_paths"][0].name == "permit_PTW-1_v1.json"

            p2 = _clean_permit("PTW-2", ["일반위험"], "A구역", "중장비 작업", "박신청",
                                conditions=["중장비"])
            p2.equipment_type, p2.driver_name = "지게차", "김기사"
            p2.marked_required += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                                    "전선·설비간섭", "신호수", "자격증", "부속장구"]
            p2.confirmed += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                              "전선·설비간섭", "신호수", "자격증", "부속장구"]
            proc2 = process_permits([p2], out_dir, use_ai=False)

            updated_names = [p.name for p in proc2["updated_counterpart_paths"]]
            assert any(n.startswith("permit_PTW-1_v2") for n in updated_names), \
                f"기존 PTW-1도 v2로 갱신돼야 하는데 실제로는: {updated_names}"


class Test버전선택_최신값_사용:
    """⚠️ 2026-08-06 실사용 중 발견된 버그의 회귀테스트: 같은 permit_id로
    저장된 파일이 2개 이상(v1, v2 ...)일 때, latest_by_group의 버전 비교를
    잘못된 튜플 인덱스([1]=dict)로 하고 있어서 'int > dict' TypeError가
    발생했었다. [2](=version)로 비교하도록 고쳤고, 이 테스트는 실제로 v1·v2
    두 파일이 동시에 있는 상태에서 크래시 없이 최신(v2) 내용을 읽어오는지
    검증한다."""

    def test_v1_v2_동시존재시_최신버전을_SIMOPS비교대상으로_사용(self):
        with _TmpOutDir() as out_dir:
            (out_dir / "approved").mkdir(parents=True)
            v1 = {
                "permit_id": "PTW-1", "form_type": "화기", "main_works": ["화기"],
                "conditions": [], "zone": "구역-옛날", "job_group": 1, "version": 1,
                "period": {"start": T1.isoformat(), "end": T2.isoformat()},
                "permit_violations": [],
            }
            v2 = {**v1, "zone": "구역-최신", "version": 2}
            (out_dir / "approved" / "permit_PTW-1_v1.json").write_text(
                json.dumps(v1, ensure_ascii=False), encoding="utf-8")
            (out_dir / "approved" / "permit_PTW-1_v2.json").write_text(
                json.dumps(v2, ensure_ascii=False), encoding="utf-8")

            # 크래시 없이 로드되는지가 핵심(예전 버그는 여기서 TypeError)
            permits, existing_map = _load_existing_active_permits(out_dir)
            assert len(permits) == 1
            assert permits[0].zone == "구역-최신"


class Test상대방_개별사유_안내문구_회귀:
    """⚠️ 2026-08-06 발견/수정된 버그의 핵심 회귀테스트: 자체위반 0건으로
    정상 승인된 허가서가, 단지 SIMOPS 충돌 때문에 최종등급이 '반려'가 된
    경우 own_decision_map(최종등급)을 그대로 참조하면 '상대방이 개별사유로
    반려 상태'라는 완전히 틀린 안내문이 나온다. own_violation_only_map(자체
    위반만)을 참조해야 이 순환논리를 피할 수 있다."""

    def test_자체위반0건이_SIMOPS충돌로만_반려여도_개별사유_안내문_안뜸(self):
        with _TmpOutDir() as out_dir:
            # 기존 화기작업(자체위반 없음, 승인)
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청")
            process_permits([p1], out_dir, use_ai=False)

            # 신규 중장비작업 — A구역·같은 시간대라 화기x중장비 SIMOPS 충돌 유발
            p2 = _clean_permit("PTW-2", ["일반위험"], "A구역", "중장비 작업", "박신청",
                                conditions=["중장비"])
            p2.equipment_type, p2.driver_name = "지게차", "김기사"
            p2.marked_required += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                                    "전선·설비간섭", "신호수", "자격증", "부속장구"]
            p2.confirmed += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                              "전선·설비간섭", "신호수", "자격증", "부속장구"]
            proc2 = process_permits([p2], out_dir, use_ai=False)

            conflicts = [c for c in proc2["result"]["pair_conflicts"]
                         if set(c["permits"]) == {"PTW-1", "PTW-2"}]
            assert conflicts, "테스트 전제: SIMOPS 충돌이 실제로 발생해야 함"

            # 자체위반만 놓고 보면 PTW-1은 절대 '반려'가 아니어야 한다
            assert proc2["own_violation_only_map"]["PTW-1"] != "반려"

            note_fn = proc2["counterpart_note_fn"]
            for c in conflicts:
                note = note_fn(c, "PTW-2")  # PTW-2 입장에서 상대방(PTW-1) 상태 안내
                assert note is None, f"자체위반 없는 상대방인데 잘못된 안내문 생성됨: {note}"

    def test_실제로_자체위반으로_반려인_상대방은_안내문_뜸(self):
        with _TmpOutDir() as out_dir:
            # 기존 화기작업 — 가스농도 O2 미달로 자체위반 반려
            p1 = _clean_permit("PTW-1", ["화기"], "A구역", "용접", "김신청",
                                gas_results={"HC": 0.0, "O2": 15.0, "CO": 20.0, "CO2": 1.0, "H2S": 5.0})
            proc1 = process_permits([p1], out_dir, use_ai=False)
            assert proc1["own_decision_map"]["PTW-1"] == "반려"

            p2 = _clean_permit("PTW-2", ["일반위험"], "A구역", "중장비 작업", "박신청",
                                conditions=["중장비"])
            p2.equipment_type, p2.driver_name = "지게차", "김기사"
            p2.marked_required += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                                    "전선·설비간섭", "신호수", "자격증", "부속장구"]
            p2.confirmed += ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                              "전선·설비간섭", "신호수", "자격증", "부속장구"]
            proc2 = process_permits([p2], out_dir, use_ai=False)

            conflicts = [c for c in proc2["result"]["pair_conflicts"]
                         if set(c["permits"]) == {"PTW-1", "PTW-2"}]
            assert conflicts

            note_fn = proc2["counterpart_note_fn"]
            notes = [note_fn(c, "PTW-2") for c in conflicts]
            assert any(notes), "자체위반으로 진짜 반려인 상대방은 안내문이 떠야 한다"
