import React from "react";
import KakaoYardMap from "../../components/digitalTwin/KakaoYardMap";
import useCameraDetections from "../../hooks/useCameraDetections";
import useSimulatedWorkerTrajectory from "../../hooks/useSimulatedWorkerTrajectory";
import useZoneEntryAlert from "../../hooks/useZoneEntryAlert";
import { yardFacilityDetails } from "../../data/yardFacilities";

const T_BAR_MAP_POSITION = yardFacilityDetails["T-BAR-SHOP"];
const DANGER_ZONES = [
  {
    code: "T-BAR-SHOP",
    name: "T-BAR 자동용접 SHOP",
    x: T_BAR_MAP_POSITION.x * 10 - 45,
    y: T_BAR_MAP_POSITION.y * 5.6 - 32,
    w: 90,
    h: 64,
  },
];

function transformFacilities(facilities) {
  if (!Array.isArray(facilities) || !facilities.length) {
    return [];
  }

  return facilities.map((facility, index) => {
    const detail = yardFacilityDetails[facility.code] || {};

    return {
      code: facility.code,
      name: detail.name || facility.name,
      type: detail.type || facility.type,
      status: facility.status,
      risk: facility.riskLevel,
      progress: Math.round(facility.progressPercent || 0),
      x: detail.x ?? facility.mapX,
      y: detail.y ?? facility.mapY,
      description: detail.description || "등록된 시설 설명이 없습니다.",
      image: detail.image || null,
      features: detail.features || [],
      number: detail.number || index + 1,
    };
  });
}

function TwinContent({
  snapshot,
  onOpenShop,
  onUnavailable,
}) {
  const facilities = transformFacilities(
    snapshot?.facilities,
  );

  const { detection, connected } =
    useCameraDetections();

  const worker088 =
    useSimulatedWorkerTrajectory(DANGER_ZONES);

  const alert =
    useZoneEntryAlert(worker088.prediction);

  const workers = [
    {
      id: "088",
      x: worker088.x,
      y: worker088.y,
      predictedX:
        worker088.prediction?.predictedX,
      predictedY:
        worker088.prediction?.predictedY,
      route: worker088.route,
      danger: false,
      label: "ID:088",
    },
  ];

  const helmetOn = detection
    ? detection.helmet === "on"
    : true;

  const helmetConf = detection
    ? detection.helmet_conf
    : 1.0;

  const harnessOn = detection
    ? detection.harness === "on"
    : false;

  const harnessConf = detection
    ? detection.harness_conf
    : 0.001;

  const weldingLabel = detection
    ? detection.welding === "undetermined"
      ? "판단중"
      : detection.welding === "on"
        ? "감지됨"
        : "감지안됨"
    : "판단중";

  const weldingConf = detection
    ? detection.welding_conf
    : 0.937;

  const workerId = detection?.worker_id
    ? String(detection.worker_id).padStart(3, "0")
    : "088";

  const riskScore = detection
    ? Math.min(
        100,
        Math.round(
          20
          + (harnessOn ? 0 : 45)
          + (helmetOn ? 0 : 25)
          + weldingConf * 10,
        ),
      )
    : 78;

  const durationLabel =
    detection?.harnessOffSince
      ? formatDuration(
          Date.now()
          - detection.harnessOffSince,
        )
      : "1분 40초";

  const alertBanner =
    alert.level !== "none"
    && !alert.acknowledged ? (
      <AlertBanner alert={alert} />
    ) : null;

  const overlayPanel = (
    <LiveStatusPanel
      connected={connected}
      harnessOn={harnessOn}
      helmetOn={helmetOn}
      helmetConf={helmetConf}
      harnessConf={harnessConf}
      weldingLabel={weldingLabel}
      weldingConf={weldingConf}
      workerId={workerId}
      riskScore={riskScore}
      durationLabel={durationLabel}
      onAcknowledge={alert.acknowledge}
    />
  );

  return (
    <>
      <style>{`
        .twin-content {
          border: 1px solid #dce5e9;
          background: linear-gradient(180deg, #f8fafb 0%, #edf2f4 100%);
          box-shadow: 0 18px 48px rgba(49, 68, 77, 0.1);
        }

        .twin-overview-hero {
          border: 1px solid #e1e8eb;
          border-radius: 18px;
          background:
            radial-gradient(circle at 92% 20%, rgba(255, 122, 26, 0.12), transparent 28%),
            linear-gradient(135deg, #ffffff 0%, #fff9f4 100%);
          box-shadow: 0 12px 30px rgba(49, 68, 77, 0.08);
        }

        .twin-ai-badge {
          background: #ff7417;
          color: #ffffff;
        }

        .twin-mode-badge {
          border: 1px solid rgba(26, 148, 108, 0.24);
          background: rgba(29, 181, 132, 0.1);
          color: #16855f;
        }

        .grid-bg {
          background-image:
            linear-gradient(
              rgba(26, 35, 58, 0.4) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(26, 35, 58, 0.4) 1px,
              transparent 1px
            );
          background-size: 32px 32px;
        }

        .glow-cyan {
          box-shadow:
            0 0 0 1px rgba(0, 210, 255, 0.15),
            0 0 18px rgba(0, 210, 255, 0.1);
        }

        .blink {
          animation:
            blink 1.4s steps(2, start) infinite;
        }

        @keyframes blink {
          50% {
            opacity: 0.2;
          }
        }

        .scanline::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          background:
            linear-gradient(
              90deg,
              transparent,
              #00d2ff,
              transparent
            );
          opacity: 0.45;
          animation: scan 4s linear infinite;
        }

        @keyframes scan {
          0% {
            top: 0;
          }

          100% {
            top: 100%;
          }
        }
      `}</style>

      <div className="twin-content p-6 lg:p-8 rounded-xl">
        <section className="twin-overview-hero mb-8 overflow-hidden relative p-6">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <i className="fa-solid fa-microchip text-[120px]" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="twin-ai-badge text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tighter">
                Spatial AI
              </span>

              <span className="twin-mode-badge text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tighter">
                Predictive Mode Active
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              공간형 디지털 트윈 모니터링
            </h1>

            <p className="text-[var(--muted)] text-sm mt-1 max-w-lg">
              CCTV·센서·작업자 정보를 실제 좌표와
              연동하여 위험을 실시간 분석하고 진입
              위험을 예측합니다.
            </p>
          </div>
        </section>

        <div className="mb-8">
          <KakaoYardMap
            {...(
              facilities
                ? { facilities }
                : {}
            )}
            workers={workers}
            onOpenShop={onOpenShop}
            onUnavailable={onUnavailable}
            alertBanner={alertBanner}
            overlayPanel={overlayPanel}
          />
        </div>
      </div>
    </>
  );
}

