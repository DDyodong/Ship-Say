# -*- coding: utf-8 -*-
"""
단일허가서 판정(permit_engine.judge_permit) 회귀테스트.
전부 합성 Permit 객체로 만들어서, 실제 PDF 파일 없이도 항상 돌아간다.
"""
from datetime import datetime
from ptw_parser import Permit
from permit_engine import judge_permit, RISK_ORDER


def _base_kwargs(**overrides):
    """모든 위반을 안 걸리게 최대한 채운 '완벽한 허가서' 기본값.
    각 테스트는 여기서 딱 하나만 일부러 망가뜨려서 그 규칙만 잡히는지 확인한다."""
    base = dict(
        permit_id="TEST-1", form_type="일반위험", work_types=["중장비"],
        start=datetime(2026, 8, 1, 9, 0), end=datetime(2026, 8, 1, 18, 0),
        zone="B-1", work_summary="테스트 작업", issue_date="2026.08.01",
        issue_date_dt=datetime(2026, 8, 1),
        risk_assessment=True, change_review=True,
        attachments=["작업계획서", "안전장구목록"],
        applicant="김신청", worker_name="이작업", witness_name="박입회",
        equipment_type="지게차", driver_name="김기사",
        marked_required=["작업구역설정", "환기장비", "소화기", "안전장구", "안전교육", "운전요원의 입회"],
        confirmed=["작업구역설정", "환기장비", "소화기", "안전장구", "안전교육", "운전요원의 입회"],
        supplementary_confirmer={"중장비": "최확인"},
    )
    base.update(overrides)
    return base


def _risk_of(rule_id, violations):
    return [v for v in violations if v["rule_id"] == rule_id]


class TestR56R57작업자입회자:
    """실사용 중 발견: 작업자·입회자 미기재를 검증 안 하고 있던 문제(R56/R57 신설)."""

    def test_작업자_미기재시_반려(self, rules):
        p = Permit(**_base_kwargs(worker_name=""))
        v = judge_permit(p, rules)
        assert len(_risk_of("R53", v)) == 1

    def test_입회자_미기재시_반려(self, rules):
        p = Permit(**_base_kwargs(witness_name=""))
        v = judge_permit(p, rules)
        assert len(_risk_of("R54", v)) == 1

    def test_둘다_기재시_위반없음(self, rules):
        p = Permit(**_base_kwargs())
        v = judge_permit(p, rules)
        assert not _risk_of("R53", v)
        assert not _risk_of("R54", v)


