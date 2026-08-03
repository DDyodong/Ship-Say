import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  HardHat,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { apiBlob, apiRequest } from "../../api/client";
import { SectionHead } from "../../components/common";

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

function detection(value) {
  if (value == null) return { label: "분석 대기", tone: "pending" };
  return value
    ? { label: "착용 감지", tone: "safe" }
    : { label: "미착용 의심", tone: "danger" };
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

function Monitoring({ session, notify }) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const authorization = { Authorization: `Bearer ${session.token}` };

  const loadChecks = useCallback(async (showMessage = false) => {
    setLoading(true);
    try {
      const result = await apiRequest("/api/admin/ppe-checks", {
        headers: authorization,
      });
      setChecks(result);
      if (showMessage) notify("보호구 제출 현황을 새로고침했습니다.");
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }, [session.token, notify]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

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

  return (
    <>
      <SectionHead
        eyebrow="WORKER PPE REVIEW"
        title="작업자 보호구 제출 현황"
        desc="YOLO는 안전모·하네스·용접면을 탐지하고, 안전화·안전복은 작업자가 직접 확인합니다."
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

      <div className="ppe-scope-banner">
        <HardHat />
        <div>
          <b>YOLO 탐지 대상</b>
          <span>Helmet · Harness · Welding mask</span>
        </div>
        <div>
          <b>작업자 직접 확인</b>
          <span>안전화 · 안전복</span>
        </div>
      </div>

      {loading && checks.length === 0 ? (
        <div className="ppe-monitor-state">
          <LoaderCircle className="spin" />
          보호구 제출 내역을 불러오는 중입니다.
        </div>
      ) : checks.length === 0 ? (
        <div className="ppe-monitor-state">
          <ImageOff />
          아직 제출된 보호구 사진이 없습니다.
        </div>
      ) : (
        <div className="ppe-monitor-list">
          {checks.map(check => {
            const missing = [check.helmetOn, check.harnessOn, check.weldingMaskOn]
              .some(value => value === false);
            const pending = check.status === "pending_analysis";
            const failed = check.status === "failed";
            return (
              <article
                className={`ppe-monitor-card ${missing ? "attention" : ""}`}
                key={check.id}
              >
                <header>
                  <div className="ppe-worker">
                    <span>{String(check.workerName || "작업자").slice(0, 1)}</span>
                    <div>
                      <b>{check.workerName || "작업자"}</b>
                      <small>{check.employeeNo || "-"} · {check.blockCode || "위치 미정"}</small>
                    </div>
                  </div>
                  <div className={`ppe-analysis-state ${missing || failed ? "danger" : pending ? "pending" : "safe"}`}>
                    {missing || failed ? <TriangleAlert /> : pending ? <Clock3 /> : <CheckCircle2 />}
                    {failed ? "분석 실패" : missing ? "미착용 의심" : pending ? "YOLO 분석 대기" : "분석 완료"}
                  </div>
                </header>

                <div className="ppe-work-meta">
                  <span>{check.workTitle || "작업 정보 없음"}</span>
                  <small>{check.permitNo || "허가번호 없음"} · {formatTime(check.checkedAt)}</small>
                </div>

                <div className="ppe-equipment-grid">
                  <EquipmentResult label="안전모 (Helmet)" value={check.helmetOn} />
                  <EquipmentResult label="하네스 (Harness)" value={check.harnessOn} />
                  <EquipmentResult label="용접면 (Welding mask)" value={check.weldingMaskOn} />
                  <EquipmentResult label="안전화" value={check.safetyShoesConfirmed} manual />
                  <EquipmentResult label="안전복" value={check.workwearConfirmed} manual />
                </div>

                <footer>
                  <span>
                    <ShieldAlert />
                    {check.model ? `${check.model} · ` : ""}
                    {check.message || (pending ? "사진 분석을 기다리고 있습니다." : "분석 결과가 등록되었습니다.")}
                  </span>
                  <button type="button" onClick={() => openPhoto(check.fileId)}>
                    <ExternalLink />
                    제출 사진 보기
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export default Monitoring;
