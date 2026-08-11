import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BellRing,
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  FileWarning,
  HardHat,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Square,
  Volume2,
} from "lucide-react";
import { apiRequest } from "../../api/client";
import LegalFooter from "../../components/common/LegalFooter";
import {
  listenForForegroundMessages,
  requestFirebaseNotificationFid,
} from "../../firebase/messaging";
import { maskName } from "../../utils/privacy";
import { ui } from "./i18n";
import { workerExtraUi } from "./workerExtraI18n";

const tabs = [
  ["work", BriefcaseBusiness],
  ["tbm", Volume2],
  ["check", HardHat],
  ["report", Megaphone],
  ["profile", CircleUserRound],
];

const workerTabFromPath = pathname => {
  const candidate = pathname.split("/").filter(Boolean).at(-1);
  return tabs.some(([key]) => key === candidate) ? candidate : "work";
};

const languages = [
  ["ko", "한국어", "ko-KR"],
  ["en", "English", "en-US"],
  ["vi", "Tiếng Việt", "vi-VN"],
  ["zh", "简体中文", "zh-CN"],
  ["ne", "नेपाली", "ne-NP"],
  ["uz", "O‘zbekcha", "uz-UZ"],
  ["si", "සිංහල", "si-LK"],
  ["ta", "தமிழ்", "ta-IN"],
  ["id", "Bahasa Indonesia", "id-ID"],
  ["th", "ไทย", "th-TH"],
  ["fil", "Filipino", "fil-PH"],
  ["my", "မြန်မာ", "my-MM"],
];

const eventTypeCodes = [
  "FALL_HEIGHT",
  "PPE_MISSING",
  "FIRE_EXPLOSION",
  "EQUIPMENT_FAILURE",
  "COLLISION_PINCH",
  "FALLING_OBJECT_LIFTING",
  "ELECTRICAL",
  "ASPHYXIATION_GAS",
  "OTHER",
];

function InfoRow({ label, value }) {
  return (
    <div className="worker-info-row">
      <span>{label}</span>
      <b>{value || "-"}</b>
    </div>
  );
}

function formatTime(value, locale) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function workTime(permit, locale, extraText) {
  if (!permit?.start_time && !permit?.end_time) return extraText.unspecified;
  return `${formatTime(permit.start_time, locale)} ~ ${formatTime(permit.end_time, locale)}`;
}

