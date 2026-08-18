import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BellRing, BrainCircuit, CheckCircle2, ChevronDown, Clock3, FileImage, MapPin,
  Factory, Maximize2, Search, Send, ShieldCheck, Siren, Trash2, UserRound, Wrench, X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiBlob, apiRequest } from "../../api/client";
import { SectionHead } from "../../components/common";
import { maskName } from "../../utils/privacy";

const statusOptions = [["", "전체"], ["received", "접수"], ["action_requested", "조치 요청"], ["completion_reported", "완료 확인 대기"], ["resolved", "처리 완료"]];
const statusLabels = Object.fromEntries(statusOptions.filter(([value]) => value));
Object.assign(statusLabels, { confirmed:"기존 확인", in_progress:"기존 조치 중" });
const userReportSteps = ["received", "action_requested", "completion_reported", "resolved"];
const legacySteps = ["received", "confirmed", "in_progress", "resolved"];
const sourceOptions = [["", "전체 이벤트"], ["equipment_alert", "설비 이상"], ["user_report", "작업자 위험 신고"], ["ai_ppe", "AI 보호구 감지"], ["system_alert", "시스템 안전 알림"]];
const sourceLabels = {
  equipment_alert: { label:"설비 이상", badge:"red", detail:"디지털 트윈 설비 이상 상세" },
  user_report: { label:"작업자 신고", badge:"cyan", detail:"현장 작업자 신고 상세" },
  ai_ppe: { label:"AI 보호구 감지", badge:"orange", detail:"AI 보호구 감지 상세" },
  system_alert: { label:"시스템 알림", badge:"orange", detail:"작업자 대상 안전 알림 상세" },
};
const riskLabels = {
  FALL_HEIGHT: "추락·고소작업 위험", PPE_MISSING: "보호구 미착용", FIRE_EXPLOSION: "화재·폭발 위험",
  EQUIPMENT_FAILURE: "장비·설비 이상", COLLISION_PINCH: "충돌·협착 위험", FALLING_OBJECT_LIFTING: "낙하물·중량물 위험",
  ELECTRICAL: "감전·전기 위험", ASPHYXIATION_GAS: "질식·유해가스 위험", HAZARDOUS_LEAK: "위험물·화학물질 누출",
  DANGER_ZONE_ACCESS: "위험구역 접근", HOUSEKEEPING: "통로·정리정돈 불량", OTHER: "기타 신고",
};
const severityLabels = { unclassified:"분류 대기", low:"낮음", medium:"보통", high:"높음", critical:"긴급" };
const ppeItems = [
  ["helmet", "helmetOn", "안전모"],
  ["harness", "harnessOn", "안전 하네스"],
  ["welding_mask", "weldingMaskOn", "용접면"],
];
const formatDate = value => value ? new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(new Date(value)) : "-";
const reportSource = report => sourceLabels[report?.sourceType] || sourceLabels.user_report;
const parseMissingItems = value => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const nullableBoolean = value => value == null ? null : value === true || value === 1 || value === "1" || value === "true";

