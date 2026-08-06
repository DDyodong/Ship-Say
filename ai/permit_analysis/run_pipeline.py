# -*- coding: utf-8 -*-
"""
작업허가서 승인 지원 — 전체 실행 진입점

    PDF 업로드(1개 이상) → 파싱 → 판정 → 유사사고 검색 → AI 검토의견 (전부 기본 실행)

사용법
    python run_pipeline.py 허가서.pdf                          # 허가서 1건 (AI 의견까지 자동 포함)
    python run_pipeline.py 허가서A.pdf 허가서B.pdf              # 여러 건, 서로 충돌하는지도 검사
    python run_pipeline.py 허가서A.pdf 허가서B.pdf --no-ai     # 빠른 확인용: AI 의견 생략, 판정만
    python run_pipeline.py "C:\\허가서모음"                     # 폴더 경로를 주면 그 안의 PDF 전부 자동 처리
    python run_pipeline.py "C:\\허가서모음" --recursive         # 하위 폴더까지 전부 뒤져서 PDF 찾기

⚠️ 2026-08 갱신: 예전엔 "여러 허가서를 서로 비교하려면 반드시 한 번에 같이
   넘겨야 한다"고 안내했었는데, 이제는 아니다. `outputs/` 폴더에 이미 저장된
   승인 허가서를 자동으로 불러와서 함께 비교하므로(_load_existing_active_permits),
   **1건씩 따로 실행해도** 예전에 승인된 다른 허가서와의 SIMOPS 충돌을 정확히
   검사한다. 여러 건을 한 번에 넘기는 것은 이제 "테스트 편의를 위한 옵션"일
   뿐, 정확한 검사를 위해 필수인 건 아니다.

표기 규칙: 네모 체크 ☑ (해당/필요) · 원 채움 ● (조치 확인)
"""

import sys
import json
from pathlib import Path
from datetime import datetime

from ptw_parser import parse_pdf
from permit_engine import Permit, run, run_with_existing, print_report, RISK_ORDER

BASE_DIR = Path(__file__).parent


def show_parsed(p):
    print(f"\n┌{'─'*66}")
    print(f"│ {p.permit_id or '(허가번호 없음)'}   [{p.form_type}작업허가서]")
    print(f"├{'─'*66}")
    print(f"│ 주작업   : {p.main_work_label}")
    print(f"│ 보충작업 : {', '.join(p.conditions) if p.conditions else '(없음)'}")
    print(f"│ 기간     : {p.start} ~ {p.end}")
    print(f"│ 구역     : {p.zone} ({p.area_type})")
    print(f"│ 개요     : {p.work_summary[:60]}")
    print(f"│ 첨부서류 : {p.attachments or '없음'}")
    print(f"│ 위험성평가: {'실시' if p.risk_assessment else '미실시'}"
          f" / 변화검토: {'완료' if p.change_review else '미검토'}")
    print(f"│ 필요표시☑: {len(p.marked_required)}건   확인완료●: {len(p.confirmed)}건")
    fillins = []
    if p.equipment_type:
        fillins.append(f"투입장비={p.equipment_type}")
    if p.driver_name:
        fillins.append(f"운전원={p.driver_name}")
    if fillins:
        print(f"│ 텍스트입력 확인(체크박스 없음): {', '.join(fillins)}")
    if p.gas_results:
        print(f"│ 가스측정 : {p.gas_results}")
    print(f"│ 서명     : 신청 {p.applicant or '✗'} / 발급 {p.issuer or '✗'} / 승인 {p.approver or '✗'}")
    print(f"│ 작업자   : {p.worker_name or '✗'}")
    print(f"│ 입회자   : {p.witness_name or '✗'}")
    if p.supplementary_confirmer:
        print(f"│ 보충확인자: {p.supplementary_confirmer}")
    print(f"└{'─'*66}")


def collect_pdf_paths(raw_args, recursive=False):
    """인자로 받은 각 경로가 파일이면 그대로, 폴더면 그 안의 PDF를 전부 찾아서
    하나의 경로 목록으로 펼친다. 폴더 안에 PDF가 여러 개면 이름순으로 정렬."""
    paths = []
    for a in raw_args:
        p = Path(a)
        if p.is_dir():
            pattern = "**/*.pdf" if recursive else "*.pdf"
            found = sorted(p.glob(pattern))
            if not found:
                print(f"  ⚠️ 폴더 '{a}' 안에 PDF 파일이 없습니다 (recursive={recursive})")
            for f in found:
                print(f"  📁 폴더에서 발견: {f}")
                paths.append(str(f))
        elif p.is_file():
            paths.append(a)
        else:
            print(f"  ⚠️ 경로를 찾을 수 없습니다: {a}")
    return paths


