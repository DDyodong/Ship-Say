import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BrainCircuit, CheckCircle2, Clock3, FileImage, MapPin,
  Maximize2, Search, ShieldCheck, Siren, UserRound, Wrench, X,
} from "lucide-react";
import { apiBlob, apiRequest } from "../../api/client";
import { SectionHead } from "../../components/common";

const statusOptions = [["", "전체"], ["received", "접수"], ["confirmed", "확인"], ["in_progress", "조치 중"], ["resolved", "처리 완료"]];
const statusLabels = Object.fromEntries(statusOptions.filter(([value]) => value));
const statusSteps = ["received", "confirmed", "in_progress", "resolved"];
const riskLabels = {
  FALL_HEIGHT: "추락·고소작업 위험", PPE_MISSING: "보호구 미착용", FIRE_EXPLOSION: "화재·폭발 위험",
  EQUIPMENT_FAILURE: "장비·설비 이상", COLLISION_PINCH: "충돌·협착 위험", FALLING_OBJECT_LIFTING: "낙하물·중량물 위험",
  ELECTRICAL: "감전·전기 위험", ASPHYXIATION_GAS: "질식·유해가스 위험", HAZARDOUS_LEAK: "위험물·화학물질 누출",
  DANGER_ZONE_ACCESS: "위험구역 접근", HOUSEKEEPING: "통로·정리정돈 불량", OTHER: "기타 신고",
};
const severityLabels = { unclassified:"분류 대기", low:"낮음", medium:"보통", high:"높음", critical:"긴급" };
const formatDate = value => value ? new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(new Date(value)) : "-";

