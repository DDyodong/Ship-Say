import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  HardHat,
  ListChecks,
  Radio,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "../../api/client";
import { SectionHead } from "../../components/common";

const permitStatusText = status => ({
  draft: "임시 저장",
  pending_review: "검토 대기",
  approved: "승인 완료",
  conditional_approved: "조건부 승인",
  rejected: "반려",
  supplement_requested: "보완 요청",
  deleted: "삭제됨",
})[status] || status;

const badgeTone = status =>
  ["rejected", "deleted"].includes(status) ? "red" : ["approved", "conditional_approved"].includes(status) ? "cyan" : "orange";

const formatDateTime = value => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

// 승인 이후 파이프라인을 한 줄짜리 단계 스트립으로 보여준다. 기존 디지털트윈 화면의
// process-strip/process-step 스타일을 그대로 재사용해 새 CSS 없이 톤을 맞춘다.
function ProcessStrip({ steps }) {
  return (
    <div className="process-strip">
      {steps.map((step, index) => (
        <React.Fragment key={step.code}>
          <div className={`process-step ${step.status}`}>
            <span>{step.status === "done" ? <CheckCircle2 /> : index + 1}</span>
            <div>
              <b>{step.name}</b>
              <small>{step.detail}</small>
            </div>
          </div>
          {index < steps.length - 1 && <i />}
        </React.Fragment>
      ))}
    </div>
  );
}

function buildSteps(progress) {
  const analyzed = !["draft", "pending_review"].includes(progress.status);
  const approved = ["approved", "conditional_approved"].includes(progress.status);
  const rejected = progress.status === "rejected";
  const assigned = progress.assignedWorkerCount || 0;

  const tbmConfirmed = progress.tbmSessions.reduce((sum, session) => sum + (session.confirmedCount || 0), 0);
  const tbmStarted = progress.tbmSessions.length > 0;
  const tbmDone = tbmStarted && assigned > 0 && tbmConfirmed >= assigned;

  const ppeSubmitted = progress.ppeChecks.length;
  const ppeCleared = progress.ppeChecks.filter(check => check.status !== "retry_required").length;
  const ppeStarted = ppeSubmitted > 0;
  const ppeDone = ppeStarted && assigned > 0 && ppeCleared >= assigned;

  const openEvents = progress.safetyEvents.filter(event => !["resolved", "closed"].includes(event.status));

  return [
    { code: "registered", name: "허가서 등록", status: "done", detail: progress.permitNo },
    { code: "analysis", name: "AI 분석", status: analyzed ? "done" : "active", detail: analyzed ? "분석 완료" : "분석 대기" },
    {
      code: "decision",
      name: "승인 처리",
      status: approved || rejected ? "done" : "active",
      detail: permitStatusText(progress.status),
    },
    {
      code: "tbm",
      name: "TBM 브리핑",
      status: tbmDone ? "done" : tbmStarted ? "active" : "pending",
      detail: tbmStarted ? `참석 확인 ${tbmConfirmed}/${assigned}명` : "미시작",
    },
    {
      code: "ppe",
      name: "보호구 점검",
      status: ppeDone ? "done" : ppeStarted ? "active" : "pending",
      detail: ppeStarted ? `제출 ${ppeSubmitted}건 · 통과 ${ppeCleared}건` : "미시작",
    },
    {
      code: "field",
      name: "현장 모니터링",
      status: !approved ? "pending" : openEvents.length ? "active" : "done",
      detail: !approved ? "승인 대기" : openEvents.length ? `미해결 이벤트 ${openEvents.length}건` : "이상 없음",
    },
  ];
}