function WorkerApp({ session, onLogout, notify }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => workerTabFromPath(location.pathname));
  const [language, setLanguage] = useState(
    () => localStorage.getItem("smartyard-language") || "ko",
  );
  const [permit, setPermit] = useState(null);
  const [tbm, setTbm] = useState(null);
  const [ppe, setPpe] = useState(null);
  const [reports, setReports] = useState([]);
  const [todayNotifications, setTodayNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState("");
  const [ppeFile, setPpeFile] = useState(null);
  const [ppePreview, setPpePreview] = useState("");
  const [manualChecks, setManualChecks] = useState([false, false]);
  const [reportFile, setReportFile] = useState(null);
  const [reportPreview, setReportPreview] = useState("");
  const [eventType, setEventType] = useState("FALL_HEIGHT");
  const [description, setDescription] = useState("");
  const [highlightedReportId, setHighlightedReportId] = useState(null);
  const [pushState, setPushState] = useState(
    () => localStorage.getItem("fcm-installation-id") ? "ready" : "idle",
  );
  const contentRef = useRef(null);
  const reportRefs = useRef(new Map());

  const openTab = nextTab => {
    setTab(nextTab);
    navigate(`/worker/${nextTab}`);
  };

  const text = ui[language] || ui.ko;
  const extraText = workerExtraUi[language] || workerExtraUi.en;
  const selectedLanguage = languages.find(item => item[0] === language) || languages[0];
  const locale = selectedLanguage[2];
  const authorization = useMemo(
    () => ({ Authorization: `Bearer ${session.token}` }),
    [session.token],
  );
  const riskLabels = [
    ...text.risks.slice(0, 6),
    extraText.electricalRisk,
    extraText.gasRisk,
    text.risks[6],
  ];
  const reportStatus = {
    received: text.received,
    reviewing: extraText.reviewing,
    action_required: extraText.actionRequired,
    resolved: extraText.resolved,
    rejected: extraText.rejected,
  };
  const loadPermit = async () => {
    const result = await apiRequest("/api/work-permits/today", { headers: authorization });
    setPermit(Object.keys(result).length ? result : null);
    return result;
  };

  const loadTbm = async () => {
    const result = await apiRequest(
      `/api/worker/tbm/today?language=${encodeURIComponent(language)}`,
      { headers: authorization },
    );
    setTbm(Object.keys(result).length ? result : null);
  };

  const loadPpe = async () => {
    const result = await apiRequest("/api/worker/personal-checks/today", {
      headers: authorization,
    });
    setPpe(Object.keys(result).length ? result : null);
  };

  const loadReports = async () => {
    const result = await apiRequest("/api/safety-events/my", { headers: authorization });
    setReports(result);
  };

  const loadTodayNotifications = async () => {
    const result = await apiRequest("/api/notifications/today", { headers: authorization });
    setTodayNotifications(result);
  };

  const refreshAll = async (showMessage = false) => {
    setLoading(true);
    const results = await Promise.allSettled([
      loadPermit(),
      loadTbm(),
      loadPpe(),
      loadReports(),
      loadTodayNotifications(),
    ]);
    const failure = results.find(result => result.status === "rejected");
    if (failure) notify(failure.reason?.message || extraText.loadFailed);
    else if (showMessage) notify(extraText.refreshDone);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    loadTbm().catch(error => notify(error.message || extraText.loadFailed));
  }, [language]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  useEffect(() => {
    setTab(workerTabFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (tab !== "report" || reports.length === 0) return undefined;
    const eventId = new URLSearchParams(location.search).get("eventId");
    if (!eventId) return undefined;

    const reportId = String(eventId);
    const reportElement = reportRefs.current.get(reportId);
    if (!reportElement) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      reportElement.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedReportId(reportId);
    });
    const timeoutId = window.setTimeout(() => setHighlightedReportId(null), 3500);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [location.search, reports, tab]);

  useEffect(() => {
    let unsubscribe;
    let active = true;

    listenForForegroundMessages(payload => {
      const title = payload.notification?.title || payload.data?.title || "Smart Shipyard 안전 알림";
      const body = payload.notification?.body || payload.data?.body || "새로운 안전 알림이 도착했습니다.";
      const targetUrl = payload.data?.url || "/worker/work";
      notify(`${title}: ${body}`);
      loadTodayNotifications().catch(() => {});
      if (Notification.permission === "granted") {
        const notification = new Notification(title, {
          body,
          icon: "/favicon.png",
          data: { url: targetUrl },
        });
        notification.onclick = () => {
          window.focus();
          navigate(targetUrl);
          notification.close();
        };
      }
    }).then(listener => {
      if (active) unsubscribe = listener;
      else listener();
    }).catch(() => {
      // Permission is requested only after the user presses the notification button.
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const enablePushNotifications = async () => {
    setPushState("loading");
    try {
      const fid = await requestFirebaseNotificationFid();
      await apiRequest("/api/notifications/devices", {
        method: "POST",
        headers: authorization,
        body: JSON.stringify({
          fid,
          platform: "web",
          deviceName: navigator.userAgent.slice(0, 160),
        }),
      });
      localStorage.removeItem("fcm-registration-token");
      localStorage.setItem("fcm-installation-id", fid);
      setPushState("ready");

      try {
        await navigator.clipboard.writeText(fid);
        notify("FCM 설치 ID를 복사했습니다.");
      } catch {
        window.prompt("아래 FCM 설치 ID를 복사하세요.", fid);
        notify("FCM 설치 ID가 발급되었습니다.");
      }
    } catch (error) {
      localStorage.removeItem("fcm-registration-token");
      localStorage.removeItem("fcm-installation-id");
      setPushState("idle");
      notify(error.message || "푸시 알림을 활성화하지 못했습니다.");
    }
  };

  useEffect(() => {
    if (ppe?.status !== "pending_analysis") return undefined;
    const timer = window.setInterval(() => {
      loadPpe().catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ppe?.status]);

  useEffect(
    () => () => {
      if (ppePreview) URL.revokeObjectURL(ppePreview);
      if (reportPreview) URL.revokeObjectURL(reportPreview);
    },
    [ppePreview, reportPreview],
  );

  const chooseImage = (file, type) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      notify(extraText.imageTypeError);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify(extraText.imageSizeError);
      return;
    }
    if (type === "ppe") {
      if (ppePreview) URL.revokeObjectURL(ppePreview);
      setPpeFile(file);
      setPpePreview(URL.createObjectURL(file));
    } else {
      if (reportPreview) URL.revokeObjectURL(reportPreview);
      setReportFile(file);
      setReportPreview(URL.createObjectURL(file));
    }
  };

  const uploadFile = async (file, fileType) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileType", fileType);
    return apiRequest("/api/files", {
      method: "POST",
      headers: authorization,
      body: formData,
    });
  };

  const confirmTbm = async () => {
    if (!tbm?.permitId) {
      notify(extraText.noTbmToConfirm);
      return;
    }
    setBusy("tbm");
    try {
      const result = await apiRequest("/api/worker/tbm/confirm", {
        method: "POST",
        headers: authorization,
        body: JSON.stringify({ permitId: tbm.permitId }),
      });
      setTbm(current => ({ ...current, ...result, confirmed: true }));
      notify(text.tbmDone);
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  };

  const toggleSpeech = () => {
    if (!tbm?.content) {
      notify(extraText.noTbmContent);
      return;
    }
    if (!("speechSynthesis" in window)) {
      notify(text.speechUnsupported);
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(tbm.content);
    message.lang = locale;
    message.rate = 0.92;
    message.onend = () => setSpeaking(false);
    message.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(message);
    setSpeaking(true);
  };

  const submitPpe = async () => {
    if (!ppeFile) {
      notify(text.photoRequired);
      return;
    }
    if (!manualChecks.every(Boolean)) {
      notify(text.manualRequired);
      return;
    }
    setBusy("ppe");
    try {
      const uploaded = await uploadFile(ppeFile, "ppe_check");
      const result = await apiRequest("/api/worker/personal-checks", {
        method: "POST",
        headers: authorization,
        body: JSON.stringify({
          permitId: permit?.id || null,
          fileId: uploaded.id,
          safetyShoesConfirmed: manualChecks[0],
          workwearConfirmed: manualChecks[1],
        }),
      });
      setPpe(result);
      setPpeFile(null);
      setPpePreview(current => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      setManualChecks([false, false]);
      notify(extraText.ppeAccepted);
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  };

  const submitReport = async () => {
    if (!reportFile) {
      notify(text.reportPhotoRequired);
      return;
    }
    if (!description.trim()) {
      notify(text.reportDetailRequired);
      return;
    }
    setBusy("report");
    try {
      const uploaded = await uploadFile(reportFile, "safety_report");
      await apiRequest("/api/safety-events", {
        method: "POST",
        headers: authorization,
        body: JSON.stringify({
          eventType,
          fileId: uploaded.id,
          description: description.trim(),
        }),
      });
      if (reportPreview) URL.revokeObjectURL(reportPreview);
      setReportFile(null);
      setReportPreview("");
      setDescription("");
      await loadReports();
      notify(text.reportToast);
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  };

  const acknowledgeNotification = async notification => {
    const notificationId = notification.id;
    setBusy(`notification-${notificationId}`);
    try {
      await apiRequest(`/api/notifications/${notificationId}/acknowledge`, {
        method: "POST",
        headers: authorization,
      });
      setTodayNotifications(current => current.map(item => (
        item.id === notificationId
          ? { ...item, acknowledgedAt: new Date().toISOString() }
          : item
      )));
      const baseTargetUrl = notification.targetUrl || "/worker/work";
      const targetUrl = notification.eventId && baseTargetUrl.startsWith("/worker/report")
        ? `/worker/report?eventId=${encodeURIComponent(notification.eventId)}`
        : baseTargetUrl;
      setTab(workerTabFromPath(targetUrl.split("?")[0]));
      navigate(targetUrl);
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy("");
    }
  };

  const renderTodayNotifications = () => (
    <section className="worker-card worker-today-notifications">
      <div className="worker-notification-heading">
        <span><BellRing />오늘 알림</span>
        <b>{todayNotifications.length}건</b>
      </div>
      {todayNotifications.length === 0 ? (
        <p className="worker-notification-empty">오늘 도착한 안전 알림이 없습니다.</p>
      ) : (
        <div className="worker-notification-list">
          {todayNotifications.map(item => (
            <article key={item.id} className={item.acknowledgedAt ? "acknowledged" : ""}>
              <div className="worker-notification-icon"><BellRing /></div>
              <div className="worker-notification-copy">
                <b>{item.title}</b>
                <p>{item.message}</p>
                <small>{formatTime(item.sentAt || item.createdAt, locale)}</small>
              </div>
              <button
                type="button"
                disabled={Boolean(item.acknowledgedAt) || busy === `notification-${item.id}`}
                onClick={() => acknowledgeNotification(item)}
              >
                {item.acknowledgedAt ? <><Check />확인됨</> : "확인"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  const renderWork = () => {
    if (loading) return <LoadingCard label={extraText.loadingWork} />;
    if (!permit) {
      return (
        <>
          <EmptyState
            icon={BriefcaseBusiness}
            title={extraText.noWorkTitle}
            text={extraText.noWorkText}
          />
          {renderTodayNotifications()}
        </>
      );
    }
    return (
      <>
        <section className="worker-card worker-work-card">
          <span className="worker-success-label">
            <ShieldCheck />
            {extraText.assignedWork}
          </span>
          <h2>{permit.work_title || extraText.untitledWork}</h2>
          <p>
            {permit.permit_no} · {permit.site_name || extraText.unspecifiedSite}
          </p>
          <div className="worker-info-list">
            <InfoRow
              label={text.workTime}
              value={workTime(permit, locale, extraText)}
            />
            <InfoRow
              label={text.workType}
              value={permit.work_type || extraText.unspecified}
            />
            <InfoRow
              label={extraText.workArea}
              value={permit.block_code || extraText.unspecified}
            />
            <InfoRow
              label={text.siteRisk}
              value={permit.is_high_risk ? text.highRisk : extraText.normalRisk}
            />
          </div>
        </section>
        <section className="worker-card">
          <h3 className="worker-cyan">{text.requiredConditions}</h3>
          <p className="worker-condition">
            {permit.recommended_conditions || permit.work_content || extraText.noConditions}
          </p>
        </section>
        {renderTodayNotifications()}
        <div className="worker-section-title">
          <h3>{text.beforeWork}</h3>
          <span>{text.completeInOrder}</span>
        </div>
        <button className="worker-action-card" onClick={() => openTab("tbm")}>
          <i className={tbm?.confirmed ? "complete" : ""}>
            {tbm?.confirmed ? <Check /> : "1"}
          </i>
          <span>
            <b>{text.tbmListen}</b>
            <small>{tbm?.confirmed ? text.confirmed : text.listenAndConfirm}</small>
          </span>
          <ChevronRight />
        </button>
        <button className="worker-action-card" onClick={() => openTab("check")}>
          <i className={ppe ? "complete" : ""}>
            {ppe ? <Check /> : "2"}
          </i>
          <span>
            <b>{text.ppeCheck}</b>
            <small>
              {ppe ? extraText.ppeAccepted : text.photoPpeCheck}
            </small>
          </span>
          <ChevronRight />
        </button>
        <button className="worker-danger-button" onClick={() => openTab("report")}>
          <Megaphone />
          {text.reportHazard}
        </button>
      </>
    );
  };

  const renderTbm = () => {
    if (!tbm) {
      return (
        <EmptyState
          icon={Volume2}
          title={extraText.noTbmTitle}
          text={extraText.noTbmText}
        />
      );
    }
    return (
      <>
        <section className="worker-card worker-tbm-card">
          <span className="worker-eyebrow">TOOL BOX MEETING</span>
          <h2>{tbm.title}</h2>
          <p className="worker-muted">{text.tbmInstruction}</p>
          <p className="worker-briefing-copy">{tbm.content}</p>
          <button
            className={`worker-outline-button ${speaking ? "playing" : ""}`}
            onClick={toggleSpeech}
          >
            {speaking ? <Square /> : <Volume2 />}
            {(speaking ? text.stop : text.listen).replace(/^[▶■]\s*/, "")}
          </button>
        </section>
        <button
          className="worker-primary-button"
          disabled={tbm.confirmed || busy === "tbm"}
          onClick={confirmTbm}
        >
          {busy === "tbm" ? (
            <>
              <LoaderCircle className="spin" />
              {extraText.recording}
            </>
          ) : tbm.confirmed ? (
            <>
              <Check />
              {text.tbmDone}
            </>
          ) : (
            text.reviewed
          )}
        </button>
      </>
    );
  };

  const renderCheck = () => (
    <>
      {ppe && (
        <section className="worker-ppe-status passed">
          <div>
            <ClipboardCheck />
            <span>
              <b>{extraText.ppeAccepted}</b>
            </span>
          </div>
        </section>
      )}
      <section className="worker-card">
        <h3>{text.aiTitle}</h3>
        <p className="worker-muted worker-guide">{text.aiGuide}</p>
      </section>
      <PhotoPicker
        preview={ppePreview}
        onFile={file => chooseImage(file, "ppe")}
        label={text.ppePhoto}
        hint={extraText.fileHint}
        changeLabel={extraText.changePhoto}
      />
      <div className="worker-section-title">
        <h3>{text.manualItems}</h3>
        <span>{text.unsupported}</span>
      </div>
      {text.manualChecks.map((label, index) => (
        <label className="worker-check-row" key={label}>
          <input
            type="checkbox"
            checked={manualChecks[index]}
            onChange={() =>
              setManualChecks(values =>
                values.map((value, itemIndex) =>
                  itemIndex === index ? !value : value,
                ),
              )
            }
          />
          <span>{label}</span>
        </label>
      ))}
      <button
        className="worker-primary-button"
        disabled={busy === "ppe"}
        onClick={submitPpe}
      >
        {busy === "ppe" ? (
          <>
            <LoaderCircle className="spin" />
            {extraText.submitting}
          </>
        ) : (
          text.submitPpe
        )}
      </button>
    </>
  );

  const renderReport = () => (
    <>
      <section className="worker-card">
        <h3>{text.reportTitle}</h3>
        <p className="worker-muted worker-guide">{text.reportGuide}</p>
        <label className="worker-field-label">{text.riskType}</label>
        <select
          className="worker-field"
          value={eventType}
          onChange={event => setEventType(event.target.value)}
        >
          {eventTypeCodes.map((value, index) => (
            <option value={value} key={value}>
              {riskLabels[index]}
            </option>
          ))}
        </select>
      </section>
      <PhotoPicker
        preview={reportPreview}
        onFile={file => chooseImage(file, "report")}
        label={text.hazardPhoto}
        hint={extraText.fileHint}
        changeLabel={extraText.changePhoto}
      />
      <textarea
        className="worker-field worker-textarea"
        value={description}
        maxLength={2000}
        placeholder={text.reportHint}
        onChange={event => setDescription(event.target.value)}
      />
      <button
        className="worker-danger-button"
        disabled={busy === "report"}
        onClick={submitReport}
      >
        {busy === "report" ? (
          <>
            <LoaderCircle className="spin" />
            {extraText.submitting}
          </>
        ) : (
          <>
            <FileWarning />
            {text.submitReport}
          </>
        )}
      </button>
      <div className="worker-section-title">
        <h3>{text.myReports}</h3>
        <span>{text.count(reports.length)}</span>
      </div>
      {reports.length ? (
        reports.map(report => (
          <section
            className={`worker-card worker-report-record${highlightedReportId === String(report.id) ? " highlighted" : ""}`}
            key={report.id}
            ref={element => {
              const reportId = String(report.id);
              if (element) reportRefs.current.set(reportId, element);
              else reportRefs.current.delete(reportId);
            }}
          >
            <div>
              <b>{report.reportNo}</b>
              <span>{reportStatus[report.status] || report.status}</span>
            </div>
            <h3>{report.title}</h3>
            <p>{report.description}</p>
            <small>
              {formatTime(report.eventTime, locale)}
              {report.latestActionComment ? ` · ${report.latestActionComment}` : ""}
            </small>
          </section>
        ))
      ) : (
        <EmptyState
          icon={FileWarning}
          title={text.noReports}
          text={extraText.reportEmptyText}
          compact
        />
      )}
    </>
  );

  const renderProfile = () => (
    <>
      <section className="worker-card worker-profile-card">
        <div className="worker-profile-avatar">
          {session.name?.slice(0, 1) || "W"}
        </div>
        <h2>{maskName(session.name)}</h2>
        <p>
          {session.username} · {text.worker}
        </p>
        <div className="worker-profile-permission-box">
          <span>{text.permissions}</span>
          <b>WORKER</b>
          <small>{text.permissionsValue}</small>
        </div>
      </section>
      <section className="worker-card">
        <h3>{text.appLanguage}</h3>
        <p className="worker-muted worker-guide">{text.appLanguageGuide}</p>
        <select
          className="worker-field worker-language-select"
          value={language}
          onChange={event => {
            const nextLanguage = event.target.value;
            setLanguage(nextLanguage);
            localStorage.setItem("smartyard-language", nextLanguage);
            notify((ui[nextLanguage] || ui.ko).languageToast);
          }}
        >
          {languages.map(([code, name]) => (
            <option value={code} key={code}>
              {name}
            </option>
          ))}
        </select>
      </section>
      <button
        className="worker-outline-button worker-full-button"
        onClick={onLogout}
      >
        <LogOut />
        {text.logout}
      </button>
      <p className="worker-server-caption">{extraText.serverStatus}</p>
    </>
  );

  const activeIndex = Math.max(
    0,
    tabs.findIndex(([key]) => key === tab),
  );

  return (
    <>
      <main className="worker-web-stage">
        <section className="worker-phone-app" aria-label={text.worker}>
        <header className="worker-app-header">
          <div>
            <h1>{text.pages[activeIndex]}</h1>
            <p>
              {maskName(session.name)} · {text.worker}
            </p>
          </div>
          <button
            className={`worker-push-button ${pushState === "ready" ? "active" : ""}`}
            title={pushState === "ready" ? "푸시 알림 활성화됨" : "푸시 알림 켜기"}
            aria-label={pushState === "ready" ? "푸시 알림 활성화됨" : "푸시 알림 켜기"}
            onClick={enablePushNotifications}
            disabled={pushState === "loading"}
          >
            {pushState === "loading" ? <LoaderCircle className="spin" /> : <BellRing />}
          </button>
          <button
            title={extraText.refresh}
            aria-label={extraText.refresh}
            onClick={() => refreshAll(true)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "spin" : ""} />
          </button>
        </header>
        <div className="worker-screen-content" ref={contentRef}>
          {tab === "work" && renderWork()}
          {tab === "tbm" && renderTbm()}
          {tab === "check" && renderCheck()}
          {tab === "report" && renderReport()}
          {tab === "profile" && renderProfile()}
          <div className="worker-scroll-tail" />
        </div>
        <nav className="worker-bottom-nav">
          {tabs.map(([key, Icon], index) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => openTab(key)}
            >
              <Icon />
              <b>{text.nav[index]}</b>
            </button>
          ))}
          </nav>
        </section>
      </main>
      <LegalFooter compact/>
    </>
  );
}

function PhotoPicker({ preview, onFile, label, hint, changeLabel }) {
  return (
    <label className={`worker-photo-preview ${preview ? "has-photo" : ""}`}>
      {preview ? (
        <img src={preview} alt={label} />
      ) : (
        <>
          <ImagePlus />
          <b>{label}</b>
          <span>{hint}</span>
        </>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={event => onFile(event.target.files?.[0])}
      />
      {preview && (
        <span className="worker-photo-change">
          <Camera />
          {changeLabel}
        </span>
      )}
    </label>
  );
}

function LoadingCard({ label }) {
  return (
    <section className="worker-empty-state">
      <LoaderCircle className="spin" />
      <b>{label}</b>
    </section>
  );
}

function EmptyState({ icon: Icon, title, text, compact = false }) {
  return (
    <section className={`worker-empty-state ${compact ? "compact" : ""}`}>
      <Icon />
      <b>{title}</b>
      <p>{text}</p>
    </section>
  );
}

export default WorkerApp;