def _load_existing_active_permits(out_dir, exclude_ids=()):
    """outputs/approved/ 와 outputs/rejected/ 를 합쳐서, 각 허가서(작업)의
    가장 최신 버전을 Permit으로 복원해 SIMOPS 비교 대상으로 쓴다.

    ⚠️ 2026-08 설계 변경: 예전엔 "결정이 반려인 기존 허가서는 SIMOPS
    비교에서 제외"했었음. 그런데 SIMOPS(구역·시간·작업유형 겹침)는 개별위반
    (가스측정 등, 물리적으로 시간이 걸림) 여부와 무관한 별개의 사실이라는
    통찰 이후 — 개별판정이 반려든 승인이든 상관없이 전부 SIMOPS 비교
    대상에 포함하도록 변경. "구역·시간이 겹치는 작업이 실제로 계획되어
    있다"는 사실 자체가 중요하지, 그 허가서의 서류가 아직 미비한지는 SIMOPS
    충돌 여부와 무관함.

    반환값: (permits 리스트, {permit_id: (파일경로, 저장된dict)} 매핑)
    매핑은 이후 "이 기존 허가서가 신규 허가서와 새로 충돌하면, 그 기존
    허가서 자신의 기록도 갱신"하는 로직에서 원본을 다시 찾기 위해 필요."""
    all_files = []
    for sub in ("approved", "rejected"):
        d = out_dir / sub
        if d.exists():
            all_files.extend(d.glob("permit_*.json"))

    latest_by_group = {}
    for f in sorted(all_files):
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        key = (data.get("permit_id"), data.get("job_group", 1))
        version = data.get("version", 1)
        # ⚠️ 2026-08-06 버그 수정: latest_by_group[key]는 (파일경로, data, version)
        # 3개짜리 튜플인데, 버전 비교를 [1](=data, dict)과 하고 있어서 같은
        # permit_id로 저장된 파일이 2개 이상(v1·v2 등) 있으면 "int > dict"
        # 비교가 발생해 TypeError로 크래시하던 실제 버그. [2](=version)와
        # 비교하도록 수정. (실사용 중 발견: PTW-2026-1이 v1→v2로 갱신된 뒤
        # 재실행하자마자 바로 재현됨)
        if key not in latest_by_group or version > latest_by_group[key][2]:
            latest_by_group[key] = (f, data, version)

    permits = []
    existing_map = {}
    for (permit_id, _group), (fpath, data, _v) in latest_by_group.items():
        if permit_id in exclude_ids:
            continue
        period = data.get("period", {})
        start = datetime.fromisoformat(period["start"]) if period.get("start") else None
        end = datetime.fromisoformat(period["end"]) if period.get("end") else None
        # ⚠️ 2026-08 구조 개편 이전에 저장된 JSON에는 main_works/conditions가
        #    없고 work_types만 있음 — 옛 파일도 계속 읽을 수 있도록 폴백 처리.
        #    (work_types로 넘기면 Permit.__post_init__이 알아서 둘로 나눠줌)
        permits.append(Permit(
            permit_id=permit_id,
            form_type=data.get("form_type", "일반위험"),
            main_works=list(data.get("main_works", [])),
            conditions=list(data.get("conditions", [])),
            work_types=[] if "main_works" in data else data.get("work_types", []),
            start=start, end=end,
            zone=data.get("zone", ""),
        ))
        existing_map[permit_id] = (fpath, data)
    return permits, existing_map


def _violation_only_decision(violations):
    """자체위반 리스트만 가지고(SIMOPS 충돌은 섞지 않고) 승인/조건부 승인/반려
    등급을 계산한다. '이 허가서 자신의 서류가 개별적으로 문제가 있는가'만
    보는 용도 — _counterpart_note()가 이 함수 결과만 참조해야
    "상대방이 지금 보여주는 이 충돌 때문에 반려된 걸 두고 개별사유라고
    잘못 말하는" 순환논리 버그(2026-08-06 발견)를 피할 수 있다."""
    oo = "승인"
    for it in violations:
        if RISK_ORDER[it["risk"]] > RISK_ORDER[oo]:
            oo = it["risk"]
    return {"승인": "승인", "보류": "조건부 승인", "반려": "반려"}[oo]