function WorkerReports({ session, notify }) {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const headers = { Authorization:`Bearer ${session.token}` };

  const loadReports = async () => {
    setLoading(true);
    try {
      const rows = await apiRequest(`/api/safety-events/reports${filter ? `?status=${filter}` : ""}`, { headers });
      setReports(rows);
      setSelectedId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? null);
    } catch (error) { notify(error.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadReports(); }, [filter]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? reports.filter(report => [report.reportNo, report.description, report.reporterName, report.employeeNo].some(value => String(value || "").toLowerCase().includes(keyword))) : reports;
  }, [reports, query]);
  const selected = reports.find(report => report.id === selectedId) || null;

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setPhotoUrl("");
    if (!selected?.fileId) return undefined;
    apiBlob(`/api/files/${selected.fileId}/download`, { headers }).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setPhotoUrl(objectUrl);
    }).catch(error => notify(error.message));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected?.fileId]);

  useEffect(() => {
    if (!photoExpanded) return undefined;
    const closeOnEscape = event => { if (event.key === "Escape") setPhotoExpanded(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [photoExpanded]);

  const updateStatus = async nextStatus => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiRequest(`/api/safety-events/${selected.id}/actions`, { method:"POST", headers, body:JSON.stringify({ status:nextStatus, comment:comment.trim() }) });
      notify(`신고 상태가 '${statusLabels[nextStatus]}' 단계로 변경되었습니다.`);
      setComment("");
      await loadReports();
    } catch (error) { notify(error.message); } finally { setSaving(false); }
  };

  const currentStep = selected ? Math.max(0, statusSteps.indexOf(selected.status)) : 0;
  const nextStatus = selected && currentStep < statusSteps.length - 1 ? statusSteps[currentStep + 1] : null;
  const analysisDone = selected?.analysisStatus === "completed";

  return <>
    <SectionHead eyebrow="WORKER SAFETY REPORT" title="작업자 위험 신고" desc="현장 작업자가 접수한 사진과 내용을 확인하고 AI 분석 결과를 검토해 조치합니다."/>
    <div className="worker-report-admin">
      <section className="worker-report-inbox">
        <div className="worker-report-toolbar"><h3>현장 신고 목록 <small>{reports.length}건</small></h3><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="신고번호, 신고자, 내용 검색"/></label></div>
        <div className="worker-report-filters">{statusOptions.map(([value,label])=><button key={label} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}</div>
        <div className="worker-report-list">
          {loading?<div className="report-admin-empty">신고 내역을 불러오는 중입니다.</div>:filtered.length===0?<div className="report-admin-empty"><ShieldCheck/>조건에 맞는 위험 신고가 없습니다.</div>:filtered.map(report=><button key={report.id} className={selectedId===report.id?"selected":""} onClick={()=>setSelectedId(report.id)}>
            <div className="report-list-top"><span className="badge cyan">작업자 신고</span><span className={`report-status ${report.status}`}>{statusLabels[report.status] || report.status}</span></div>
            <small>{report.reportNo}</small><b>{riskLabels[report.eventType] || report.title}</b><p>{report.description}</p>
            <div className="report-list-meta"><span><UserRound/>{report.reporterName}</span><span>{report.employeeNo}</span><span><Clock3/>{formatDate(report.eventTime)}</span></div>
          </button>)}
        </div>
      </section>
      <section className="worker-report-detail">
        {!selected?<div className="report-admin-empty detail"><Siren/>왼쪽에서 작업자 위험 신고를 선택하세요.</div>:<>
          <div className="report-detail-head"><div><span>현장 작업자 신고 상세</span><h3>{selected.reportNo}</h3></div><div><span className={`report-status ${selected.status}`}>{statusLabels[selected.status]}</span><span className="badge cyan">작업자 신고</span></div></div>
          <div className="report-detail-source"><div className="report-photo">{photoUrl?<button type="button" onClick={()=>setPhotoExpanded(true)} aria-label="첨부 사진 크게 보기"><img src={photoUrl} alt="작업자가 첨부한 위험 현장"/><span><Maximize2/> 크게 보기</span></button>:<FileImage/>}</div><dl>
            <div><dt>위험 유형</dt><dd>{riskLabels[selected.eventType] || selected.title}</dd></div><div><dt>신고자</dt><dd>{selected.reporterName}</dd></div><div><dt>사번</dt><dd>{selected.employeeNo || "-"}</dd></div><div><dt>신고 시각</dt><dd>{formatDate(selected.eventTime)}</dd></div>
          </dl></div>
          <div className="report-description"><b>작업자 상세 내용</b><p>{selected.description}</p></div>
          <article className={`ai-report-result ${analysisDone?"completed":"pending"}`}>
            <div className="ai-result-title"><BrainCircuit/><div><b>AI 위험 분석</b><span>{analysisDone?`분석 완료 · ${selected.modelVersion || "모델 버전 미기재"}`:"분석 대기"}</span></div></div>
            {analysisDone?<><div className="ai-result-metrics"><div><MapPin/><span>추정 위치<b>{selected.estimatedLocation || "추정 불가"}</b></span></div><div><AlertTriangle/><span>위험 중요도<b className={`severity-${selected.severity}`}>{severityLabels[selected.severity] || selected.severity}</b></span></div><div><ShieldCheck/><span>위험 점수<b>{selected.riskScore ?? "-"}<small>/100</small></b></span></div></div><div className="ai-result-text"><div><b>분석 요약</b><p>{selected.analysisSummary}</p></div><div><b>권고 조치</b><p>{selected.recommendedAction}</p></div></div><small className="ai-confidence">모델 신뢰도 {selected.confidence == null ? "-" : `${Math.round(Number(selected.confidence) * 100)}%`} · 관리자가 결과를 검토하고 최종 확정해야 합니다.</small></>:<div className="ai-pending-message"><Clock3/><b>AI 모델 기다리는 중...</b></div>}
          </article>
          <div className="report-progress"><b>처리 상태</b><div>{statusSteps.map((status,index)=><span key={status} className={index<=currentStep?"active":""}><i>{index<currentStep?<CheckCircle2/>:index+1}</i>{statusLabels[status]}</span>)}</div></div>
          <label className="report-action-comment"><span>관리자 조치 내용</span><textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={2000} placeholder="현장 확인 결과와 조치 내용을 입력하세요."/></label>
          <div className="report-detail-actions">{nextStatus?<button disabled={saving} className="primary-small" onClick={()=>updateStatus(nextStatus)}><Wrench/>{saving?"저장 중...":`${statusLabels[nextStatus]} 처리`}</button>:<button disabled className="resolved-button"><CheckCircle2/>처리 완료됨</button>}</div>
        </>}
      </section>
    </div>
    {photoExpanded&&photoUrl&&<div className="report-photo-lightbox" role="dialog" aria-modal="true" aria-label="첨부 사진 원본 보기" onClick={()=>setPhotoExpanded(false)}><button type="button" className="lightbox-close" onClick={()=>setPhotoExpanded(false)} aria-label="닫기"><X/></button><img src={photoUrl} alt="작업자가 첨부한 위험 현장 원본" onClick={event=>event.stopPropagation()}/><span>사진 바깥을 클릭하거나 ESC 키를 누르면 닫힙니다.</span></div>}
  </>;
}

export default WorkerReports;