class TestR58운전요원의입회:
    """실사용 중 발견: 중장비 선택했는데 '운전요원의 입회' 체크 안 해도 통과되던 문제."""

    def test_중장비인데_운전요원입회_미체크시_반려(self, rules):
        p = Permit(**_base_kwargs(
            marked_required=["작업구역설정", "환기장비"],
            confirmed=["작업구역설정", "환기장비"],
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("R55", v)) == 1

    def test_중장비_아니면_운전요원입회_검사안함(self, rules):
        p = Permit(**_base_kwargs(
            work_types=["화기"], form_type="화기",
            marked_required=["작업구역설정"], confirmed=["작업구역설정"],
        ))
        v = judge_permit(p, rules)
        assert not _risk_of("R55", v)


class TestX01체크불일치:
    def test_필요표시했는데_확인안하면_반려(self, rules):
        p = Permit(**_base_kwargs(
            marked_required=["환기장비"], confirmed=[],
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("X01", v)) >= 1


class TestX03작업개요작업유형불일치:
    """실사용 중 발견: '용접'이라 적었는데 화기 미체크 시, 화기 관련 안전조치가
    통째로 검사 누락되던 심각한 안전 공백."""

    def test_용접_언급했는데_화기_미체크시_반려(self, rules):
        p = Permit(**_base_kwargs(work_types=[], work_summary="용접 작업"))
        v = judge_permit(p, rules)
        assert len(_risk_of("X03", v)) == 1

    def test_화기로_정상분류됐으면_X03_안잡힘(self, rules):
        p = Permit(**_base_kwargs(work_types=["화기"], form_type="화기", work_summary="용접 작업"))
        v = judge_permit(p, rules)
        assert not _risk_of("X03", v)

    def test_밀폐공간_키워드_있어도_이미_분류됐으면_오탐없음(self, rules):
        p = Permit(**_base_kwargs(work_types=["밀폐공간"], work_summary="청수탱크 내부 청소"))
        v = judge_permit(p, rules)
        assert not _risk_of("X03", v)


class TestX04허가일자작업기간모순:
    """실사용 중 발견: 허가일자가 작업 시작일보다 늦은(=허가 전에 작업 시작) 모순을
    전혀 검증 안 하고 있던 문제."""

    def test_허가일자가_작업시작일보다_늦으면_반려(self, rules):
        p = Permit(**_base_kwargs(
            issue_date="2026.08.02", issue_date_dt=datetime(2026, 8, 2),
            start=datetime(2026, 8, 1, 9, 0),
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("X04", v)) == 1

    def test_허가일자가_작업시작일과_같으면_정상(self, rules):
        p = Permit(**_base_kwargs(
            issue_date="2026.08.01", issue_date_dt=datetime(2026, 8, 1),
            start=datetime(2026, 8, 1, 9, 0),
        ))
        v = judge_permit(p, rules)
        assert not _risk_of("X04", v)


class Test순환논리규칙삭제확인:
    """R54(발급자)/R55(승인자)/R31(전원복구)는 '판정 이후 결과물을 판정 전
    조건으로 요구'하는 순환논리라 삭제됨 — 재발 방지용 확인."""

    def test_발급자_승인자_규칙이_존재하지_않음(self, rules):
        targets = [r["target"] for r in rules]
        assert not any("발급자" in t for t in targets if t != "발급자")  # 완전 일치만 체크
        reasons = [r["reason"] for r in rules]
        assert "발급자 서명 누락" not in reasons
        assert "승인자 서명 누락" not in reasons

    def test_규칙ID가_결번없이_순차적임(self, rules):
        ids = sorted(r["rule_id"] for r in rules if r["rule_id"].startswith("R"))
        expected = [f"R{i:02d}" for i in range(1, len(ids) + 1)]
        assert ids == expected


class Test가스농도판정:
    def test_적정공기_미달시_반려(self, rules):
        p = Permit(**_base_kwargs(
            work_types=["밀폐공간"], gas_results={"O2": 15.0},  # 18% 미만
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("G-O2", v)) == 1

    def test_밀폐공간아니면_가스농도_검사안함(self, rules):
        p = Permit(**_base_kwargs(work_types=["중장비"], gas_results={}))
        v = judge_permit(p, rules)
        assert not any("가스" in x.get("section", "") for x in v)

    def test_산소_과잉도_반려(self, rules):
        """⚠️ 2026-08-06: 산업안전보건기준에 관한 규칙 제618조 제3호(적정공기
        정의)는 산소농도 "18% 이상 23.5% 미만"으로 상한이 있는데, 코드가
        하한(18% 이상)만 검사하고 있던 걸 법령 원문 대조로 발견해 수정."""
        p = Permit(**_base_kwargs(
            work_types=["밀폐공간"], gas_results={"O2": 30.0},  # 23.5% 이상(과잉)
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("G-O2", v)) == 1

    def test_산소_정상범위는_위반없음(self, rules):
        p = Permit(**_base_kwargs(
            work_types=["밀폐공간"], gas_results={"O2": 20.0},  # 18~23.5 사이
        ))
        v = judge_permit(p, rules)
        assert not _risk_of("G-O2", v)


class Test가스농도실측값_전체미입력:
    """⚠️ 2026-08-05 실사용 테스트로 발견: 화기작업허가서에서 '가스농도측정'
    체크박스는 확인(●)됐는데 실제 HC·O2·CO 등 실측값을 하나도 안 적어도
    승인되던 문제. (1) 화기·도장도 검사 대상에 포함, (2) gas_results가
    완전히 비어있으면 그 자체를 반려 사유로 잡도록 G-전체미측정 신설."""

    def test_화기작업_실측값_전체미입력시_반려(self, rules):
        p = Permit(**_base_kwargs(
            work_types=["화기"],
            marked_required=["작업구역설정", "작업주위 가연성물질 제거", "가스농도측정",
                              "비산불티 차단막 설치", "환기장비", "소화기", "안전장구", "안전교육"],
            confirmed=["작업구역설정", "작업주위 가연성물질 제거", "가스농도측정",
                       "비산불티 차단막 설치", "환기장비", "소화기", "안전장구", "안전교육"],
            gas_results={},  # 체크는 됐지만 실측값은 하나도 없음
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("G-전체미측정", v)) == 1

    def test_도장작업_실측값_전체미입력시_반려(self, rules):
        p = Permit(**_base_kwargs(
            work_types=["도장"],
            marked_required=["작업구역설정", "가스농도측정", "환기장비", "소화기", "안전장구", "안전교육"],
            confirmed=["작업구역설정", "가스농도측정", "환기장비", "소화기", "안전장구", "안전교육"],
            gas_results={},
        ))
        v = judge_permit(p, rules)
        assert len(_risk_of("G-전체미측정", v)) == 1

    def test_실측값_있으면_전체미측정_규칙은_안걸림(self, rules):
        p = Permit(**_base_kwargs(
            work_types=["화기"],
            marked_required=["작업구역설정", "작업주위 가연성물질 제거", "가스농도측정",
                              "비산불티 차단막 설치", "환기장비", "소화기", "안전장구", "안전교육"],
            confirmed=["작업구역설정", "작업주위 가연성물질 제거", "가스농도측정",
                       "비산불티 차단막 설치", "환기장비", "소화기", "안전장구", "안전교육"],
            gas_results={"HC": 0.0, "O2": 20.0, "CO": 5, "CO2": 0.5, "H2S": 2},
        ))
        v = judge_permit(p, rules)
        assert not _risk_of("G-전체미측정", v)