def build_decision_maps(permits, result, existing_map):
    """판정 결과에서 두 가지 맵을 만들어 반환한다.

    own_decision_map: 저장용 최종등급 — 자체위반 + 이 허가서가 관여된
        SIMOPS 충돌을 합쳐서 계산(실제 승인/보류/반려 저장에 쓰는 값).
    own_violation_only_map: 자체위반만으로 계산한 등급 — SIMOPS 충돌과
        무관하게 "이 허가서 서류 자체가 개별적으로 문제 있는지"만 나타냄
        (_counterpart_note가 참조하는 값. own_decision_map을 쓰면 안 됨 —
        2026-08-06 버그 참고).
    """
    own_decision_map = {}
    own_violation_only_map = {}
    for p in permits:
        ov = [v for v in result["permit_violations"] if v["permit_id"] == p.permit_id]
        oc = [c for c in result["pair_conflicts"] if p.permit_id in c["permits"]]
        oo = "승인"
        for it in ov + oc:
            if RISK_ORDER[it["risk"]] > RISK_ORDER[oo]:
                oo = it["risk"]
        own_decision_map[p.permit_id] = {"승인": "승인", "보류": "조건부 승인", "반려": "반려"}[oo]
        own_violation_only_map[p.permit_id] = _violation_only_decision(ov)
    for pid, (_fpath, data) in existing_map.items():
        own_decision_map[pid] = data.get("decision", "승인")
        own_violation_only_map[pid] = _violation_only_decision(data.get("permit_violations", []))
    return own_decision_map, own_violation_only_map


def make_counterpart_note_fn(own_violation_only_map):
    """_counterpart_note(conflict, viewer_id) 함수를 만들어서 반환.
    own_violation_only_map을 클로저로 갖고 있어서, 매번 다시 안 넘겨도 됨."""
    def _counterpart_note(conflict, viewer_id):
        """이 충돌의 상대방(viewer_id가 아닌 쪽)이 현재 '자체위반만으로'
        (이 SIMOPS 충돌과 무관하게) 반려 상태면, 그 사실을 알리는 문구를
        반환. 아니면 None."""
        other_id = next((pid for pid in conflict["permits"] if pid != viewer_id), None)
        if other_id and own_violation_only_map.get(other_id) == "반려":
            return f"⚠️ 상대방({other_id})은 현재 개별사유로 반려 상태 — 그 사유가 해결되지 않으면 이 충돌은 실현되지 않을 수 있음"
        return None
    return _counterpart_note


def _safe_name(s):
    return "".join(c if (c.isalnum() or c in "-_") else "_" for c in str(s)) or "unknown"


def _same_job(old, p):
    """구역·작업개요·신청인이 그대로면 '같은 작업의 재제출'로 판단.
    전부 다르면 '허가번호만 우연히 겹친 서류상 오류'로 본다.
    ⚠️ 작업시간(start/end)은 비교 기준에 포함하지 않는다 — 재제출 시
    시간대가 살짝 조정되는 경우가 실무상 흔해서, 시간까지 완전히 같아야
    '같은 작업'으로 보면 오히려 정상적인 재제출을 오탐(번호중복 오류로
    잘못 분류)할 위험이 크기 때문."""
    old_applicant = old.get("people", {}).get("applicant", "") if "people" in old else old.get("applicant", "")
    return (
        old.get("zone", "").strip() == (p.zone or "").strip()
        and old.get("work_summary", "").strip() == (p.work_summary or "").strip()
        and old_applicant == (p.applicant or "")
    )


def _same_job_dict(a, b):
    return (a.get("zone", "").strip() == b.get("zone", "").strip()
            and a.get("work_summary", "").strip() == b.get("work_summary", "").strip()
            and a.get("people", {}).get("applicant", "") == b.get("people", {}).get("applicant", ""))