function WorkerReports({ session, notify }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [equipmentDraft, setEquipmentDraft] = useState(() => location.state?.equipmentReview || null);
  const [creatingEquipmentEvent, setCreatingEquipmentEvent] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [filter, setFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifyReporter, setNotifyReporter] = useState(true);
  const [alertDraft, setAlertDraft] = useState(null);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [actionHistory, setActionHistory] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const headers = { Authorization:`Bearer ${session.token}` };

  useEffect(() => {
    apiRequest("/api/admin/workers", { headers })
      .then(setWorkers)
      .catch(error => notify(error.message));
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      if (sourceFilter) params.set("sourceType", sourceFilter);
      const rows = await apiRequest(`/api/safety-events/reports${params.size ? `?${params}` : ""}`, { headers });
      setReports(rows);
      setSelectedId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? null);
    } catch (error) { notify(error.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadReports(); }, [filter, sourceFilter]);
  useEffect(() => {
    const waiting = reports.some(report =>
      report.sourceType === "user_report" && ["pending", "analyzing"].includes(report.analysisStatus)
    );
    if (!waiting) return undefined;
    const timer = window.setInterval(loadReports, 5000);
    return () => window.clearInterval(timer);
  }, [reports, filter, sourceFilter]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? reports.filter(report => [report.reportNo, report.title, report.description, report.reporterName, report.employeeNo, report.facilityName, report.assetCode, report.assetName].some(value => String(value || "").toLowerCase().includes(keyword))) : reports;
  }, [reports, query]);
  const selected = reports.find(report => report.id === selectedId) || null;
  const selectedSource = reportSource(selected);
  const isAiPpe = selected?.sourceType === "ai_ppe";
  const isSystemAlert = selected?.sourceType === "system_alert";
  const isEquipmentAlert = selected?.sourceType === "equipment_alert";
  const missingItems = parseMissingItems(selected?.missingItems);

  useEffect(() => {
    setNotifyReporter(selected?.sourceType === "user_report");
    setSelectedWorkerId(selected?.targetUserId ? String(selected.targetUserId) : "");
    setAlertDraft(null);
    setExpandedHistoryId(null);
  }, [selectedId, selected?.sourceType]);

  const dismissEquipmentDraft = () => {
    setEquipmentDraft(null);
    navigate(location.pathname, { replace:true, state:null });
  };

  const createEquipmentEvent = async () => {
    if (!equipmentDraft) return;
    setCreatingEquipmentEvent(true);
    try {
      const result = await apiRequest("/api/safety-events/equipment-alerts", {
        method:"POST",
        headers,
        body:JSON.stringify(equipmentDraft),
      });
      const rows = await apiRequest("/api/safety-events/reports?sourceType=equipment_alert", { headers });
      setReports(rows);
      setFilter("");
      setSourceFilter("equipment_alert");
      setQuery("");
      setSelectedId(result.id);
      dismissEquipmentDraft();
      notify(result.message);
      window.dispatchEvent(new Event("safety-events-updated"));
    } catch (error) {
      notify(error.message);
    } finally {
      setCreatingEquipmentEvent(false);
    }
  };

  const toggleActionHistory = async () => {
    if (!selected) return;
    if (expandedHistoryId === selected.id) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(selected.id);
    if (actionHistory[selected.id]) return;
    setHistoryLoading(true);
    try {
      const rows = await apiRequest(`/api/safety-events/${selected.id}/actions`, { headers });
      setActionHistory(current => ({ ...current, [selected.id]: rows }));
    } catch (error) {
      setExpandedHistoryId(null);
      notify(error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

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
      const result = await apiRequest(`/api/safety-events/${selected.id}/actions`, {
        method:"POST",
        headers,
        body:JSON.stringify({
          status:nextStatus,
          comment:comment.trim(),
          notifyReporter:selected.sourceType === "user_report" && notifyReporter,
          targetUserId:selected.sourceType === "equipment_alert" && nextStatus === "action_requested"
            ? Number(selectedWorkerId)
            : undefined,
        }),
      });
      if (result.notificationScheduled) notify(selected.sourceType === "equipment_alert"
        ? "선택한 작업자에게 조치 요청을 전달했습니다."
        : "신고자에게 처리 상태 알림을 예약했습니다.");
      notify(`안전 이벤트가 '${statusLabels[nextStatus]}' 단계로 변경되었습니다.`);
      setComment("");
      await loadReports();
      window.dispatchEvent(new Event("safety-events-updated"));
    } catch (error) { notify(error.message); } finally { setSaving(false); }
  };

  const deleteResolvedEvent = async () => {
    if (!selected || selected.status !== "resolved") return;
    if (!window.confirm(`${selected.reportNo} 안전 이벤트를 삭제하시겠습니까?\n삭제 후에는 목록에서 복구할 수 없습니다.`)) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/safety-events/${selected.id}`, {
        method:"DELETE",
        headers,
      });
      setPhotoExpanded(false);
      notify("처리 완료된 안전 이벤트를 삭제했습니다.");
      await loadReports();
      window.dispatchEvent(new Event("safety-events-updated"));
    } catch (error) {
      notify(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const openAlertComposer = () => {
    if (!selected?.targetUserId) return;
    setAlertDraft({
      title:"안전 관리자 알림",
      body:`${riskLabels[selected.eventType] || selected.title} 관련 안내입니다. 현장 안전관리자의 지시에 따라 주세요.`,
    });
  };

  const sendConfirmedAlert = async () => {
    if (!selected?.targetUserId || !alertDraft?.title.trim() || !alertDraft?.body.trim()) {
      notify("알림 제목과 내용을 입력해 주세요.");
      return;
    }
    setSendingAlert(true);
    try {
      const result = await apiRequest("/api/admin/notifications/send", {
        method:"POST",
        headers,
        body:JSON.stringify({
          userId:selected.targetUserId,
          eventId:selected.id,
          title:alertDraft.title.trim(),
          body:alertDraft.body.trim(),
          url:"/worker/work",
          confirmed:true,
        }),
      });
      setAlertDraft(null);
      notify(result.pushStatus === "sent"
        ? "작업자에게 앱 알림과 푸시 알림을 발송했습니다."
        : "작업자 앱 알림함에 저장했습니다. 푸시 수신 기기는 확인되지 않았습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      setSendingAlert(false);
    }
  };

  const workerWorkflow = ["user_report", "equipment_alert"].includes(selected?.sourceType);
  const statusSteps = workerWorkflow ? userReportSteps : legacySteps;
  const currentStep = selected ? Math.max(0, statusSteps.indexOf(selected.status)) : 0;
  const nextStatus = workerWorkflow
    ? (selected.status === "received" || ["confirmed", "in_progress"].includes(selected.status)
        ? "action_requested"
        : selected.status === "completion_reported" ? "resolved" : null)
    : selected && !isSystemAlert && currentStep < statusSteps.length - 1 ? statusSteps[currentStep + 1] : null;
  const analysisDone = selected?.analysisStatus === "completed";
  const analysisFailed = selected?.analysisStatus === "failed";

  const requestAnalysis = async () => {
    if (!selected || selected.sourceType !== "user_report") return;
    setAnalyzing(true);
    try {
      await apiRequest(`/api/safety-events/${selected.id}/analysis`, { method:"POST", headers });
      await loadReports();
      notify("AI 위험 분석을 시작했습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return <>
    {equipmentDraft && <section className="equipment-review-draft">
      <div className="equipment-review-draft-icon"><Factory/></div>
      <div className="equipment-review-draft-body">
        <span>DIGITAL TWIN HANDOFF · 검토 초안</span>
        <h3>{equipmentDraft.facilityName} · {equipmentDraft.assetName}</h3>
        <p><b>{equipmentDraft.assetCode}</b> · {equipmentDraft.faultPart} · {equipmentDraft.faultSymptom}</p>
        <small>아직 안전 이벤트로 접수되지 않았고 작업자에게도 전달되지 않았습니다. 동일 설비의 미완료 이벤트가 있으면 새로 만들지 않고 기존 건을 엽니다.</small>
      </div>
      <div className="equipment-review-draft-actions">
        <button type="button" className="outline-btn" disabled={creatingEquipmentEvent} onClick={dismissEquipmentDraft}>검토 취소</button>
        <button type="button" className="primary-small" disabled={creatingEquipmentEvent} onClick={createEquipmentEvent}><ShieldCheck/>{creatingEquipmentEvent?"확인 중...":"안전 이벤트로 접수"}</button>
      </div>
    </section>}
    {selected && <div className="report-notification-controls">
      <div><BellRing/><span><b>{isEquipmentAlert ? "관리자 확인 후 작업자 전달" : "확인 기반 알림"}</b><small>{isEquipmentAlert ? (selected.targetUserId ? `${maskName(selected.reporterName)} · ${selected.employeeNo || "사번 없음"}` : "담당 작업자 미배정") : `${maskName(selected.reporterName)} · ${selected.employeeNo || "사번 없음"}`}</small></span></div>
      {nextStatus && selected.sourceType === "user_report" && <label className="report-notify-confirm"><input type="checkbox" checked={notifyReporter} onChange={event=>setNotifyReporter(event.target.checked)}/><span><b>상태 저장 후 신고자에게 알림</b><small>관리자의 상태 변경을 발송 확인으로 사용합니다.</small></span></label>}
      {selected.targetUserId && <button type="button" className="outline-btn report-alert-button" onClick={openAlertComposer}><BellRing/>작업자 알림 작성</button>}
    </div>}
    <SectionHead eyebrow="SAFETY EVENT MANAGEMENT" title="안전 이벤트 관리" desc="작업자 신고·보호구 감지·설비 이상을 검토하고, 담당 작업자를 지정한 건만 조치 요청으로 전달합니다."/>
    <div className="worker-report-source-tabs">{sourceOptions.map(([value,label])=><button key={label} className={sourceFilter===value?"active":""} onClick={()=>setSourceFilter(value)}>{label}</button>)}</div>
    <div className="worker-report-admin">
      <section className="worker-report-inbox">
        <div className="worker-report-toolbar"><h3>안전 이벤트 목록 <small>{reports.length}건</small></h3><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="이벤트번호, 작업자, 내용 검색"/></label></div>
        <div className="worker-report-filters">{statusOptions.map(([value,label])=><button key={label} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}</div>
        <div className="worker-report-list">
          {loading?<div className="report-admin-empty">안전 이벤트를 불러오는 중입니다.</div>:filtered.length===0?<div className="report-admin-empty"><ShieldCheck/>조건에 맞는 안전 이벤트가 없습니다.</div>:filtered.map(report=>{
            const source = reportSource(report);
            return <button key={report.id} className={selectedId===report.id?"selected":""} onClick={()=>setSelectedId(report.id)}>
              <div className="report-list-top"><span className={`badge ${source.badge}`}>{source.label}</span><span className={`report-status ${report.status}`}>{statusLabels[report.status] || report.status}</span></div>
              <small>{report.reportNo}</small><b>{riskLabels[report.eventType] || report.title}</b><p>{report.description}</p>
              <div className="report-list-meta"><span>{report.sourceType === "equipment_alert" ? <Factory/> : <UserRound/>}{report.sourceType === "equipment_alert" ? report.facilityName : maskName(report.reporterName)}</span><span>{report.sourceType === "equipment_alert" ? report.assetCode : report.employeeNo}</span><span><Clock3/>{formatDate(report.eventTime)}</span></div>
            </button>;
          })}
        </div>
      </section>
      <section className="worker-report-detail">
        {!selected?<div className="report-admin-empty detail"><Siren/>왼쪽에서 안전 이벤트를 선택하세요.</div>:<>
          <div className="report-detail-head"><div><span>{selectedSource.detail}</span><h3>{selected.reportNo}</h3></div><div><span className={`report-status ${selected.status}`}>{statusLabels[selected.status]}</span><span className={`badge ${selectedSource.badge}`}>{selectedSource.label}</span></div></div>
          <div className="report-detail-source"><div className={`report-photo${isEquipmentAlert ? " equipment" : ""}`}>{isEquipmentAlert?<Factory/>:photoUrl?<button type="button" onClick={()=>setPhotoExpanded(true)} aria-label="첨부 사진 크게 보기"><img src={photoUrl} alt={isAiPpe?"AI 보호구 검사 사진":"작업자가 첨부한 위험 현장"}/><span><Maximize2/> 크게 보기</span></button>:<FileImage/>}</div><dl>
            <div><dt>위험 유형</dt><dd>{riskLabels[selected.eventType] || selected.title}</dd></div><div><dt>{isEquipmentAlert?"대상 설비":isAiPpe||isSystemAlert?"대상 작업자":"신고자"}</dt><dd>{isEquipmentAlert?`${selected.assetName} · ${selected.assetCode}`:maskName(selected.reporterName)}</dd></div><div><dt>{isEquipmentAlert?"담당 작업자":"사번"}</dt><dd>{isEquipmentAlert?(selected.targetUserId?`${maskName(selected.reporterName)} · ${selected.employeeNo || "사번 없음"}`:"미배정"):(selected.employeeNo || "-")}</dd></div><div><dt>{isEquipmentAlert?"이벤트 접수":isAiPpe?"감지 시각":isSystemAlert?"알림 시각":"신고 시각"}</dt><dd>{formatDate(selected.eventTime)}</dd></div>
          </dl></div>
          <div className="report-description"><b>{isEquipmentAlert?"설비 이상 내용":isAiPpe?"AI 판정 내용":"작업자 상세 내용"}</b><p>{selected.description}</p></div>
          {["user_report", "equipment_alert"].includes(selected.sourceType)&&<div className="report-action-history">
            <button type="button" className={expandedHistoryId === selected.id ? "expanded" : ""} onClick={toggleActionHistory}>
              <span><Clock3/><b>처리 이력 보기</b><small>관리자 요청과 Worker 완료 보고 내용을 확인합니다.</small></span>
              <ChevronDown/>
            </button>
            {expandedHistoryId === selected.id&&<div className="report-action-history-list">
              {historyLoading?<p className="report-action-history-empty">처리 이력을 불러오는 중입니다.</p>:(actionHistory[selected.id] || []).length === 0?<p className="report-action-history-empty">아직 등록된 처리 내용이 없습니다.</p>:(actionHistory[selected.id] || []).map(action=><article key={action.id}>
                <i className={action.actorRole === "ADMIN" ? "admin" : "worker"}>{action.actorRole === "ADMIN" ? "관리자" : "Worker"}</i>
                <div><b>{statusLabels[action.actionType] || action.actionType}</b><p>{action.comment || "입력된 내용 없음"}</p><small>{maskName(action.actorName)}{action.employeeNo ? ` · ${action.employeeNo}` : ""} · {formatDate(action.createdAt)}</small></div>
              </article>)}
            </div>}
          </div>}
          {isEquipmentAlert?<article className="ai-report-result completed equipment-event-result">
            <div className="ai-result-title"><Factory/><div><b>설비 진단 인계 정보</b><span>{selected.facilityName} · {selected.facilityCode}</span></div></div>
            <div className="equipment-event-grid"><div><span>이상 부품</span><b>{selected.faultPart}</b></div><div><span>감지 증상</span><b>{selected.faultSymptom}</b></div></div>
            <div className="ai-result-text"><div><b>진단 근거</b><p>{selected.cause}</p></div><div><b>권고 조치</b><p>{selected.equipmentRecommendedAction}</p></div></div>
            <small className="ai-confidence">디지털 트윈에서 전달된 검토 정보이며, 작업자 선택 및 조치 요청 전 관리자가 현장 조건을 확인해야 합니다.</small>
          </article>:isAiPpe?<article className="ai-report-result completed ai-ppe-event-result">
            <div className="ai-result-title"><AlertTriangle/><div><b>보호구 착용 판정</b><span>분석 완료 · {selected.modelVersion || "모델 버전 미기재"}</span></div></div>
            <div className="ppe-detection-grid">{ppeItems.map(([key,field,label])=>{
              const detected = missingItems.includes(key) ? false : nullableBoolean(selected[field]);
              const state = detected == null ? "unknown" : detected ? "on" : "off";
              return <div key={key} className={`ppe-detection ${state}`}><span>{label}</span><b>{state==="on"?"착용":state==="off"?"미착용":"판정 제외"}</b>{state==="off"&&<AlertTriangle/>}</div>;
            })}</div>
            <small className="ai-confidence">검사 ID #{selected.ppeCheckId || "-"} · AI 판정은 관리자가 사진과 함께 검토하고 최종 조치해야 합니다.</small>
          </article>:<article className={`ai-report-result ${analysisDone?"completed":"pending"}`}>
            <div className="ai-result-title"><BrainCircuit/><div><b>AI 위험 분석</b><span>{analysisDone?`분석 완료 · ${selected.modelVersion || "모델 버전 미기재"}`:analysisFailed?"분석 실패":"분석 진행 중"}</span></div></div>
            {analysisDone?<><div className="ai-result-metrics"><div><MapPin/><span>추정 위치<b>{selected.estimatedLocation || "추정 불가"}</b></span></div><div><AlertTriangle/><span>위험 중요도<b className={`severity-${selected.severity}`}>{severityLabels[selected.severity] || selected.severity}</b></span></div><div><ShieldCheck/><span>위험 점수<b>{selected.riskScore ?? "-"}<small>/100</small></b></span></div></div><div className="ai-result-text"><div><b>분석 요약</b><p>{selected.analysisSummary}</p></div><div><b>권고 조치</b><p>{selected.recommendedAction}</p></div></div><small className="ai-confidence">우선순위 {selected.priority || "-"} · 정책 {selected.policyVersion || "-"} · 모델 신뢰도 {selected.confidence == null ? "-" : `${Math.round(Number(selected.confidence) * 100)}%`}</small></>:<div className="ai-pending-message"><Clock3/><b>{analysisFailed ? selected.analysisError || "AI 분석에 실패했습니다." : "AI 모델 분석 중..."}</b><button type="button" className="outline-btn" disabled={analyzing} onClick={requestAnalysis}>{analyzing?"요청 중...":"다시 분석"}</button></div>}
          </article>}
          <div className="report-progress"><b>처리 상태</b><div>{statusSteps.map((status,index)=><span key={status} className={index<=currentStep?"active":""}><i>{index<currentStep?<CheckCircle2/>:index+1}</i>{statusLabels[status]}</span>)}</div></div>
          {isEquipmentAlert&&nextStatus==="action_requested"&&<label className="report-action-assignee"><span>담당 작업자 선택 <small>선택 후 조치 요청을 누를 때만 작업자 앱으로 전달됩니다.</small></span><select value={selectedWorkerId} onChange={event=>setSelectedWorkerId(event.target.value)}><option value="">작업자를 선택하세요</option>{workers.map(worker=><option value={worker.id} key={worker.id}>{worker.name} · {worker.employee_no}</option>)}</select></label>}
          {nextStatus&&<label className="report-action-comment"><span>{nextStatus === "resolved" ? "Worker 완료 보고 검토 및 최종 확인" : "관리자 조치 요청 내용"}</span><textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={2000} placeholder={nextStatus === "resolved" ? "Worker의 완료 보고를 검토한 결과를 입력하세요." : "Worker가 수행해야 할 안전 조치 내용을 입력하세요."}/></label>}
          <div className="report-detail-actions">{nextStatus?<button disabled={saving || !comment.trim() || (isEquipmentAlert && nextStatus === "action_requested" && !selectedWorkerId)} className="primary-small" onClick={()=>updateStatus(nextStatus)}><Wrench/>{saving?"저장 중...":nextStatus === "action_requested" ? "담당 작업자에게 조치 요청" : nextStatus === "resolved" ? "최종 확인 및 처리 완료" : `${statusLabels[nextStatus]} 처리`}</button>:<><button disabled className="resolved-button"><CheckCircle2/>{selected.status === "action_requested" ? "Worker 완료 보고 대기 중" : selected.status === "resolved" ? "처리 완료됨" : "별도 조치 없음"}</button>{selected.status === "resolved"&&<button type="button" className="delete-event-button" disabled={deleting} onClick={deleteResolvedEvent}><Trash2/>{deleting?"삭제 중...":"이벤트 삭제"}</button>}</>}</div>
        </>}
      </section>
    </div>
    {photoExpanded&&photoUrl&&<div className="report-photo-lightbox" role="dialog" aria-modal="true" aria-label="첨부 사진 원본 보기" onClick={()=>setPhotoExpanded(false)}><button type="button" className="lightbox-close" onClick={()=>setPhotoExpanded(false)} aria-label="닫기"><X/></button><img src={photoUrl} alt={isAiPpe?"AI 보호구 검사 원본":"작업자가 첨부한 위험 현장 원본"} onClick={event=>event.stopPropagation()}/><span>사진 바깥을 클릭하거나 ESC 키를 누르면 닫힙니다.</span></div>}
    {alertDraft && <div className="report-alert-modal" role="dialog" aria-modal="true" aria-labelledby="report-alert-title" onClick={()=>!sendingAlert&&setAlertDraft(null)}>
      <div className="report-alert-dialog" onClick={event=>event.stopPropagation()}>
        <div className="report-alert-head"><div><span>CONFIRMED DELIVERY</span><h3 id="report-alert-title">작업자 알림 발송</h3></div><button type="button" onClick={()=>setAlertDraft(null)} disabled={sendingAlert} aria-label="닫기"><X/></button></div>
        <div className="report-alert-target"><UserRound/><span>발송 대상<b>{maskName(selected?.reporterName)} · {selected?.employeeNo || "사번 없음"}</b></span></div>
        <label><span>알림 제목</span><input value={alertDraft.title} maxLength={160} onChange={event=>setAlertDraft(current=>({...current,title:event.target.value}))}/></label>
        <label><span>알림 내용</span><textarea value={alertDraft.body} maxLength={1000} onChange={event=>setAlertDraft(current=>({...current,body:event.target.value}))}/></label>
        <div className="report-alert-preview"><small>작업자에게 표시될 내용</small><b>{alertDraft.title || "제목 없음"}</b><p>{alertDraft.body || "내용 없음"}</p></div>
        <p className="report-alert-caution"><AlertTriangle/>발송 버튼을 누르면 선택한 작업자 1명에게 즉시 전달되며 감사 로그에 기록됩니다.</p>
        <div className="report-alert-actions"><button type="button" className="outline-btn" onClick={()=>setAlertDraft(null)} disabled={sendingAlert}>취소</button><button type="button" className="primary-small" onClick={sendConfirmedAlert} disabled={sendingAlert}><Send/>{sendingAlert?"발송 중...":"1명에게 발송"}</button></div>
      </div>
    </div>}
  </>;
}

export default WorkerReports;
