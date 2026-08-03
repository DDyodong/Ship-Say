import React from "react";
import KakaoYardMap from "../../components/digitalTwin/KakaoYardMap";
import useCameraDetections from "../../hooks/useCameraDetections";
import useSimulatedWorkerTrajectory from "../../hooks/useSimulatedWorkerTrajectory";
import useZoneEntryAlert from "../../hooks/useZoneEntryAlert";

// 위험구역 진입 예측 대상 — YardTwinMap의 T-BAR-SHOP 좌표와 동일하게 맞춰야 함
// (실제 시설 좌표 연동이 끝나면 snapshot.facilities에서 danger:true인 시설을 찾아 대체)
const DANGER_ZONES = [{ code: "T-BAR-SHOP", name: "T-BAR 자동용접 SHOP", x: 40, y: 334, w: 190, h: 138 }];

// 이 컴포넌트는 "본문 콘텐츠"만 담고 있습니다.
// 기존 실제 페이지(거제 스마트 조선소 / 관리자 헤더 + SHIP-SAY 사이드바)는 그대로 두고,
// 그 안에서 예전 metric 카드(가동시설/주의시설/미확인알람/데이터상태) + <YardTwinScene/> 이
// 렌더링되던 자리를 이 컴포넌트로 통째로 교체하면 됩니다.
//
// 사용 예 (기존 페이지 파일 안에서):
//   기존:
//     <div className="metric-cards">...가동시설 15개...주의시설 1개...</div>
//     <YardTwinScene facilities={facilities} onOpenShop={...} onUnavailable={...}/>
//   교체 후:
//     <TwinContent/>

// snapshot.facilities (백엔드 형식: mapX/mapY/mapWidth/mapHeight/riskLevel/progressPercent)를
// YardTwinMap이 쓰는 형식(x/y/w/h/risk/prog)으로 변환합니다.
//
// 실제 mapX/mapY/mapWidth/mapHeight 값이 서로 안 겹치도록 설계되어 있다는 보장이 없어서,
// 이 값들을 그대로 스케일링해서 배치하면 시설끼리 겹칠 수 있습니다.
// 그래서 절대좌표를 신뢰하지 않고, mapY→mapX 순으로 정렬한 뒤 균일한 격자에 순서대로
// 배치합니다. 겹칠 일이 구조적으로 없어지고, 대략적인 공간 순서(위→아래, 왼쪽→오른쪽)는 유지됩니다.
function transformFacilities(facilities) {
  if (!Array.isArray(facilities) || !facilities.length) return null;
  const PAD = 40, GUTTER = 16, VIEW_W = 1000, VIEW_H = 560;
  const COLS = facilities.length <= 12 ? 4 : 5;
  const rows = Math.ceil(facilities.length / COLS);
  const cellW = (VIEW_W - PAD * 2 - GUTTER * (COLS - 1)) / COLS;
  const cellH = (VIEW_H - PAD * 2 - GUTTER * (rows - 1)) / rows;

  const sorted = [...facilities].sort((a, b) => (a.mapY - b.mapY) || (a.mapX - b.mapX));

  return sorted.map((f, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const isCritical = f.riskLevel === "critical";
    return {
      code: f.code, name: f.name, type: f.type,
      risk: f.riskLevel, prog: Math.round(f.progressPercent || 0),
      x: Math.round(PAD + col * (cellW + GUTTER)),
      y: Math.round(PAD + row * (cellH + GUTTER)),
      w: Math.round(cellW), h: Math.round(cellH),
      danger: isCritical,
      tag: isCritical ? "⚠ 위험구역 진입 예측됨" : undefined,
    };
  });
}