def _job_groups(permit_id, out_dir):
    """이 허가번호로 저장된 파일들을(approved/rejected 두 폴더 통틀어),
    '실제로 같은 작업(job identity)'끼리 묶어서 그룹 리스트로 반환.
    그룹이 2개 이상이면 이 번호가 서로 다른 작업에 중복으로 쓰였다는 뜻.
    ⚠️ 예전엔 재제출(같은 작업)과 번호중복(다른 작업)을 구분 안 하고
    전부 '_v1, _v2, ...'로만 이름 붙였는데, 이러면 완전히 다른 두 허가서에
    '이게 서로의 버전이다'라는 잘못된 뜻을 담은 이름이 붙는 문제가 있었음
    (사용자 지적). 그래서 아예 별도 그룹으로 갈라서 이름 자체를 다르게 만든다.
    ⚠️ approved/rejected로 폴더가 나뉜 뒤로는, 파일 경로 문자열 순서가
    실제 버전 순서와 다를 수 있음(예: rejected/..._v1 vs approved/..._v2를
    문자열로 정렬하면 'approved'가 먼저 옴) — 반드시 JSON 안의 실제
    version 숫자 기준으로 정렬해야 한다."""
    safe_id = _safe_name(permit_id)
    files = []
    for sub in ("approved", "rejected"):
        files.extend((out_dir / sub).glob(f"permit_{safe_id}_*.json"))

    def _version_of(f):
        try:
            return json.load(open(f, encoding="utf-8")).get("version", 1)
        except Exception:
            return 1
    files.sort(key=_version_of)

    groups = []
    for f in files:
        data = json.load(open(f, encoding="utf-8"))
        for g in groups:
            rep = json.load(open(g[0], encoding="utf-8"))
            if _same_job(rep, type("_", (), {"zone": data.get("zone", ""),
                                               "work_summary": data.get("work_summary", ""),
                                               "applicant": data.get("people", {}).get("applicant", "")})()):
                g.append(f)
                break
        else:
            groups.append([f])
    return groups