function AlertBanner({ alert }) {
  const critical =
    alert.level === "critical";

  return (
    <div
      className={`rounded-xl border overflow-hidden shadow-2xl ${
        critical
          ? "bg-ink/90 border-danger/50"
          : "bg-ink/90 border-amber/40"
      }`}
      style={{
        boxShadow: critical
          ? "0 0 30px rgba(255,59,92,.35)"
          : "0 0 30px rgba(255,179,0,.25)",
      }}
    >
      <div className="flex items-stretch">
        <div
          className={`px-4 flex items-center justify-center ${
            critical
              ? "bg-danger"
              : "bg-amber"
          }`}
        >
          <i
            className={`fa-solid fa-triangle-exclamation text-xl ${
              critical
                ? "text-white"
                : "text-ink"
            }`}
          />
        </div>

        <div className="p-3.5 pr-4 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                critical
                  ? "bg-white/20 text-white"
                  : "bg-ink/10 text-ink"
              }`}
            >
              {critical ? "긴급" : "주의"}
            </span>

            <span className="font-bold text-sm text-white truncate">
              작업자 ID:088 위험구역 접근
            </span>
          </div>

          <p className="text-white/75 text-xs leading-tight">
            {alert.prediction?.zoneName}에{" "}
            {alert.etaSec}초 후 진입 예상 ·{" "}
            {Math.round(
              alert.sinceMs / 1000,
            )}초째 지속 중
          </p>

          <button
            type="button"
            onClick={alert.acknowledge}
            className={`mt-2.5 px-3 py-1 rounded text-[11px] font-bold transition-colors ${
              critical
                ? "bg-white text-danger hover:bg-white/90"
                : "bg-ink text-amber hover:bg-ink/80"
            }`}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveStatusPanel({
  connected,
  harnessOn,
  helmetOn,
  helmetConf,
  harnessConf,
  weldingLabel,
  weldingConf,
  workerId,
  riskScore,
  durationLabel,
  onAcknowledge,
}) {
  return (
    <>
      <div className="rounded-2xl border border-cyan/15 bg-ink/60 backdrop-blur-xl shadow-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-cyan/60">
              YARD WORKER TRACKING · CAM-01
            </span>

            <h3 className="text-sm font-bold text-white mt-0.5">
              작업자 안전 상세
            </h3>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[8px] font-mono font-bold shrink-0 ${
              connected
                ? "bg-emerald/10 border-emerald/30 text-emerald"
                : "bg-slate-700/30 border-slate-600 text-slate-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected
                  ? "bg-emerald blink"
                  : "bg-slate-500"
              }`}
            />

            {connected ? "LIVE" : "DEMO"}
          </div>
        </div>
      </div>

      {!harnessOn && (
        <div className="rounded-2xl p-3.5 flex items-start gap-2.5 bg-danger/15 border border-danger/35 backdrop-blur-xl shadow-xl">
          <i className="fa-solid fa-triangle-exclamation text-danger text-sm mt-0.5" />

          <div>
            <p className="text-[11px] font-bold text-danger">
              안전벨트 미착용 감지
            </p>

            <p className="text-[10px] font-mono text-danger/80 mt-0.5">
              ID:{workerId} · {durationLabel} 지속
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-cyan/15 bg-ink/60 backdrop-blur-xl shadow-xl p-3">
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg p-2 text-center bg-danger/5 border border-danger/15">
            <p className="text-[7px] font-mono font-bold uppercase tracking-widest text-danger/60 mb-1">
              위험도
            </p>

            <span
              className={`text-xl font-bold ${
                riskScore >= 70
                  ? "text-danger"
                  : riskScore >= 40
                    ? "text-amber"
                    : "text-emerald"
              }`}
            >
              {riskScore}
            </span>
          </div>

          <div className="rounded-lg p-2 text-center bg-cyan/5 border border-cyan/15">
            <p className="text-[7px] font-mono font-bold uppercase tracking-widest text-cyan/50 mb-1">
              인식 인원
            </p>

            <span className="text-xl font-bold text-cyan">
              1
            </span>
          </div>

          <div className="rounded-lg p-2 text-center bg-cyan/5 border border-cyan/15 flex flex-col items-center justify-center">
            <i className="fa-solid fa-camera text-cyan/70 text-sm" />

            <p className="text-[8px] font-mono font-bold text-cyan/70 mt-1">
              {connected ? "CAM-01" : "DEMO"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan/15 bg-ink/60 backdrop-blur-xl shadow-xl p-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-cyan/50">
            작업자 감지 상세
          </span>

          <span className="text-[8px] font-mono text-slate-500">
            ID:{workerId}
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-11 h-11 rounded-lg bg-edge/60 border border-cyan/10 flex flex-col items-center justify-center shrink-0">
            <i className="fa-solid fa-user-secret text-slate-500 text-sm" />

            <span className="text-[6px] text-slate-600 mt-0.5">
              비식별화
            </span>
          </div>

          <div className="flex-1 space-y-1.5">
            <DetectionRow
              label="헬멧"
              active={helmetOn}
              value={`${helmetOn ? "ON" : "OFF"} (${helmetConf.toFixed(3)})`}
            />

            <DetectionRow
              label="안전벨트"
              active={harnessOn}
              value={`${harnessOn ? "ON" : "OFF"} (${harnessConf.toFixed(3)})`}
            />

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 font-mono">
                용접 여부
              </span>

              <span className="font-mono font-bold text-amber">
                {weldingLabel} (
                {weldingConf.toFixed(3)})
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="w-full mt-3 py-2 rounded-lg bg-cyan/5 border border-cyan/20 text-cyan text-[9px] font-mono font-bold hover:bg-cyan/10 transition-colors flex items-center justify-center gap-1.5"
        >
          데이터 흐름 코드 구조 보기

          <i className="fa-solid fa-arrow-up-right-from-square text-[8px] opacity-60" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onAcknowledge}
          className="py-2.5 rounded-xl bg-danger/15 border border-danger/30 text-danger text-[9px] font-mono font-bold flex items-center justify-center gap-1.5 hover:bg-danger/25 transition-colors backdrop-blur-xl shadow-xl"
        >
          <i className="fa-solid fa-bullhorn text-[8px]" />
          긴급 알림
        </button>

        <button
          type="button"
          className="py-2.5 rounded-xl bg-ink/60 border border-cyan/20 text-cyan text-[9px] font-mono font-bold flex items-center justify-center gap-1.5 hover:bg-cyan/10 transition-colors backdrop-blur-xl shadow-xl"
        >
          <i className="fa-solid fa-crosshairs text-[8px]" />
          작업자 추적
        </button>
      </div>
    </>
  );
}

function DetectionRow({
  label,
  active,
  value,
}) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-slate-500 font-mono">
        {label}
      </span>

      <span
        className={`font-mono font-bold ${
          active
            ? "text-emerald"
            : "text-danger"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatDuration(ms) {
  const totalSec = Math.max(
    0,
    Math.floor(ms / 1000),
  );

  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;

  return min > 0
    ? `${min}분 ${sec}초`
    : `${sec}초`;
}

export default TwinContent;