function TwinContent({ snapshot, onOpenShop, onUnavailable }) {
  const facilities = transformFacilities(snapshot?.facilities); // null이면 YardTwinMap이 자체 데모 데이터를 씀
  const { detection, connected } = useCameraDetections();
  const worker088 = useSimulatedWorkerTrajectory(DANGER_ZONES);
  const alert = useZoneEntryAlert(worker088.prediction);
  const workers = [
    { id: "088", x: worker088.x, y: worker088.y,
      predictedX: worker088.prediction?.predictedX, predictedY: worker088.prediction?.predictedY,
      danger: false, label: "ID:088" },
    { id: "000", x: 110, y: 440, danger: true, label: "ID:000 ⚠" },
  ];

  // 실제 감지값이 있으면 그걸, 없으면(카메라 엔드포인트 미연동) 데모값으로 표시
  const helmetOn = detection ? detection.helmet === "on" : true;
  const helmetConf = detection ? detection.helmet_conf : 1.0;
  const harnessOn = detection ? detection.harness === "on" : false;
  const harnessConf = detection ? detection.harness_conf : 0.001;
  const weldingLabel = detection
    ? (detection.welding === "undetermined" ? "판단중" : detection.welding === "on" ? "감지됨" : "감지안됨")
    : "판단중";
  const weldingConf = detection ? detection.welding_conf : 0.937;
  const workerId = detection ? detection.worker_id : 0;

  // 위험도 점수: 실제 XGBoost 모델 연동 전까지의 임시 규칙 기반 계산
  const riskScore = detection
    ? Math.min(100, Math.round(20 + (harnessOn ? 0 : 45) + (helmetOn ? 0 : 25) + weldingConf * 10))
    : 78;

  const durationLabel = detection?.harnessOffSince
    ? formatDuration(Date.now() - detection.harnessOffSince)
    : "1분 40초";

  return <>
    <style>{`
      .twin-content { background-image: radial-gradient(circle at 50% 0%, #0c1a33 0%, #050811 55%); }
      .light-theme .twin-content { background-image: radial-gradient(circle at 50% 0%, #ffffff 0%, #f3f6f8 58%); }
      .grid-bg { background-image: linear-gradient(rgba(26,35,58,.4) 1px,transparent 1px), linear-gradient(90deg,rgba(26,35,58,.4) 1px,transparent 1px); background-size: 32px 32px; }
      .glow-cyan { box-shadow: 0 0 0 1px rgba(0,210,255,.15), 0 0 18px rgba(0,210,255,.10); }
      .blink { animation: blink 1.4s steps(2,start) infinite; }
      @keyframes blink { 50% { opacity: .2; } }
      .scanline::after { content:''; position:absolute; left:0; right:0; top:0; height:2px; background:linear-gradient(90deg,transparent,#00d2ff,transparent); opacity:.45; animation:scan 4s linear infinite; }
      @keyframes scan { 0% { top:0; } 100% { top:100%; } }
    `}</style>

    <div className="twin-content p-6 lg:p-8 rounded-xl">

      {/* 배너 — .content의 max-width/패딩을 벗어나 화면 전체 폭으로 확장 */}
      <section className="mb-8 bg-[var(--panel)] overflow-hidden relative p-6">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <i className="fa-solid fa-microchip text-[120px]"/>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan text-ink font-bold uppercase tracking-tighter">Spatial AI</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald/20 text-emerald border border-emerald/30 font-bold uppercase tracking-tighter">Predictive Mode Active</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">공간형 디지털 트윈 모니터링</h1>
          <p className="text-[var(--muted)] text-sm mt-1 max-w-lg">CCTV·센서·작업자 정보를 실제 좌표와 연동하여 위험을 실시간 분석하고 진입 위험을 예측합니다.</p>
        </div>
      </section>

      {/* 지도 — 엣지투엣지. 알림 배너와 상세 패널은 지도 위에 오버레이로 표시 */}
      <div className="mb-8">
        <KakaoYardMap
          {...(facilities ? { facilities } : {})}
          workers={workers}
          onOpenShop={onOpenShop}
          onUnavailable={onUnavailable}
          alertBanner={alert.level !== "none" && !alert.acknowledged && <div className={`rounded-xl border overflow-hidden shadow-2xl ${
            alert.level === "critical" ? "bg-ink/90 border-danger/50" : "bg-ink/90 border-amber/40"}`}
            style={{ boxShadow: alert.level === "critical" ? "0 0 30px rgba(255,59,92,.35)" : "0 0 30px rgba(255,179,0,.25)" }}>
            <div className="flex items-stretch">
              <div className={`px-4 flex items-center justify-center ${alert.level === "critical" ? "bg-danger" : "bg-amber"}`}>
                <i className={`fa-solid fa-triangle-exclamation text-xl ${alert.level === "critical" ? "text-white" : "text-ink"}`}/>
              </div>
              <div className="p-3.5 pr-4 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    alert.level === "critical" ? "bg-white/20 text-white" : "bg-ink/10 text-ink"}`}>
                    {alert.level === "critical" ? "긴급" : "주의"}
                  </span>
                  <span className="font-bold text-sm text-white truncate">작업자 ID:088 위험구역 접근</span>
                </div>
                <p className="text-white/75 text-xs leading-tight">
                  {alert.prediction?.zoneName}에 {alert.etaSec}초 후 진입 예상 · {Math.round(alert.sinceMs / 1000)}초째 지속 중
                </p>
                <button onClick={alert.acknowledge}
                  className={`mt-2.5 px-3 py-1 rounded text-[11px] font-bold transition-colors ${
                    alert.level === "critical" ? "bg-white text-danger hover:bg-white/90" : "bg-ink text-amber hover:bg-ink/80"}`}>
                  확인
                </button>
              </div>
            </div>
          </div>}
          overlayPanel={<>
            <div className="rounded-2xl border border-cyan/15 bg-ink/60 backdrop-blur-xl shadow-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-cyan/60">T-BAR 자동용접 SHOP · CAM-01</span>
                  <h3 className="text-sm font-bold text-white mt-0.5">구역 상세</h3>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[8px] font-mono font-bold shrink-0 ${
                  connected ? "bg-emerald/10 border-emerald/30 text-emerald" : "bg-slate-700/30 border-slate-600 text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald blink" : "bg-slate-500"}`}/> {connected ? "LIVE" : "DEMO"}
                </div>
              </div>
            </div>

            {!harnessOn && <div className="rounded-2xl p-3.5 flex items-start gap-2.5 bg-danger/15 border border-danger/35 backdrop-blur-xl shadow-xl">
              <i className="fa-solid fa-triangle-exclamation text-danger text-sm mt-0.5"/>
              <div>
                <p className="text-[11px] font-bold text-danger">안전벨트 미착용 감지</p>
                <p className="text-[10px] font-mono text-danger/80 mt-0.5">ID:{workerId} · {durationLabel} 지속</p>
              </div>
            </div>}

            <div className="rounded-2xl border border-cyan/15 bg-ink/60 backdrop-blur-xl shadow-xl p-3">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg p-2 text-center bg-danger/5 border border-danger/15">
                  <p className="text-[7px] font-mono font-bold uppercase tracking-widest text-danger/60 mb-1">위험도</p>
                  <span className={`text-xl font-bold ${riskScore >= 70 ? "text-danger" : riskScore >= 40 ? "text-amber" : "text-emerald"}`}>{riskScore}</span>
                </div>
                <div className="rounded-lg p-2 text-center bg-cyan/5 border border-cyan/15">
                  <p className="text-[7px] font-mono font-bold uppercase tracking-widest text-cyan/50 mb-1">인식 인원</p>
                  <span className="text-xl font-bold text-cyan">1</span>
                </div>
                <div className="rounded-lg p-2 text-center bg-cyan/5 border border-cyan/15 flex flex-col items-center justify-center">
                  <i className="fa-solid fa-camera text-cyan/70 text-sm"/>
                  <p className="text-[8px] font-mono font-bold text-cyan/70 mt-1">{connected ? "CAM-01" : "DEMO"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan/15 bg-ink/60 backdrop-blur-xl shadow-xl p-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-cyan/50">작업자 감지 상세</span>
                <span className="text-[8px] font-mono text-slate-500">ID:{workerId}</span>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-11 h-11 rounded-lg bg-edge/60 border border-cyan/10 flex flex-col items-center justify-center shrink-0">
                  <i className="fa-solid fa-user-secret text-slate-500 text-sm"/>
                  <span className="text-[6px] text-slate-600 mt-0.5">비식별화</span>
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]"><span className="text-slate-500 font-mono">헬멧</span><span className={`font-mono font-bold ${helmetOn ? "text-emerald" : "text-danger"}`}>{helmetOn ? "ON" : "OFF"} ({helmetConf.toFixed(3)})</span></div>
                  <div className="flex items-center justify-between text-[10px]"><span className="text-slate-500 font-mono">안전벨트</span><span className={`font-mono font-bold ${harnessOn ? "text-emerald" : "text-danger"}`}>{harnessOn ? "ON" : "OFF"} ({harnessConf.toFixed(3)})</span></div>
                  <div className="flex items-center justify-between text-[10px]"><span className="text-slate-500 font-mono">용접 여부</span><span className="font-mono font-bold text-amber">{weldingLabel} ({weldingConf.toFixed(3)})</span></div>
                </div>
              </div>
              <button className="w-full mt-3 py-2 rounded-lg bg-cyan/5 border border-cyan/20 text-cyan text-[9px] font-mono font-bold hover:bg-cyan/10 transition-colors flex items-center justify-center gap-1.5">
                데이터 흐름 코드 구조 보기 <i className="fa-solid fa-arrow-up-right-from-square text-[8px] opacity-60"/>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={alert.acknowledge}
                className="py-2.5 rounded-xl bg-danger/15 border border-danger/30 text-danger text-[9px] font-mono font-bold flex items-center justify-center gap-1.5 hover:bg-danger/25 transition-colors backdrop-blur-xl shadow-xl">
                <i className="fa-solid fa-bullhorn text-[8px]"/> 긴급 알림
              </button>
              <button className="py-2.5 rounded-xl bg-ink/60 border border-cyan/20 text-cyan text-[9px] font-mono font-bold flex items-center justify-center gap-1.5 hover:bg-cyan/10 transition-colors backdrop-blur-xl shadow-xl">
                <i className="fa-solid fa-crosshairs text-[8px]"/> 작업자 추적
              </button>
            </div>
          </>}
        />
      </div>

    </div>
  </>;
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

export default TwinContent;