def save_new_permits(permits, result, out_dir, own_decision_map, counterpart_note_fn, ai_result=None):
    """신규(이번 실행에 넘어온) 허가서들을 approved/rejected 로 나눠서
    개별 JSON으로 저장한다. 재제출이면 버전을 올리고, 허가번호만 겹치는
    별개 작업이면 별도 그룹(_CONFLICT2 등)으로 저장한다.
    반환값: 저장(또는 재사용)된 파일 경로 리스트."""
    saved_paths = []
    for p in permits:
        permit_json = p.to_dict()

        # ⚠️ 실사용 중 발견된 버그: 예전엔 result["decision"](여러 허가서를 합친
        #    "배치 전체"의 최악값)를 모든 허가서에 그대로 복사해서 저장했음.
        #    그래서 이 허가서 자체는 개별로 "승인"인데도, 같은 배치에 반려된
        #    다른 허가서가 섞여 있으면 저장되는 JSON엔 "반려"가 잘못 들어갔음
        #    (재제출 판단 로직이 이 잘못된 값을 비교하다가 혼란을 일으킨 사례 발견).
        #    이 허가서 자신의 위반·충돌만 다시 모아서, 이 허가서만의 등급을 재계산한다.
        own_violations = [v for v in result["permit_violations"] if v["permit_id"] == p.permit_id]
        own_conflicts = [c for c in result["pair_conflicts"] if p.permit_id in c["permits"]]
        own_decision = own_decision_map[p.permit_id]
        own_overall = {"승인": "승인", "조건부 승인": "보류", "반려": "반려"}[own_decision]

        # 저장되는 충돌 각각에, 상대방이 현재 개별사유로 반려 상태인지 주석 추가
        own_conflicts = [
            {**c, "counterpart_note": counterpart_note_fn(c, p.permit_id)}
            for c in own_conflicts
        ]

        permit_json["decision"] = own_decision
        permit_json["overall_risk"] = own_overall
        permit_json["permit_violations"] = own_violations
        permit_json["pair_conflicts"] = own_conflicts
        if ai_result:
            permit_json["ai_comment"] = ai_result.get("ai_comment")

        groups = _job_groups(p.permit_id, out_dir)

        # 새 허가서가 기존 그룹 중 어디에 속하는지 찾기 (같은 작업인지)
        matched_idx = None
        for i, g in enumerate(groups):
            rep = json.load(open(g[0], encoding="utf-8"))
            if _same_job(rep, p):
                matched_idx = i
                break

        if matched_idx is None:
            # 기존 어느 그룹과도 안 맞음 = 새로운 작업(허가번호만 겹침, 또는 최초 등록)
            matched_idx = len(groups)
            group = []
            if matched_idx > 0:
                prev_rep = json.load(open(groups[0][0], encoding="utf-8"))
                permit_json["version_note"] = (
                    f"⚠️ 허가번호 {p.permit_id} 중복인데 구역·작업개요·신청인이 전부 다름 — "
                    f"서류상 오류(허가번호 중복 발급) 가능성, 확인 필요"
                )
                print(f"\n  {'='*60}")
                print(f"  ⚠️⚠️⚠️  경고: 허가번호 {p.permit_id} 중복 — 완전히 다른 내용!")
                print(f"       기존 등록(그룹1): 구역={prev_rep.get('zone')!r} 개요={prev_rep.get('work_summary','')[:30]!r}")
                print(f"       이번 건(그룹{matched_idx+1}): 구역={p.zone!r} 개요={(p.work_summary or '')[:30]!r}")
                print(f"       → 서류상 오류(중복 허가번호 발급) 가능성이 높습니다. 확인 필요.")
                print(f"       (별도 그룹으로 저장하며, 서로 '버전' 관계가 아님을 파일명에 명시함)")
                print(f"  {'='*60}\n")
            else:
                permit_json["version_note"] = None
        else:
            group = groups[matched_idx]
            latest = json.load(open(group[-1], encoding="utf-8"))
            if latest.get("decision") == permit_json["decision"] and \
               latest.get("permit_violations") == permit_json["permit_violations"]:
                # 완전히 동일한 내용 재실행 — 새 버전 안 만들고 기존 것 유지
                print(f"  ℹ️ 허가번호 {p.permit_id}: 이전과 완전히 동일한 결과라 새 버전 생성 생략 ({group[-1].name})")
                saved_paths.append(group[-1])
                continue
            note = f"허가번호 {p.permit_id}의 재제출로 판단됨 (이전 버전: {group[-1].name})"
            if matched_idx > 0:
                note += f" — 단, 이 번호의 {matched_idx+1}번째 서로 다른 작업 계열임"
            permit_json["version_note"] = note
            print(f"  ℹ️ {note}")

        version = len(group) + 1
        group_label = "" if matched_idx == 0 else f"_CONFLICT{matched_idx + 1}"
        permit_json["job_group"] = matched_idx + 1
        permit_json["version"] = version
        fname = f"permit_{_safe_name(p.permit_id)}{group_label}_v{version}.json"
        # ⚠️ outputs/ 밑에 승인/반려 구분 없이 뒤섞여 쌓이면, 폴더를 열어봐도
        #    "지금 뭐가 살아있는 승인 상태인지" 한눈에 안 보이는 문제가 있어서
        #    승인 여부에 따라 하위 폴더를 나눔(2026-08 결정). 재제출 판단은
        #    두 폴더를 합쳐서 보므로(_job_groups), 반려↔승인을 오가도 버전
        #    추적은 정상적으로 이어진다.
        subfolder = "approved" if own_decision in ("승인", "조건부 승인") else "rejected"
        (out_dir / subfolder).mkdir(parents=True, exist_ok=True)
        fpath = out_dir / subfolder / fname
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(permit_json, f, ensure_ascii=False, indent=2)
        saved_paths.append(fpath)
    return saved_paths