function PermitProgress({ session, notify }) {
  const [permits, setPermits] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingTbm, setGeneratingTbm] = useState(false);
  const [search, setSearch] = useState("");
  const authorization = useMemo(() => ({ Authorization: `Bearer ${session.token}` }), [session.token]);

  const generateTbm = () => {
    if (!selectedId || generatingTbm) return;
    setGeneratingTbm(true);
    apiRequest(`/api/admin/work-permits/${selectedId}/tbm/generate`, { method: "POST", headers: authorization })
      .then(data => {
        setProgress(data);
        notify("TBM 안내를 생성했습니다.");
      })
      .catch(error => notify(error.message))
      .finally(() => setGeneratingTbm(false));
  };

  useEffect(() => {
    apiRequest("/api/work-permits", { headers: authorization })
      .then(rows => {
        setPermits(rows);
        const firstApproved = rows.find(row => ["approved", "conditional_approved"].includes(row.status));
        setSelectedId(firstApproved?.id || rows[0]?.id || null);
      })
      .catch(error => notify(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setProgress(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    apiRequest(`/api/admin/work-permits/${selectedId}/progress`, { headers: authorization })
      .then(data => {
        if (!cancelled) setProgress(data);
      })
      .catch(error => {
        if (!cancelled) notify(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, authorization, notify]);

  const filtered = permits.filter(permit =>
    `${permit.permit_no || ""} ${permit.work_title || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const steps = useMemo(() => (progress ? buildSteps(progress) : []), [progress]);

  return (
    <>
      <SectionHead
        eyebrow="PERMIT LIFECYCLE"
        title="허가서 진행 현황"
        desc="승인된 허가서가 TBM · 보호구 점검 · 현장 모니터링을 거치는 과정을 한 곳에서 확인합니다."
      />
      <div className="permit-layout">
        <div className="permit-list">
          <div className="list-tools">
            <Search />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="허가서, 작업명 검색" />
          </div>
          {filtered.length ? (
            filtered.map(permit => (
              <button className={selectedId === permit.id ? "selected" : ""} onClick={() => setSelectedId(permit.id)} key={permit.id}>
                <div>
                  <span className={`badge ${badgeTone(permit.status)}`}>{permitStatusText(permit.status)}</span>
                  <small>{permit.permit_no}</small>
                </div>
                <b>{permit.work_title || "작업명 미입력"}</b>
                <span>{permit.work_type || "공종 미입력"}</span>
              </button>
            ))
          ) : (
            <div className="permit-list-empty">
              <FileText />
              <b>{permits.length ? "검색 결과가 없습니다" : "등록된 허가서가 없습니다"}</b>
              <span>{permits.length ? "다른 검색어를 입력해 보세요." : "작업 허가서 탭에서 먼저 등록해 주세요."}</span>
            </div>
          )}
        </div>
        <div className="analysis-panel">
          {!progress ? (
            <div className="permit-welcome">
              <div className="permit-welcome-icon">
                <ListChecks />
              </div>
              <span>PERMIT PROGRESS</span>
              <h3>{loading ? "불러오는 중입니다" : "확인할 허가서를 선택하세요"}</h3>
              <p>왼쪽 목록에서 허가서를 선택하면 승인 이후 진행 단계를 확인할 수 있습니다.</p>
            </div>
          ) : (
            <>
              <div className="analysis-head">
                <div>
                  <span>{progress.permitNo}</span>
                  <h3>{progress.workTitle}</h3>
                </div>
                <span className={`badge ${badgeTone(progress.status)}`}>{permitStatusText(progress.status)}</span>
              </div>

              <ProcessStrip steps={steps} />

              <div className="section-head-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h4 style={{ margin: 0 }}>TBM 브리핑</h4>
                <button className="outline-btn" onClick={generateTbm} disabled={generatingTbm}>
                  <Sparkles />{generatingTbm ? "생성 중..." : "TBM 즉시 생성"}
                </button>
              </div>
              {progress.tbmSessions.length ? (
                progress.tbmSessions.map(tbm => (
                  <div key={tbm.id}>
                    <div className="event-row">
                      <span className="cyan">
                        <Radio />
                      </span>
                      <div>
                        <b>{tbm.title || "TBM 세션"}</b>
                        <small>
                          {tbm.sessionDate} · 참석 확인 {tbm.confirmedCount}/{progress.assignedWorkerCount}명
                        </small>
                      </div>
                      <time>{tbm.status === "completed" ? "완료" : "진행 중"}</time>
                    </div>
                    {tbm.content && (
                      <pre style={{
                        whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.6,
                        color: "var(--muted)", background: "var(--panel)", border: "1px solid var(--border)",
                        borderRadius: 10, padding: "12px 14px", margin: "8px 0 16px",
                      }}>{tbm.content}</pre>
                    )}
                  </div>
                ))
              ) : (
                <div className="analysis-safe">
                  <Clock3 />
                  <div>
                    <b>아직 TBM 기록이 없습니다</b>
                    <p>작업자가 TBM 안내를 확인하거나, 위 &quot;TBM 즉시 생성&quot;을 누르면 여기 표시됩니다.</p>
                  </div>
                </div>
              )}

              <h4>보호구(PPE) 점검</h4>
              {progress.ppeChecks.length ? (
                progress.ppeChecks.map(check => (
                  <div className="event-row" key={check.id}>
                    <span className={check.status === "retry_required" ? "red" : "cyan"}>
                      <HardHat />
                    </span>
                    <div>
                      <b>{check.workerName}</b>
                      <small>
                        {check.employeeNo} · {formatDateTime(check.checkedAt)}
                      </small>
                    </div>
                    <time>{check.status === "retry_required" ? "재촬영 필요" : "확인 완료"}</time>
                  </div>
                ))
              ) : (
                <div className="analysis-safe">
                  <Clock3 />
                  <div>
                    <b>아직 제출된 점검이 없습니다</b>
                    <p>작업자가 개인 보호구를 제출하면 여기 표시됩니다.</p>
                  </div>
                </div>
              )}

              <h4>안전 이벤트</h4>
              {progress.safetyEvents.length ? (
                progress.safetyEvents.map(event => (
                  <div className="event-row" key={event.id}>
                    <span className={event.severity === "high" || event.severity === "critical" ? "red" : event.severity === "medium" ? "orange" : "cyan"}>
                      <AlertTriangle />
                    </span>
                    <div>
                      <b>{event.title}</b>
                      <small>
                        {event.sourceType} · {event.status}
                      </small>
                    </div>
                    <time>{formatDateTime(event.eventTime)}</time>
                  </div>
                ))
              ) : (
                <div className="analysis-safe">
                  <CheckCircle2 />
                  <div>
                    <b>이 허가서에 연결된 안전 이벤트가 없습니다</b>
                    <p>현재까지 신고되거나 감지된 위험이 없습니다.</p>
                  </div>
                </div>
              )}

              <h4>위험 점수</h4>
              {progress.riskScores.length ? (
                <div className="analysis-condition-list">
                  {progress.riskScores.map(score => (
                    <div className="approval-item" key={score.id}>
                      <ShieldAlert />
                      <span>
                        <b>
                          {score.riskLevel} · {score.score}점
                        </b>
                        <small>
                          {score.modelName || "모델 미지정"} · {formatDateTime(score.createdAt)}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="approval-empty">
                  <div>
                    <ShieldAlert />
                  </div>
                  <span>
                    <b>산출된 위험 점수가 없습니다</b>
                    <small>AI 위험 예측이 실행되면 여기 표시됩니다.</small>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default PermitProgress;
