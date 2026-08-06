# -*- coding: utf-8 -*-
"""
SIMOPS(동시작업 충돌) 판정 + run()/run_with_existing() 전체 흐름 회귀테스트.
"""
from datetime import datetime
from ptw_parser import Permit
from permit_engine import (
    judge_pairs, run, run_with_existing, zones_adjacent_estimated,
)


def _permit(pid, work_types, zone, start, end, **kw):
    """SIMOPS만 순수하게 검증하기 위해, 자체위반이 안 생기도록 최소 필수
    필드를 채운 '깨끗한' 허가서. (부실하게 만들면 자체위반만으로 반려되어
    '이미 반려면 SIMOPS 생략' 로직 때문에 충돌 자체가 안 보이게 됨 — 실제로
    이 헬퍼의 초기 버전에서 이 문제로 테스트가 잘못 실패한 적 있음)"""
    defaults = dict(
        work_summary="테스트", issue_date="2026.08.01",
        risk_assessment=True, change_review=True,
        attachments=["작업계획서", "안전장구목록"],
        applicant="김신청", worker_name="이작업", witness_name="박입회",
        marked_required=["작업구역설정", "환기장비", "소화기", "안전장구", "안전교육"],
        confirmed=["작업구역설정", "환기장비", "소화기", "안전장구", "안전교육"],
    )
    if "중장비" in work_types:
        defaults["equipment_type"] = "지게차"
        defaults["driver_name"] = "김기사"
        defaults["supplementary_confirmer"] = {"중장비": "최확인"}
        extra = ["운전요원의 입회", "현장책임자 감독", "기상·노면상태",
                 "전선·설비간섭", "신호수", "자격증", "부속장구"]
        defaults["marked_required"] = defaults["marked_required"] + extra
        defaults["confirmed"] = defaults["confirmed"] + extra
    defaults.update(kw)
    form_type = defaults.pop("form_type", "일반위험")
    return Permit(permit_id=pid, work_types=work_types, zone=zone,
                  start=start, end=end, form_type=form_type, **defaults)


class TestNone날짜안전성:
    """실사용 중 발견: 빈 양식(날짜 파싱 실패)끼리 비교하면 None<None 비교로 크래시하던 문제."""

    def test_둘다_None_날짜여도_크래시안함(self, matrix):
        p1 = _permit("A", ["화기"], "B-1", None, None)
        p2 = _permit("B", ["중장비"], "B-1", None, None)
        conflicts = judge_pairs([p1, p2], matrix)  # 예외 안 나면 성공
        assert conflicts == []

    def test_한쪽만_None_날짜여도_크래시안함(self, matrix):
        p1 = _permit("A", ["화기"], "B-1", None, None)
        p2 = _permit("B", ["중장비"], "B-1", datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18))
        conflicts = judge_pairs([p1, p2], matrix)
        assert conflicts == []


class Test인접구역추정:
    """도면 데이터 없이 구역명 패턴(번호 1차이)으로 인접 여부를 추정하는 임시 로직."""

    def test_번호가_1차이면_인접으로_추정(self):
        assert zones_adjacent_estimated("B-11", "B-12") is True

    def test_번호가_2차이면_인접아님(self):
        assert zones_adjacent_estimated("B-11", "B-13") is False

    def test_완전히_같은구역은_인접아님(self):
        # 동일구역은 '인접'이 아니라 '동일'로 별도 처리되므로 False가 맞음
        assert zones_adjacent_estimated("B-11", "B-11") is False

    def test_접두어_다르면_인접아님(self):
        assert zones_adjacent_estimated("B-11", "C-12") is False


class Test실제시설명_인접판정:
    """⚠️ 2026-08-05: 시설 좌표가 (x,y,w,h) 사각형 데이터에서 GPS 위도·경도
    '시설명+좌표 1점' 데이터(data/shipyard_facilities_gps.csv)로 교체됨.
    건물 크기 정보가 없어 점 간 거리로는 인접을 정확히 판단할 수 없다고
    보고, 세부 블록 좌표가 들어오기 전까지는 '같은 시설(건물)이면 인접'으로
    판단하기로 확정(사용자 결정, docs/memory.md 기록)."""

    def test_같은_시설_다른_블록표기는_인접(self):
        assert zones_adjacent_estimated(
            "전처리 및 도장공장 A블록", "전처리 및 도장공장 B블록") is True

    def test_다른_시설끼리는_인접아님(self):
        # GPS 점 좌표가 아무리 가까워도(예: 144m) 건물 단위 데이터라
        # 인접으로 판단하지 않기로 결정됨
        assert zones_adjacent_estimated("해양 의장공장", "해양제작 3공장") is False

    def test_완전히_같은_시설명_텍스트는_인접아님(self):
        # 동일구역은 judge_pairs의 same_zone에서 이미 별도 처리되므로,
        # zones_adjacent_estimated 단독 호출 시에도 False가 맞음
        assert zones_adjacent_estimated("조립 1공장", "조립 1공장") is False

    def test_한쪽만_시설명_매칭되면_인접아님(self):
        assert zones_adjacent_estimated("조립 1공장", "B-12") is False