def update_existing_counterparts(result, out_dir, existing_map, counterpart_note_fn):
    """⚠️ 2026-08 설계 변경: "먼저 승인된 허가서는 계속 깨끗한 기록으로
    남고, 나중에 등장해서 충돌을 일으킨 신규 허가서만 불이익을 받는"
    제출순서 불공평 문제가 지적됨 — SIMOPS 충돌은 원래 "누가 먼저
    냈나"와 무관한 사실이므로, 새로 발견된 충돌은 신규 허가서뿐 아니라
    그 상대방인 기존 허가서의 저장 기록에도 공평하게 반영한다.
    (사용자가 "기존 SIMOPS 판정은 변함없다"고 이해하고 있었는데, 실제로는
    이 함수가 기존 허가서 쪽에도 새 버전 파일을 만든다 — memory.md 13번
    항목 참고.)"""
    existing_ids_in_conflict = {pid for c in result["pair_conflicts"] for pid in c["permits"] if pid in existing_map}
    updated = []
    for eid in existing_ids_in_conflict:
        old_path, old_data = existing_map[eid]
        new_conflicts_for_e = [
            {**c, "counterpart_note": counterpart_note_fn(c, eid)}
            for c in result["pair_conflicts"] if eid in c["permits"]
        ]
        old_conflicts = old_data.get("pair_conflicts", [])
        seen_keys = {(tuple(sorted(c["permits"])), c["rule_id"]) for c in old_conflicts}
        combined = list(old_conflicts)
        added_any = False
        for c in new_conflicts_for_e:
            key = (tuple(sorted(c["permits"])), c["rule_id"])
            if key not in seen_keys:
                combined.append(c)
                seen_keys.add(key)
                added_any = True
        if not added_any:
            continue  # 이미 다 기록되어 있던 충돌이면 굳이 새 버전 안 만듦

        own_violations = old_data.get("permit_violations", [])
        own_overall = "승인"
        for it in own_violations + combined:
            if RISK_ORDER[it["risk"]] > RISK_ORDER[own_overall]:
                own_overall = it["risk"]
        own_decision = {"승인": "승인", "보류": "조건부 승인", "반려": "반려"}[own_overall]

        new_data = dict(old_data)
        new_data["decision"] = own_decision
        new_data["overall_risk"] = own_overall
        new_data["pair_conflicts"] = combined
        counterpart_ids = sorted({pid for c in new_conflicts_for_e for pid in c["permits"] if pid != eid})
        new_data["version_note"] = f"신규 허가서({', '.join(counterpart_ids)})와 새로운 SIMOPS 충돌 발견되어 갱신됨"

        groups = _job_groups(eid, out_dir)
        matched_idx = 0
        for i, g in enumerate(groups):
            rep = json.load(open(g[0], encoding="utf-8"))
            if _same_job_dict(rep, old_data):
                matched_idx = i
                break
        group = groups[matched_idx]
        version = len(group) + 1
        group_label = "" if matched_idx == 0 else f"_CONFLICT{matched_idx + 1}"
        new_data["job_group"] = matched_idx + 1
        new_data["version"] = version
        fname = f"permit_{_safe_name(eid)}{group_label}_v{version}.json"
        subfolder = "approved" if own_decision in ("승인", "조건부 승인") else "rejected"
        (out_dir / subfolder).mkdir(parents=True, exist_ok=True)
        fpath = out_dir / subfolder / fname
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(new_data, f, ensure_ascii=False, indent=2)
        print(f"  ℹ️ 기존 허가번호 {eid}: 신규 허가서와 새 SIMOPS 충돌 발견되어 갱신 저장 ({fname})")
        updated.append(fpath)
    return updated


def compute_decisions(permits, out_dir):
    """②판정+③SIMOPS까지만 계산하고 저장(④)은 하지 않는다. 화면 출력
    순서(②→③→④AI→저장)를 지키려면 main()이 이 함수 → 화면 출력 → AI 호출
    → save_new_permits()/update_existing_counterparts() 순서로 직접 호출해야
    한다(2026-08-06: 처음 리팩터링할 때 이 함수와 저장을 하나로 합친
    `process_permits()`만 만들었다가, 그 안에서 AI 호출과 저장까지 전부
    끝내버려서 main()이 화면에 ③번보다 AI 검토의견을 먼저 찍어버리는 순서
    역전 버그가 생김 — 실사용 콘솔 로그로 발견. 계산과 저장을 분리해서 해결).

    반환값: {"result": run_with_existing()의 원본 결과, "existing_permits": ...,
             "existing_map": ..., "own_decision_map": ...,
             "own_violation_only_map": ..., "counterpart_note_fn": ...}
    """
    out_dir = Path(out_dir)
    existing_permits, existing_map = _load_existing_active_permits(
        out_dir, exclude_ids={p.permit_id for p in permits})
    result = run_with_existing(permits, existing_permits)
    own_decision_map, own_violation_only_map = build_decision_maps(permits, result, existing_map)
    counterpart_note_fn = make_counterpart_note_fn(own_violation_only_map)
    return {
        "result": result,
        "existing_permits": existing_permits,
        "existing_map": existing_map,
        "own_decision_map": own_decision_map,
        "own_violation_only_map": own_violation_only_map,
        "counterpart_note_fn": counterpart_note_fn,
    }


