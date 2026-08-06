# -*- coding: utf-8 -*-
"""
ptw_parser.py의 텍스트 추출 함수들 회귀테스트.
실제 PDF 없이도, 문제가 됐던 원문 패턴을 문자열로 직접 넣어서 검증한다.
"""
from ptw_parser import (
    _is_placeholder, _parse_worker_witness, _parse_excavation_inspectors,
    _parse_date_only, KNOWN_LABELS,
)


class Test라벨오염방지:
    """실사용 중 발견: 완전히 빈 양식에서, 다른 필드의 라벨 글자가 값으로
    잘못 잡히던 버그. KNOWN_LABELS에 등록된 라벨은 절대 값으로 안 잡혀야 한다."""

    def test_허가일자_라벨은_값으로_인정안함(self):
        assert _is_placeholder("허가일자") is True

    def test_허가기간_축약형도_라벨로_인정(self):
        # 실제 발견된 버그: '작업허가기간'만 있고 축약형 '허가기간'이 없어서
        # 굴착 점검자 이름 자리에 이 라벨이 잘못 들어갔었음
        assert _is_placeholder("허가기간") is True

    def test_진짜_사람이름은_라벨로_안착각(self):
        assert _is_placeholder("김철수") is False


class Test작업자입회자파싱:
    """실사용 중 발견: 작업자가 여러 명(쉼표 나열)일 때 첫 명만 잡히던 버그."""

    def test_작업자_여러명_전부_추출(self):
        text = "작업완료 시간 입회자 이입회 작업자 이동건, 이채현, 박주영, 조영진, 권민근, 이재환\n복원(조치)상태"
        worker, witness = _parse_worker_witness(text)
        assert worker == "이동건, 이채현, 박주영, 조영진, 권민근, 이재환"
        assert witness == "이입회"

    def test_작업자_빈칸이면_다음줄_라벨_안잡음(self):
        """실사용 중 발견: 작업자가 빈칸일 때 '\\s*'가 줄바꿈까지 건너뛰어서
        다음 줄 라벨('복원(조치)상태')을 이름으로 잘못 잡던 버그."""
        text = "작업완료 시간 입회자 작업자\n복원(조치)상태\n안전조치 확인"
        worker, witness = _parse_worker_witness(text)
        assert worker == ""

    def test_안전조치확인_구간_fallback으로_입회자_추출(self):
        text = "작업(공무)부서 책임자 이책임 (서명) 입회자 이입회 (서명)\n발급자 부서 안전 직책"
        worker, witness = _parse_worker_witness(text)
        assert witness == "이입회"


class Test굴착점검자파싱:
    """실사용 중 발견: 점검자가 2명(가스/전기용 각각)일 거라 가정했으나
    실제로는 공용 1명 필드였고, 빈칸일 때 다음 라벨('허가기간')을 잘못 잡던 버그."""

    def test_실제_이름_있으면_추출(self):
        text = "전기·계장·통신 점검자 김점검 허가기간"
        assert _parse_excavation_inspectors(text) == "김점검"

    def test_빈칸이면_허가기간_라벨_안잡음(self):
        text = "전기·계장·통신 점검자 허가기간 확인자"
        assert _parse_excavation_inspectors(text) == ""


class Test날짜파싱:
    def test_점구분_날짜_파싱(self):
        d = _parse_date_only("2026.07.31")
        assert (d.year, d.month, d.day) == (2026, 7, 31)

    def test_빈문자열은_None(self):
        assert _parse_date_only("") is None

    def test_형식이상하면_None(self):
        assert _parse_date_only("허가일자") is None