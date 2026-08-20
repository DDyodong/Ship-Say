import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  HardHat,
  ImageOff,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Search,
  ShieldAlert,
  TriangleAlert,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiBlob, apiRequest } from "../../api/client";
import { SectionHead } from "../../components/common";

const EMPTY_SUMMARY = { required: 0, submitted: 0, passed: 0, attention: 0, pending: 0 };

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "용량 미확인";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function detection(value) {
  if (value == null) return { label: "분석 대기", tone: "pending" };
  return value
    ? { label: "착용 감지", tone: "safe" }
    : { label: "미착용 의심", tone: "danger" };
}

function statusMeta(item) {
  if (!item.submitted) return { label: "제출 필요", tone: "not-submitted", Icon: Clock3 };
  if (item.status === "passed") return { label: "점검 통과", tone: "safe", Icon: CheckCircle2 };
  if (item.status === "retry_required") return { label: "재촬영 필요", tone: "danger", Icon: TriangleAlert };
  if (item.status === "failed") return { label: "분석 실패", tone: "danger", Icon: TriangleAlert };
  return { label: "AI 분석 대기", tone: "pending", Icon: Clock3 };
}

function EquipmentResult({ label, value, manual = false }) {
  const result = manual
    ? { label: value ? "직접 확인 완료" : "미확인", tone: value ? "safe" : "danger" }
    : detection(value);
  return (
    <div className={`ppe-equipment-result ${result.tone}`}>
      <span>{label}</span>
      <b>{result.label}</b>
    </div>
  );
}

function EvidencePhoto({ fileId, authorization, label, alt }) {
  const [photoUrl, setPhotoUrl] = useState("");
  const [status, setStatus] = useState("loading");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setPhotoUrl("");
    setStatus("loading");
    if (!fileId) {
      setStatus("error");
      return undefined;
    }
    apiBlob(`/api/files/${fileId}/download`, { headers: authorization })
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, authorization]);

  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = event => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  return (
    <>
      <div className="ppe-evidence-photo">
        {status === "ready" ? (
          <button type="button" onClick={() => setExpanded(true)} aria-label={`${label} 크게 보기`}>
            <img src={photoUrl} alt={alt} />
            <span><Maximize2 /> 크게 보기</span>
          </button>
        ) : status === "loading" ? (
          <div className="ppe-evidence-photo-state">
            <LoaderCircle className="spin" />
          </div>
        ) : (
          <div className="ppe-evidence-photo-state error">
            <ImageOff />
            <small>불러오기 실패</small>
          </div>
        )}
      </div>
      {expanded && photoUrl && (
        <div
          className="report-photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 원본 보기`}
          onClick={() => setExpanded(false)}
        >
          <button type="button" className="lightbox-close" onClick={() => setExpanded(false)} aria-label="닫기">
            <X />
          </button>
          <img src={photoUrl} alt={alt} onClick={event => event.stopPropagation()} />
          <span>사진 바깥을 클릭하거나 ESC 키를 누르면 닫힙니다.</span>
        </div>
      )}
    </>
  );
}