def process_permits(permits, out_dir, use_ai=True, ai_result=None):
    """`compute_decisions()` + AI + 저장까지 한 번에 수행하는 원스톱 함수.
    화면 출력 순서가 중요하지 않은 호출부(테스트 코드, 비대화형 스크립트)를
    위한 편의 함수 — main()은 화면 출력 순서를 지켜야 해서 이 함수 대신
    `compute_decisions()`를 직접 쓴다(위 주석 참고).

    반환값: compute_decisions()의 반환값 + "saved_paths": [...],
             "updated_counterpart_paths": [...]
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(exist_ok=True)

    decisions = compute_decisions(permits, out_dir)
    result = decisions["result"]

    if use_ai and ai_result is None:
        try:
            from integrated_pipeline import run_pipeline as ai_pipeline
            ai_result = ai_pipeline(permits, result)
        except Exception:
            ai_result = None

    saved_paths = save_new_permits(
        permits, result, out_dir, decisions["own_decision_map"], decisions["counterpart_note_fn"], ai_result=ai_result)
    updated_counterpart_paths = update_existing_counterparts(
        result, out_dir, decisions["existing_map"], decisions["counterpart_note_fn"])

    return {**decisions, "saved_paths": saved_paths, "updated_counterpart_paths": updated_counterpart_paths}


def main():
    raw_args = [a for a in sys.argv[1:] if not a.startswith("--")]
    use_ai = "--no-ai" not in sys.argv   # 기본값: AI 검토의견까지 자동 실행. 빠른 확인이 필요하면 --no-ai로 끔
    recursive = "--recursive" in sys.argv

    if not raw_args:
        print(__doc__)
        print("\n⚠️ PDF 경로 또는 폴더 경로를 1개 이상 넘겨야 합니다.")
        print('   예: python run_pipeline.py "허가서A.pdf" "허가서B.pdf"')
        print('   예: python run_pipeline.py "C:\\허가서모음"')
        sys.exit(1)

    args = collect_pdf_paths(raw_args, recursive=recursive)
    if not args:
        print("\n⚠️ 처리할 PDF를 하나도 찾지 못했습니다.")
        sys.exit(1)

    print("=" * 68)
    print(f"① PDF 파싱  (입력 파일 {len(args)}개)")
    print("=" * 68)
    permits = []
    for path in args:
        print(f"\n  파일: {path}")
        found = parse_pdf(path)
        print(f"  → 허가서 {len(found)}건 추출")
        permits.extend(found)

    print(f"\n전체 허가서 합계: {len(permits)}건 (아래부터 서로 다른 파일이어도 동일하게 취급)")
    for p in permits:
        show_parsed(p)

    print("\n" + "=" * 68)
    print("② 룰엔진 판정 (허가서별 — 각자 자체 위반 여부)")
    print("=" * 68)
    for p in permits:
        print(f"\n▶ {p.permit_id}")
        # ⚠️ 2026-08-06: 이 시점엔 아직 SIMOPS(다른 허가서와의 충돌)를 계산 안 함
        #    — 이 허가서 "자체" 위반만 보여주는 중간 단계다. 예전엔 print_report가
        #    이걸 "최종 판정"이라고 찍어서, 나중에 ③단계에서 SIMOPS 반려가 붙어도
        #    이미 화면에서 "승인"을 본 사용자가 혼란스러워하는 문제가 실제로
        #    발생함(자체위반 0건인 허가서가 SIMOPS 충돌로 최종 반려되는 경우).
        #    label을 바꿔서 "아직 SIMOPS 반영 전"임을 명시.
        print_report(run([p]), label="자체 판정 (SIMOPS 반영 전)")

    # ⚠️ 실제 운영 흐름(웹에서 허가서 1건씩 업로드)을 위해, "이번 실행에 같이
    #    넣은 것들끼리만" 비교하던 예전 방식에서, "outputs/ 폴더에 이미 저장된
    #    승인된 허가서들"까지 불러와서 함께 비교하는 방식으로 변경.
    #    1건씩 올리든 여러 건을 한꺼번에 올리든, "기존 것 + 새로 들어온 것"을
    #    합쳐서 비교한다는 로직 자체는 동일함.
    out_dir = Path(__file__).parent / "outputs"
    out_dir.mkdir(exist_ok=True)

    # ⚠️ 2026-08-06: 처음엔 이 자리에서 process_permits()(계산+AI+저장을 한
    #    번에 다 하는 함수) 하나만 불렀는데, 그러면 그 함수 안에서 AI 검토의견
    #    출력과 "재제출로 판단됨" 등 저장 메시지가 먼저 찍혀버리고, 그 다음에야
    #    아래 ③ SIMOPS 판정 화면이 나오는 순서 역전이 실사용 콘솔 로그에서
    #    발견됨. compute_decisions()로 "계산만" 먼저 하고, ③번 화면 출력 →
    #    ④ AI 호출 → 저장을 여기서 순서대로 직접 수행하도록 고침.
    decisions = compute_decisions(permits, out_dir)
    result = decisions["result"]
    existing_permits = decisions["existing_permits"]
    counterpart_note_fn = decisions["counterpart_note_fn"]

    if existing_permits:
        print(f"\n(참고: outputs/ 폴더의 기존 허가서 {len(existing_permits)}건도 함께 비교합니다 — "
              f"개별판정 상태와 무관하게 SIMOPS는 항상 전부 비교)")

    if len(permits) > 1 or existing_permits:
        print("\n" + "=" * 68)
        print(f"③ 동시작업 충돌(SIMOPS) 판정 — 신규 {len(permits)}건 + 기존 {len(existing_permits)}건 함께 대조")
        print("=" * 68)
        if result["pair_conflicts"]:
            for c in result["pair_conflicts"]:
                print(f"  [{c['rule_id']}] {c['permits'][0]} x {c['permits'][1]}  [{c.get('zone_relation','동일구역')}]")
                print(f"      {c['work_types'][0]} x {c['work_types'][1]} → {c['risk']}")
                print(f"      {c['reason']}")
                print(f"      (근거: {c['legal_ref']})")
                note = counterpart_note_fn(c, c["permits"][0]) or counterpart_note_fn(c, c["permits"][1])
                if note:
                    print(f"      {note}")
        else:
            print("  동시작업 충돌 없음 (구역·시간이 겹치는 허가서가 없거나, 겹쳐도 위험조합 아님)")
    else:
        print("\n(신규 1건뿐이고 기존 승인 허가서도 없어서 동시작업 충돌 검사는 생략됨)")

    ai_result = None
    if use_ai:
        print("\n" + "=" * 68)
        print("④ AI 검토의견 생성")
        print("=" * 68)
        try:
            from integrated_pipeline import run_pipeline as ai_pipeline
            ai_result = ai_pipeline(permits, result)   # ⚠️ 예전엔 반환값을 안 받아서 코멘트가 그냥 버려졌음. 또한 예전엔 이 함수가 result를 자체 재계산해서, run_with_existing()의 공식 판정과 어긋날 수 있었음 — 이제 계산된 result를 그대로 넘겨서 근거를 통일함
        except Exception as e:
            print(f"  AI 단계 생략 ({type(e).__name__}: {e})")
            print("  → NVIDIA_API_KEY 설정 및 관련 데이터 파일 확인 필요")
    else:
        print("\n(--no-ai 옵션으로 AI 검토의견 생성을 생략함)")

    # ⚠️ 예전엔 result.json 하나에 "가장 최근 실행 결과"만 덮어쓰고 있었음.
    #    그런데 TBM 자동생성(기능④)이 이 JSON을 재료로 쓰려면, 허가서 1건당
    #    결과가 1개씩 남아있어야 함 — 허가서 B를 처리하는 순간 허가서 A의
    #    결과가 사라지면 A의 TBM을 영원히 못 만듦. 그래서 "허가서별 개별 파일"로
    #    구조를 바꾸고, 배치(여러 건 동시처리) 전체 요약은 별도 파일로 분리함.
    saved_paths = save_new_permits(
        permits, result, out_dir, decisions["own_decision_map"], counterpart_note_fn, ai_result=ai_result)
    print(f"\n📄 허가서별 결과 {len(saved_paths)}건 저장 완료:")
    for fp in saved_paths:
        print(f"   {fp.resolve()}")

    updated_counterpart_paths = update_existing_counterparts(
        result, out_dir, decisions["existing_map"], counterpart_note_fn)
    for fp in updated_counterpart_paths:
        print(f"  ℹ️ 기존 허가서 갱신됨: {fp.name}")

    print("\n" + "=" * 68)
    print("⚠️  최종 승인/반려는 관리자가 직접 결정합니다.")
    print("=" * 68)


if __name__ == "__main__":
    main()