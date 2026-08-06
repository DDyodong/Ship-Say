import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArchiveRestore, Check, Eye, FileText, Pencil, Plus, RotateCcw, Search, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { apiBlob, apiRequest } from "../../api/client";
import { SectionHead } from "../../components/common";

const emptyForm = () => ({
  permitNo: `PTW-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
  siteId: "",
  workType: "화기 작업",
  workTitle: "",
  workContent: "",
  workerIds: [],
});

const formatSize = (bytes) => {
  if (!bytes) return "0 KB";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
};

const parseJsonValue = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const analysisStatusText = status => ({
  queued: "분석 대기",
  running: "분석 중",
  finished: "분석 완료",
  failed: "분석 실패",
})[status] || "분석 대기";

function Permits({ notify, session }) {
  const [permits, setPermits] = useState([]);
  const [sites, setSites] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [trashedPermits, setTrashedPermits] = useState([]);
  const [trashBusyId, setTrashBusyId] = useState(null);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);
  const authorization = useMemo(() => ({ Authorization: `Bearer ${session.token}` }), [session.token]);

  const loadPermits = async (preferredId) => {
    try {
      const rows = await apiRequest("/api/work-permits", { headers: authorization });
      setPermits(rows);
      setSelectedId(preferredId || rows[0]?.id || null);
    } catch (error) {
      notify(error.message);
    }
  };

  const loadTrash = async () => {
    try {
      const rows = await apiRequest("/api/work-permits/trash", { headers: authorization });
      setTrashedPermits(rows);
    } catch (error) {
      notify(error.message);
    }
  };

  useEffect(() => {
    loadPermits();
    loadTrash();
    apiRequest("/api/master/sites", { headers: authorization })
      .then(rows => {
        const seenNames = new Set();
        const uniqueSites = rows.filter(site => {
          const key = String(site.name || site.site_code || site.id).trim().toLocaleLowerCase("ko-KR");
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        });
        setSites(uniqueSites);
        setForm(current => ({ ...current, siteId: current.siteId || String(uniqueSites[0]?.id || "") }));
      })
      .catch(error => notify(error.message));
    apiRequest("/api/admin/workers", { headers: authorization })
      .then(setWorkers)
      .catch(error => notify(error.message));
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let cancelled = false;
    let timer = null;
    const refresh = async () => {
      try {
        const next = await apiRequest(`/api/work-permits/${selectedId}`, { headers: authorization });
        if (cancelled) return;
        setDetail(next);
        if (["queued", "running"].includes(next.analysisRun?.status)) {
          timer = window.setTimeout(refresh, 1500);
        }
      } catch (error) {
        if (!cancelled) notify(error.message);
      }
    };
    refresh();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedId, authorization, analysisRefreshKey]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const filtered = permits.filter(permit =>
    `${permit.permit_no || ""} ${permit.work_title || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectFile = (nextFile) => {
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf" || !nextFile.name.toLowerCase().endsWith(".pdf")) return notify("PDF 허가서만 업로드할 수 있습니다.");
    if (nextFile.size > 10 * 1024 * 1024) return notify("허가서는 10MB 이하만 업로드할 수 있습니다.");
    setFile(nextFile);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFile(null);
    setForm({ ...emptyForm(), siteId: String(sites[0]?.id || "") });
    setModalOpen(true);
  };

  const openEditModal = () => {
    if (!detail) return;
    setEditingId(detail.id);
    setFile(null);
    setForm({
      permitNo: detail.permit_no || "",
      siteId: String(detail.site_id || ""),
      workType: detail.work_type || "화기 작업",
      workTitle: detail.work_title || "",
      workContent: detail.work_content || "",
      workerIds: (detail.assignedWorkers || []).map(worker => Number(worker.id)),
    });
    setModalOpen(true);
  };

  const closeModal = (force = false) => {
    if (submitting && !force) return;
    setModalOpen(false);
    setEditingId(null);
    setFile(null);
    setForm({ ...emptyForm(), siteId: String(sites[0]?.id || "") });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.siteId) return notify("등록된 사업장이 없습니다. 기준 정보에서 사업장을 먼저 등록해 주세요.");
    if (!form.permitNo.trim() || !form.workTitle.trim()) return notify("허가서 번호와 작업명을 입력해 주세요.");
    if (!editingId && !file) return notify("허가서 PDF 파일을 선택해 주세요.");
    setSubmitting(true);
    try {
      let uploaded = null;
      if (file) {
        const fileData = new FormData();
        fileData.append("file", file);
        fileData.append("fileType", "permit");
        uploaded = await apiRequest("/api/files", { method: "POST", headers: authorization, body: fileData });
      }
      const permitId = editingId;
      const saved = await apiRequest(editingId ? `/api/work-permits/${editingId}` : "/api/work-permits", {
        method: editingId ? "PUT" : "POST",
        headers: authorization,
        body: JSON.stringify({
          ...form,
          siteId: Number(form.siteId),
          status: "pending_review",
          isHighRisk: false,
          fileIds: uploaded ? [uploaded.id] : null,
        }),
      });
      closeModal(true);
      await loadPermits(saved.id);
      setAnalysisRefreshKey(current => current + 1);
      if (permitId) {
        const updated = await apiRequest(`/api/work-permits/${saved.id}`, { headers: authorization });
        setDetail(updated);
      }
      notify(`${form.permitNo} 허가서가 ${permitId ? "수정" : "등록"}되었습니다.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openPreview = async (attachedFile) => {
    setPreview({ name: attachedFile.original_name, url: null });
    setPreviewLoading(true);
    try {
      const blob = await apiBlob(`/api/files/${attachedFile.id}/download`, { headers: authorization });
      setPreview(current => current ? { ...current, url: URL.createObjectURL(blob) } : current);
    } catch (error) {
      setPreview(null);
      notify(error.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const requestAnalysis = async () => {
    if (!detail) return;
    try {
      await apiRequest(`/api/work-permits/${detail.id}/analyze`, { method: "POST", headers: authorization });
      const updated = await apiRequest(`/api/work-permits/${detail.id}`, { headers: authorization });
      setDetail(updated);
      setAnalysisRefreshKey(current => current + 1);
      notify(`${detail.permit_no} 허가서 분석을 다시 요청했습니다.`);
    } catch (error) {
      notify(error.message);
    }
  };

  const closePreview = () => setPreview(null);

  const deletePermit = async () => {
    if (!detail || deleting) return;
    if (!window.confirm(`${detail.permit_no} 허가서를 보관함으로 이동하시겠습니까?\n보관함에서 다시 업로드하거나 영구 삭제할 수 있습니다.`)) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/work-permits/${detail.id}`, { method: "DELETE", headers: authorization });
      closePreview();
      setDetail(null);
      await Promise.all([loadPermits(), loadTrash()]);
      notify(`${detail.permit_no} 허가서가 보관함으로 이동되었습니다.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const restorePermit = async (permit) => {
    if (trashBusyId) return;
    setTrashBusyId(permit.id);
    try {
      await apiRequest(`/api/work-permits/${permit.id}/restore`, { method: "POST", headers: authorization });
      await Promise.all([loadPermits(permit.id), loadTrash()]);
      notify(`${permit.permit_no} 허가서를 다시 업로드했습니다.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setTrashBusyId(null);
    }
  };

  const permanentlyDeletePermit = async (permit) => {
    if (trashBusyId) return;
    if (!window.confirm(`${permit.permit_no} 허가서를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setTrashBusyId(permit.id);
    try {
      await apiRequest(`/api/work-permits/${permit.id}/permanent`, { method: "DELETE", headers: authorization });
      await loadTrash();
      notify(`${permit.permit_no} 허가서를 영구 삭제했습니다.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setTrashBusyId(null);
    }
  };

  const attachedFile = detail?.files?.[0];
  const latestAnalysis = detail?.analysisResults?.[0];
  const analysisRun = detail?.analysisRun || {};
  const extracted = parseJsonValue(latestAnalysis?.extracted_data, {});
  const riskFactors = parseJsonValue(latestAnalysis?.risk_factors, []);
  const recommendedConditions = parseJsonValue(latestAnalysis?.recommended_conditions, []);
  const embeddedSimopsConflicts = Array.isArray(riskFactors) ? riskFactors.filter(item => item.type === "simops_conflict") : [];
  const simopsConflicts = detail?.simopsConflicts?.length ? detail.simopsConflicts : embeddedSimopsConflicts;
  const permitViolations = Array.isArray(riskFactors) ? riskFactors.filter(item => item.type === "permit_violation") : [];
  const analysisFinished = analysisRun.status === "finished" && latestAnalysis;
  const effectiveRisk = simopsConflicts.reduce((current, conflict) => {
    const rank = { 승인: 0, 보류: 1, 반려: 2 };
    return (rank[conflict.risk] || 0) > (rank[current] || 0) ? conflict.risk : current;
  }, extracted.overall_risk || "승인");
  const effectiveDecision = { 승인: "승인", 보류: "조건부 승인", 반려: "반려" }[effectiveRisk] || extracted.decision;
  return <>
    <SectionHead eyebrow="AI PERMIT ANALYSIS" title="작업 허가서 분석" desc="SIMOPS 충돌과 유사 사고를 분석해 승인 조건을 추천합니다." action={<button className="primary-small" onClick={openCreateModal}><Plus/>허가서 등록</button>}/>
    <div className="permit-layout">
      <div className="permit-list">
        <div className="list-tools"><Search/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="허가서, 작업명 검색"/></div>
        {filtered.length ? filtered.map(permit => <button className={selectedId === permit.id ? "selected" : ""} onClick={() => setSelectedId(permit.id)} key={permit.id}><div><span className="badge orange">{permit.status === "pending_review" ? "검토 대기" : permit.status}</span><small>{permit.permit_no}</small></div><b>{permit.work_title || "작업명 미입력"}</b><span>{permit.work_type || "공종 미입력"}</span></button>) : <div className="permit-list-empty"><FileText/><b>{permits.length ? "검색 결과가 없습니다" : "등록된 허가서가 없습니다"}</b><span>{permits.length ? "다른 검색어를 입력해 보세요." : "새 허가서를 등록하면 여기에 표시됩니다."}</span></div>}
      </div>
      <div className="analysis-panel">
        {detail ? <><div className="analysis-head"><div><span>{detail.permit_no}</span><h3>{detail.work_title}</h3></div><span className={`ai-chip ${analysisRun.status || "queued"}`}><Sparkles/>{analysisStatusText(analysisRun.status)}</span></div>
          {attachedFile ? <div className="doc-preview"><FileText/><div><b>{attachedFile.original_name}</b><span>{formatSize(attachedFile.file_size)}</span></div><button type="button" title="허가서 미리보기" aria-label={`${attachedFile.original_name} 미리보기`} onClick={() => openPreview(attachedFile)}><Eye/></button></div> : <div className="doc-preview"><FileText/><div><b>첨부 파일 없음</b><span>허가서 파일이 연결되지 않았습니다.</span></div></div>}
          <div className="permit-assigned-summary"><span>배정 작업자</span>{detail.assignedWorkers?.length ? <div>{detail.assignedWorkers.map(worker => <b key={worker.id}>{worker.name}<small>{worker.employee_no}</small></b>)}</div> : <em>배정된 작업자가 없습니다.</em>}</div>
          {analysisRun.status === "failed" ? <div className="analysis-failed"><AlertTriangle/><div><b>작업허가서 분석에 실패했습니다</b><p>{analysisRun.error_message || "분석 서비스 상태를 확인한 뒤 다시 시도해 주세요."}</p><button className="outline-btn" type="button" onClick={requestAnalysis}>다시 분석</button></div></div> : <>
            <h4>SIMOPS 충돌 분석</h4>
            {analysisFinished ? <div className="analysis-result-list">
              <div className={`analysis-decision ${effectiveRisk === "반려" ? "hard" : effectiveRisk === "보류" ? "conditional" : "approved"}`}><b>{effectiveDecision || "판정 완료"}</b><span>단일허가 위반 {permitViolations.length}건 · 동시작업 충돌 {simopsConflicts.length}건</span></div>
              {extracted.permit_number_matches === false && <div className="collision"><AlertTriangle/><div><b>허가번호가 일치하지 않습니다</b><p>화면 허가번호와 PDF에서 추출한 허가번호를 확인해 주세요.</p></div></div>}
              {simopsConflicts.length ? simopsConflicts.map((conflict, index) => {
                const workTypes = parseJsonValue(conflict.work_types, []);
                return <div className="collision" key={`${conflict.rule_code || conflict.rule_id}-${index}`}><AlertTriangle/><div><b>{conflict.rule_code || conflict.rule_id} · {(workTypes || []).join(" × ")}</b><p>{conflict.reason}</p><small>{conflict.counterpart_permit_no || (conflict.permits || []).join(" / ")} · {conflict.zone_relation}</small></div></div>;
              }) : <div className="analysis-safe"><Check/><div><b>감지된 동시작업 충돌이 없습니다</b><p>현재 분석된 허가서의 시간·공간·작업유형 기준입니다.</p></div></div>}
            </div> : <div className="collision"><AlertTriangle/><div><b>AI 분석을 진행하고 있습니다</b><p>PDF와 기존 허가서를 기준으로 규칙 및 동시작업 충돌을 확인합니다.</p></div></div>}
            <h4>추천 승인 조건</h4>
            {analysisFinished && recommendedConditions.length ? <div className="analysis-condition-list">{recommendedConditions.map((condition, index) => <div className="approval-item" key={`${condition}-${index}`}><Check/><span><b>{condition}</b><small>규칙 엔진이 도출한 보완·확인 조건</small></span></div>)}</div> : <div className="approval-empty"><div><Sparkles/></div><span><b>{analysisFinished ? "추가 보완 조건이 없습니다" : "추천 조건을 준비하고 있습니다"}</b><small>{analysisFinished ? "관리자가 원문 허가서와 현장 조건을 최종 확인해 주세요." : "분석이 완료되면 작업 전 확인해야 할 조건이 표시됩니다."}</small></span></div>}
          </>}
          <div className="approve-actions"><div className="permit-manage-actions"><button className="delete-permit-btn" type="button" disabled={deleting} onClick={deletePermit}><Trash2/>{deleting ? "삭제 중..." : "허가서 삭제"}</button><button className="outline-btn" type="button" onClick={openEditModal}><Pencil/>허가서 수정</button></div><button className="outline-btn permit-review-btn">보완 요청</button><button className="primary-small permit-approve-btn" onClick={() => notify(analysisFinished ? "최종 승인 처리는 다음 단계에서 연결합니다." : "분석 완료 후 승인할 수 있습니다.")}><Check/>조건부 승인</button></div></> : <div className="permit-welcome"><div className="permit-welcome-icon"><FileText/></div><span>WORK PERMIT</span><h3>{permits.length ? "분석할 허가서를 선택하세요" : "첫 작업 허가서를 등록하세요"}</h3><p>{permits.length ? "왼쪽 목록에서 허가서를 선택하면 AI 분석 결과와 승인 조건을 확인할 수 있습니다." : "PDF 허가서를 등록하면 SIMOPS 충돌과 유사 사고를 분석해 승인 조건을 추천합니다."}</p>{!permits.length && <button className="primary-small" onClick={openCreateModal}><Plus/>허가서 등록</button>}</div>}
      </div>
    </div>
    <section className="permit-trash">
      <div className="permit-trash-head">
        <div className="permit-trash-title">
          <span className="permit-trash-icon"><ArchiveRestore/></span>
          <span>
            <b>삭제한 허가서</b>
            <small>삭제한 문서를 복구하거나 영구 삭제할 수 있습니다.</small>
          </span>
        </div>
        <span className="permit-trash-count"><b>{trashedPermits.length}</b>건 보관 중</span>
      </div>
      {trashedPermits.length ? <div className="permit-trash-list">
        {trashedPermits.map(permit => <article className="permit-trash-item" key={permit.id}>
          <div className="permit-trash-info">
            <span className="permit-trash-file"><FileText/></span>
            <span>
              <span className="permit-trash-status">삭제됨</span>
              <b>{permit.work_title || "작업명 미입력"}</b>
              <small><span>{permit.permit_no}</span><i/>{permit.work_type || "공종 미입력"}</small>
            </span>
          </div>
          <div className="permit-trash-actions">
            <button className="outline-btn" type="button" disabled={trashBusyId === permit.id} onClick={() => restorePermit(permit)}>
              <RotateCcw/>{trashBusyId === permit.id ? "처리 중..." : "다시 업로드"}
            </button>
            <button className="permanent-delete-btn" type="button" disabled={trashBusyId === permit.id} onClick={() => permanentlyDeletePermit(permit)}>
              <Trash2/>영구 삭제
            </button>
          </div>
        </article>)}
      </div> : <div className="permit-trash-empty"><ArchiveRestore/><span>보관 중인 허가서가 없습니다.</span></div>}
    </section>
    {modalOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <form className="permit-modal" role="dialog" aria-modal="true" aria-labelledby="permit-modal-title" onSubmit={submit}>
        <div className="modal-head"><div><span>WORK PERMIT</span><h3 id="permit-modal-title">허가서 {editingId ? "수정" : "등록"}</h3></div><button type="button" className="icon-btn" title="닫기" onClick={closeModal}><X/></button></div>
        <div className="permit-form-grid">
          <label><span>허가서 번호</span><input value={form.permitNo} onChange={e => setForm({ ...form, permitNo: e.target.value })}/></label>
          <label><span>사업장</span><select value={form.siteId} onChange={e => setForm({ ...form, siteId: e.target.value })}><option value="">사업장 선택</option>{sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
          <label className="wide-field"><span>작업명</span><input value={form.workTitle} onChange={e => setForm({ ...form, workTitle: e.target.value })} placeholder="예: C-03 블록 배관 화기 작업"/></label>
          <label><span>작업 유형</span><select value={form.workType} onChange={e => setForm({ ...form, workType: e.target.value })}><option>화기 작업</option><option>고소 작업</option><option>밀폐 공간 작업</option><option>중량물 작업</option><option>일반 작업</option></select></label>
          <label className="wide-field"><span>작업 내용</span><textarea value={form.workContent} onChange={e => setForm({ ...form, workContent: e.target.value })} placeholder="작업 범위와 특이사항을 입력해 주세요."/></label>
          <fieldset className="permit-worker-field wide-field">
            <legend>작업자 배정 <small>{form.workerIds.length}명 선택</small></legend>
            {workers.length ? <div className="permit-worker-options">
              {workers.map(worker => <label className={form.workerIds.includes(Number(worker.id)) ? "selected" : ""} key={worker.id}>
                <input
                  type="checkbox"
                  checked={form.workerIds.includes(Number(worker.id))}
                  onChange={() => setForm(current => ({
                    ...current,
                    workerIds: current.workerIds.includes(Number(worker.id))
                      ? current.workerIds.filter(id => id !== Number(worker.id))
                      : [...current.workerIds, Number(worker.id)],
                  }))}
                />
                <span><b>{worker.name}</b><small>{worker.employee_no} · {worker.username}</small></span>
              </label>)}
            </div> : <div className="permit-worker-empty">가입된 WORKER 계정이 없습니다.</div>}
          </fieldset>
        </div>
        <div className={file ? "permit-upload selected" : "permit-upload"} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFile(e.dataTransfer.files[0]); }}><UploadCloud/><b>{file ? file.name : editingId && attachedFile ? attachedFile.original_name : "허가서 PDF를 업로드하세요"}</b><span>{file ? formatSize(file.size) : editingId && attachedFile ? "새 PDF를 선택하면 기존 파일을 교체합니다." : "PDF · 최대 10MB"}</span><input id="permit-file" type="file" accept="application/pdf,.pdf" onChange={e => selectFile(e.target.files[0])}/><label htmlFor="permit-file" className="outline-btn">{editingId ? "PDF 교체" : "파일 선택"}</label></div>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={closeModal}>취소</button><button className="primary-small" disabled={submitting}>{submitting ? "저장 중..." : editingId ? "변경사항 저장" : "업로드 및 등록"}</button></div>
      </form>
    </div>}
    {preview && <div className="modal-backdrop preview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closePreview(); }}>
      <section className="pdf-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title">
        <div className="modal-head"><div><span>PERMIT DOCUMENT</span><h3 id="pdf-preview-title">{preview.name}</h3></div><button type="button" className="icon-btn" title="미리보기 닫기" onClick={closePreview}><X/></button></div>
        <div className="pdf-preview-body">
          {previewLoading && <div className="permit-empty large">허가서를 불러오는 중입니다.</div>}
          {!previewLoading && preview.url && <iframe src={preview.url} title={`${preview.name} PDF 미리보기`}/>}
        </div>
      </section>
    </div>}
  </>;
}


export default Permits;