function PpeChecks({ session, notify }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [storage, setStorage] = useState({ label: "파일 저장소", metadataStore: "보호구 점검 DB" });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const authorization = useMemo(
    () => ({ Authorization: `Bearer ${session.token}` }),
    [session.token],
  );

  const loadChecks = useCallback(async (showMessage = false) => {
    setLoading(true);
    try {
      const result = await apiRequest("/api/admin/ppe-checks", {
        headers: authorization,
      });
      setItems(result.items || []);
      setSummary(result.summary || EMPTY_SUMMARY);
      setStorage(result.storage || { label: "파일 저장소", metadataStore: "보호구 점검 DB" });
      if (showMessage) notify("작업별 보호구 현황을 새로고침했습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }, [authorization, notify]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter(item => {
      const meta = statusMeta(item);
      const filterMatch = filter === "all"
        || (filter === "not-submitted" && !item.submitted)
        || (filter === "attention" && meta.tone === "danger")
        || (filter === "pending" && meta.tone === "pending")
        || (filter === "passed" && item.status === "passed");
      const searchMatch = !keyword || [
        item.workerName,
        item.employeeNo,
        item.permitNo,
        item.workTitle,
        item.workType,
        item.blockCode,
      ].some(value => String(value || "").toLowerCase().includes(keyword));
      return filterMatch && searchMatch;
    });
  }, [filter, items, search]);

  const workGroups = useMemo(() => {
    const grouped = new Map();
    visibleItems.forEach(item => {
      const key = String(item.permitId);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return Array.from(grouped.values());
  }, [visibleItems]);

  const openPhoto = async fileId => {
    try {
      const blob = await apiBlob(`/api/files/${fileId}/download`, {
        headers: authorization,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      notify(error.message);
    }
  };

  const openPermitProgress = permitId => {
    navigate(`/admin/permit-progress?permitId=${permitId}`);
  };

  const metrics = [
    ["점검 대상", summary.required, UsersRound, "배정 작업자"],
    ["제출 완료", summary.submitted, FileCheck2, `${summary.required ? Math.round((summary.submitted / summary.required) * 100) : 0}%`],
    ["점검 통과", summary.passed, UserRoundCheck, "작업 가능"],
    ["조치 필요", summary.attention, TriangleAlert, "재촬영·오류"],
  ];

  return (
    <>
      <SectionHead
        eyebrow="WORK-TO-PPE CONTROL"
        title="작업별 보호구 제출 현황"
        desc="승인된 작업에 배정된 작업자별로 제출 여부, AI 판정, 증빙 보관 상태를 한 흐름에서 확인합니다."
        action={
          <button
            type="button"
            className="outline-btn"
            disabled={loading}
            onClick={() => loadChecks(true)}
          >
            <RefreshCw className={loading ? "spin" : ""} />
            새로고침
          </button>
        }
      />

      <div className="ppe-flow-banner" aria-label="보호구 점검 데이터 흐름">
        {[
          ["작업허가", "승인된 작업"],
          ["작업자 배정", "점검 대상 확정"],
          ["보호구 제출", "사진·확인 기록"],
          ["AI 분석", "착용 여부 판정"],
          ["위험 관리", "미착용 이벤트 연결"],
        ].map(([title, detail], index) => (
          <React.Fragment key={title}>
            <div><b>{title}</b><span>{detail}</span></div>
            {index < 4 && <ChevronRight />}
          </React.Fragment>
        ))}
      </div>

      <div className="ppe-summary-grid">
        {metrics.map(([label, value, Icon, detail]) => (
          <article key={label} className={label === "조치 필요" && value ? "attention" : ""}>
            <Icon />
            <div><span>{label}</span><b>{value}<small>명</small></b></div>
            <em>{detail}</em>
          </article>
        ))}
      </div>

      <div className="ppe-toolbar">
        <label>
          <Search />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="작업명, 허가번호, 작업자 검색"
          />
        </label>
        <div className="ppe-filter-tabs">
          {[
            ["all", "전체"],
            ["not-submitted", "미제출"],
            ["pending", "분석 대기"],
            ["attention", "조치 필요"],
            ["passed", "통과"],
          ].map(([value, label]) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="ppe-monitor-state">
          <LoaderCircle className="spin" />
          작업별 보호구 현황을 불러오는 중입니다.
        </div>
      ) : workGroups.length === 0 ? (
        <div className="ppe-monitor-state">
          <ImageOff />
          {items.length ? "조건에 맞는 작업자 현황이 없습니다." : "승인된 작업에 배정된 작업자가 없습니다."}
        </div>
      ) : (
        <div className="ppe-work-groups">
          {workGroups.map(group => {
            const work = group[0];
            const submitted = group.filter(item => item.submitted).length;
            const passed = group.filter(item => item.status === "passed").length;
            return (
              <section className="ppe-work-group" key={work.permitId}>
                <header className="ppe-work-group-head">
                  <div className="ppe-work-identity">
                    <span><HardHat /></span>
                    <div>
                      <small>{work.permitNo} · {work.siteName || "사업장 미지정"} / {work.blockCode || "구역 미지정"}</small>
                      <h3>{work.workTitle || "작업명 미입력"}</h3>
                      <p>{work.workType || "공종 미입력"} · {formatTime(work.startTime)} 시작</p>
                    </div>
                  </div>
                  <div className="ppe-work-progress">
                    <div><span>제출</span><b>{submitted}/{group.length}</b></div>
                    <div><span>통과</span><b>{passed}/{group.length}</b></div>
                    <button type="button" onClick={() => openPermitProgress(work.permitId)}>
                      허가 전체 흐름 보기 <ChevronRight />
                    </button>
                  </div>
                </header>

                <div className="ppe-monitor-list">
                  {group.map(item => {
                    const meta = statusMeta(item);
                    const StatusIcon = meta.Icon;
                    return (
                      <article
                        className={`ppe-monitor-card ${meta.tone === "danger" || !item.submitted ? "attention" : ""}`}
                        key={`${item.permitId}-${item.userId}`}
                      >
                        <header>
                          <div className="ppe-worker">
                            <span>{String(item.workerName || "작업자").slice(0, 1)}</span>
                            <div>
                              <b>{item.workerName || "작업자"}</b>
                              <small>{item.employeeNo || "사번 미등록"} · 이 작업의 보호구 점검 대상</small>
                            </div>
                          </div>
                          <div className={`ppe-analysis-state ${meta.tone}`}>
                            <StatusIcon />
                            {meta.label}
                          </div>
                        </header>

                        {item.submitted ? (
                          <>
                            <div className="ppe-evidence-body">
                              <EvidencePhoto
                                fileId={item.fileId}
                                authorization={authorization}
                                label={`${item.workerName || "작업자"} 제출 사진`}
                                alt={`${item.workerName || "작업자"}이 제출한 보호구 착용 사진`}
                              />
                              <div className="ppe-equipment-grid">
                                <EquipmentResult label="안전모" value={item.helmetOn} />
                                <EquipmentResult label="하네스" value={item.harnessOn} />
                                <EquipmentResult label="용접면" value={item.weldingMaskOn} />
                                <EquipmentResult label="안전화" value={item.safetyShoesConfirmed} manual />
                                <EquipmentResult label="안전복" value={item.workwearConfirmed} manual />
                              </div>
                            </div>
                            <div className="ppe-evidence-row">
                              <div>
                                <Database />
                                <span><b>{storage.metadataStore} #{item.id}</b><small>작업자·허가서·판정 결과 영구 기록</small></span>
                              </div>
                              <div>
                                <Archive />
                                <span><b>{storage.label} · 파일 #{item.fileId}</b><small>{item.originalName || "보호구 사진"} · {formatFileSize(item.fileSize)} · {formatTime(item.storedAt)} 보관</small></span>
                              </div>
                            </div>
                            <footer>
                              <span>
                                <ShieldAlert />
                                {item.model ? `${item.model} · ` : ""}
                                {item.message || "분석 결과가 등록되었습니다."}
                              </span>
                              <button type="button" onClick={() => openPhoto(item.fileId)}>
                                <ExternalLink /> 제출 사진 보기
                              </button>
                            </footer>
                          </>
                        ) : (
                          <div className="ppe-not-submitted">
                            <Clock3 />
                            <div><b>아직 제출 기록이 없습니다</b><span>작업자 앱에서 이 허가 작업을 선택해 보호구 사진을 제출해야 합니다.</span></div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default PpeChecks;