class TestSIMOPS등급차등:
    def test_동일구역_충돌은_원래등급_그대로(self, matrix):
        t1, t2 = datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18)
        p1 = _permit("A", ["화기"], "B-11", t1, t2)
        p2 = _permit("B", ["밀폐공간"], "B-11", t1, t2)
        conflicts = judge_pairs([p1, p2], matrix)
        c001 = [c for c in conflicts if c["rule_id"] == "C001"]
        assert c001 and c001[0]["risk"] == "반려"
        assert c001[0]["zone_relation"] == "동일구역"

    def test_인접구역_추정_충돌은_한단계_낮춤(self, matrix):
        """⚠️ 2026-08 설계 변경: 규칙별로 인접구역 적용 가능 여부
        (adjacent_applicable)를 따로 정해뒀음. C004(화기x중장비)는 원래
        사유 자체가 '인접 상태'를 전제로 쓰여서 adjacent_applicable=Y —
        인접구역이면 여전히 한 단계 낮춰서 적용됨."""
        t1, t2 = datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18)
        p1 = _permit("A", ["화기"], "B-11", t1, t2)
        p2 = _permit("B", ["중장비"], "B-12", t1, t2)  # 인접(번호 1차이)
        conflicts = judge_pairs([p1, p2], matrix)
        c004 = [c for c in conflicts if c["rule_id"] == "C004"]
        assert c004 and c004[0]["risk"] == "보류"  # 원래도 보류라 그대로
        assert c004[0]["zone_relation"] == "인접구역(추정)"

    def test_인접적용안되는_규칙은_인접구역에서_매칭자체_안됨(self, matrix):
        """⚠️ C001(화기x밀폐공간)은 '그 밀폐공간 내부'여야만 성립하는
        위험이라 adjacent_applicable=N — 인접구역이면 등급을 낮추는 게
        아니라 아예 충돌 후보에서 제외되어야 한다(허상 충돌 방지)."""
        t1, t2 = datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18)
        p1 = _permit("A", ["화기"], "B-11", t1, t2)
        p2 = _permit("B", ["밀폐공간"], "B-12", t1, t2)  # 인접(번호 1차이)
        conflicts = judge_pairs([p1, p2], matrix)
        c001 = [c for c in conflicts if c["rule_id"] == "C001"]
        assert c001 == []  # 인접에선 아예 안 잡혀야 함


class Test기존승인허가서와_비교:
    """실제 운영 흐름(1건씩 업로드) 대응: 새 허가서를 outputs/의 기존 승인
    허가서와 비교하는 run_with_existing()."""

    def test_기존_승인허가서와_충돌_검출(self, matrix):
        t1, t2 = datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18)
        existing = [_permit("OLD-1", ["화기"], "B-11", t1, t2)]
        new = [_permit("NEW-1", ["중장비"], "B-11", t1, t2)]
        result = run_with_existing(new, existing)
        assert any(c["rule_id"] == "C004" for c in result["pair_conflicts"])

    def test_이미_반려확정이어도_SIMOPS는_계산됨(self, matrix):
        """2026-08 설계 변경: SIMOPS(구역·시간 겹침)는 가스측정처럼 물리적
        시간이 걸리는 개별위반과 무관한 별개의 사실이므로, 신규 허가서가
        자체위반으로 이미 반려 확정이어도 SIMOPS 비교를 생략하지 않는다.
        (예전엔 '생략'이 기본이었으나, 제출순서에 따라 불공평해지는 문제가
        지적되어 반대로 변경됨)"""
        t1, t2 = datetime(2026, 8, 1, 9), datetime(2026, 8, 1, 18)
        existing = [_permit("OLD-1", ["중장비"], "B-11", t1, t2)]
        # 화기인데 안전조치 관련 필드가 전혀 없어 자체위반이 다수 발생 -> 반려 확정
        rejected_new = Permit(permit_id="NEW-1", work_types=["화기"], form_type="화기",
                               zone="B-11", start=t1, end=t2)
        result = run_with_existing([rejected_new], existing)
        assert result["decision"] == "반려"  # 자체위반만으로도 이미 반려
        # 그럼에도 SIMOPS 충돌은 계속 검출되어야 함(C004: 화기x중장비)
        assert any(c["rule_id"] == "C004" for c in result["pair_conflicts"])


class Test등급체계:
    def test_등급_순서_승인보다반려가_높음(self):
        from permit_engine import RISK_ORDER
        assert RISK_ORDER["반려"] > RISK_ORDER["보류"] > RISK_ORDER["승인"]