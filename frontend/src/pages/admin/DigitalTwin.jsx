import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3,
  Gauge, History, Radio, Thermometer, Zap,
} from "lucide-react";
import { apiRequest } from "../../api/client";
import ShopTwinScene from "../../components/digitalTwin/ShopTwinScene";
import { yardFacilityDetails } from "../../data/yardFacilities";
import TwinContent from "./TwinContent";

const riskLabel = { low: "정상", medium: "주의", high: "위험", critical: "심각" };
const typeLabel = {
  FABRICATION: "가공",
  ASSEMBLY: "조립",
  PAINTING: "도장",
  OUTFITTING: "의장",
  DOCK: "도크",
  QUAY: "안벽",
  WELDING_SHOP: "용접",
  MACHINERY: "기계",
  STORAGE: "적치",
};

const equipmentProfiles = {
  FABRICATION: ["자동 절단 설비", "용접 셀", "치수 검사기"],
  ASSEMBLY: ["블록 정합 장치", "대형 용접 로봇", "크레인 관제기"],
  PAINTING: ["도장 로봇", "환기 제어기", "가스 감지기"],
  OUTFITTING: ["배관 가공기", "전장 검사기", "자재 이송기"],
  DOCK: ["골리앗 크레인", "도크 펌프", "블록 위치 센서"],
  QUAY: ["계류 장력 센서", "안벽 크레인", "전력 공급기"],
  MACHINERY: ["엔진 조립 셀", "토크 검사기", "진동 분석기"],
  STORAGE: ["강재 이송기", "적치 위치 센서", "충돌 방지 장치"],
};

function prepareFacilitySnapshot(data) {
  if (!data?.facility || data.facility.code === "T-BAR-SHOP" || data.robots?.length) return data;
  const detail = yardFacilityDetails[data.facility.code] || {};
  const type = detail.type || data.facility.type;
  const equipment = equipmentProfiles[type] || ["공정 설비 1", "공정 설비 2", "안전 감시 설비"];
  const progress = Math.round(data.facility.progressPercent || 0);
  const risk = data.facility.riskLevel || "low";
  const robots = equipment.map((name, index) => ({
    assetId: -(data.facility.id * 10 + index + 1),
    assetCode: `${data.facility.code}-EQ-${String(index + 1).padStart(2, "0")}`,
    assetName: name,
    modelName: `${typeLabel[type] || type} Digital Equipment`,
    recordedAt: data.generatedAt,
    operatingState: index === 0 ? "TRACKING" : index === 1 ? "PROCESSING" : "INSPECTION",
    servoOn: true,
    jobName: detail.features?.[index] || `${typeLabel[type] || type} 운영`,
    seamNo: `ZONE-${String(index + 1).padStart(2, "0")}`,
    progressPercent: Math.max(0, Math.min(100, progress - index * 7)),
    voltage: 218 + index * 4,
    currentAmp: 86 + progress * 1.4 + index * 18,
    wireFeed: 6.2 + index * 1.1,
    travelSpeed: 1.2 + index * .35,
    torquePercent: 48 + progress * .35 + index * 5,
    temperatureC: 31 + progress * .13 + index * 2,
    gasFlow: 14.5 + index * 1.7,
    axes: { s: 12 + index * 8, l: 24 + index * 5, u: 38 - index * 3, r: 5 + index * 2, b: 16 + index * 4, t: 2 + index },
    scenarioType: data.activeScenario || "NORMAL",
    riskLevel: index === 0 ? risk : "low",
    alarmCode: null,
    anomalyAnalysis: { available: false, anomaly: false },
  }));
  const assets = equipment.map((name, index) => ({
    id: -(data.facility.id * 10 + index + 1),
    code: robots[index].assetCode,
    name,
    type: `${type}_EQUIPMENT`,
    modelName: robots[index].modelName,
    status: "running",
    positionX: index * 4,
    positionY: index * 2,
    positionZ: 0,
  }));
  const features = detail.features?.length ? detail.features : ["공정 운영", "설비 상태 감시", "안전 품질 검사"];
  const process = features.map((name, index) => {
    const threshold = (index + 1) * (100 / features.length);
    return {
      code: `${data.facility.code}-P${index + 1}`,
      name,
      status: progress >= threshold ? "done" : progress >= index * (100 / features.length) ? "active" : "waiting",
      progressPercent: progress >= threshold ? 100 : Math.max(0, Math.round(progress - index * (100 / features.length))),
    };
  });
  return { ...data, assets, robots, process };
}

function metricLabels(type) {
  if (type === "PAINTING") return ["설비 전류", "공급 전압", "분사 부하", "부스 온도", "도장 속도", "환기 유량"];
  if (type === "DOCK" || type === "QUAY") return ["설비 전류", "공급 전압", "인양 부하", "모터 온도", "이동 속도", "유압 유량"];
  if (type === "STORAGE") return ["구동 전류", "공급 전압", "적재 부하", "모터 온도", "이송 속도", "안전 유량"];
  return ["운전 전류", "공급 전압", "설비 부하", "설비 온도", "공정 속도", "유틸리티 유량"];
}

function DigitalTwin({ session, notify }) {
  const [view, setView] = useState({ type: "yard", facilityCode: null });
  const [snapshot, setSnapshot] = useState(null);
  const [selectedRobot, setSelectedRobot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);

  const auth = useMemo(() => ({ Authorization: `Bearer ${session.token}` }), [session.token]);
  const endpoint = view.type === "yard" ? "/api/digital-twin/yard" : `/api/digital-twin/shops/${view.facilityCode}`;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiRequest(endpoint, { headers: auth });
      const nextData = view.type === "shop" ? prepareFacilitySnapshot(data) : data;
      setSnapshot(nextData);
      setError("");
      if (view.type === "shop") setSelectedRobot((current) => nextData.robots.find((robot) => robot.assetCode === current?.assetCode) || nextData.robots[0] || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [auth, endpoint, view.type]);

  useEffect(() => {
    setSnapshot(null);
    setLoading(true);
    refresh();
    const timer = window.setInterval(() => refresh(true), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openShop = (facilityCode) => {
    setSnapshot(null); setLoading(true); setError(""); setHistoryOpen(false);
    setView({ type: "shop", facilityCode });
  };

  const goYard = () => {
    setSnapshot(null); setLoading(true); setError(""); setSelectedRobot(null); setHistoryOpen(false);
    setView({ type: "yard", facilityCode: null });
  };

  const loadHistory = async () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (!next) return;
    try {
      setHistory(await apiRequest(`/api/digital-twin/shops/${view.facilityCode}/history?limit=80`, { headers: auth }));
    } catch (requestError) {
      notify(requestError.message);
    }
  };

  const acknowledge = async (alarmId) => {
    try {
      await apiRequest(`/api/digital-twin/alarms/${alarmId}/acknowledge`, { method: "PATCH", headers: auth });
      notify("알람을 확인 처리했습니다.");
      await refresh(true);
    } catch (requestError) {
      notify(requestError.message);
    }
  };

  if (loading && !snapshot) return <TwinLoading/>;
  if (error && !snapshot) return <TwinError message={error} onRetry={() => refresh()}/>;
  if (!snapshot) return <TwinLoading/>;
  if (view.type === "yard" && !Array.isArray(snapshot.facilities)) return <TwinLoading/>;
  if (view.type === "shop" && (!snapshot.facility || !Array.isArray(snapshot.robots))) return <TwinLoading/>;

  if (view.type === "yard") {
    return <YardView snapshot={snapshot} onOpenShop={openShop}/>;
  }

  return <ShopView snapshot={snapshot} selectedRobot={selectedRobot} onSelectRobot={setSelectedRobot} onBack={goYard}
    historyOpen={historyOpen} loadHistory={loadHistory} history={history} acknowledge={acknowledge}/>;
}

// ── 여기부터 교체된 부분 ──────────────────────────────────────────
// 예전: TwinHeader + twin-stat-grid(4카드) + yard-control-layout(3D맵+시설목록)
// 지금: TwinContent(배너+2D맵+구역상세카드+작업허가서테이블+AI예측피드)
//
// snapshot.facilities는 TwinContent 내부에서 YardTwinMap이 쓰는 좌표 형식으로
// 자동 변환됩니다. workers(작업자 마커)/permits(작업허가서)는 아직 시안 하드코딩
// 값이며, camera01 엔드포인트·작업허가 API 연동은 다음 단계입니다.
function YardView({ snapshot, onOpenShop }) {
  return <div className="digital-twin-page premium-twin">
    <TwinContent snapshot={snapshot} onOpenShop={onOpenShop}/>
  </div>;
}
// ── 교체 끝 ──────────────────────────────────────────────────────

function ShopView({ snapshot, selectedRobot, onSelectRobot, onBack, historyOpen, loadHistory, history, acknowledge }) {
  const detail = yardFacilityDetails[snapshot.facility.code] || {};
  const displayName = detail.name || snapshot.facility.name;
  const displayType = detail.type || snapshot.facility.type;
  const labels = metricLabels(displayType);
  const openAlarms = snapshot.alarms.filter((alarm) => alarm.status === "open");
  const activeStep = snapshot.process.find((step) => step.status === "active");
  const averageProgress = snapshot.robots.length
    ? Math.round(snapshot.robots.reduce((sum, robot) => sum + Number(robot.progressPercent || 0), 0) / snapshot.robots.length) : 0;
  return <div className="digital-twin-page premium-twin">
    <div className="shop-title-row">
      <button className="twin-back" onClick={onBack}><ArrowLeft/>야드 관제로</button>
      <TwinHeader eyebrow={`DIGITAL TWIN · ${typeLabel[displayType] || displayType} OPERATIONS`} title={displayName}
        description={detail.description || "시설 공정과 설비 데이터를 통합하여 생산 상태와 안전 위험을 실시간으로 관제합니다."}
        meta={`${snapshot.dataSource === "SIMULATOR" ? "SIMULATION DATA" : snapshot.dataSource} · ${formatTime(snapshot.generatedAt)}`}/>
    </div>
    <div className="shop-control-grid">
      <section className="twin-panel shop-main-panel premium-panel">
        <div className="twin-panel-head"><div><b>{displayName} 실시간 공정 디지털 트윈</b><span>3D 설비를 선택하면 우측 텔레메트리가 전환됩니다.</span></div><i className="live-dot">OPERATING</i></div>
        <ShopTwinScene snapshot={snapshot} selectedRobot={selectedRobot} onSelectRobot={onSelectRobot}/>
        <ProcessStrip steps={snapshot.process}/>
      </section>
      <aside className="twin-panel telemetry-panel premium-panel">
        <div className="twin-panel-head"><div><b>설비 텔레메트리</b><span>{selectedRobot?.assetCode || "-"} · {selectedRobot?.modelName || "-"}</span></div><span className={`robot-health ${selectedRobot?.riskLevel || "low"}`}>{riskLabel[selectedRobot?.riskLevel] || "정상"}</span></div>
        {selectedRobot && <>
          <div className="robot-summary"><Bot/><div><b>{selectedRobot.assetName}</b><span>{selectedRobot.operatingState} · SERVO {selectedRobot.servoOn ? "ON" : "OFF"}</span></div><strong>{Math.round(selectedRobot.progressPercent)}%</strong></div>
          <div className="metric-grid">
            <Metric icon={Zap} label={labels[0]} value={Number(selectedRobot.currentAmp).toFixed(1)} unit="A" warn={selectedRobot.currentAmp > 320}/>
            <Metric icon={Activity} label={labels[1]} value={Number(selectedRobot.voltage).toFixed(1)} unit="V"/>
            <Metric icon={Gauge} label={labels[2]} value={Number(selectedRobot.torquePercent).toFixed(1)} unit="%" warn={selectedRobot.torquePercent > 85}/>
            <Metric icon={Thermometer} label={labels[3]} value={Number(selectedRobot.temperatureC).toFixed(1)} unit="°C"/>
            <Metric label={labels[4]} value={Number(selectedRobot.wireFeed).toFixed(1)} unit="m/min"/>
            <Metric label={labels[5]} value={Number(selectedRobot.gasFlow).toFixed(1)} unit="L/min" warn={selectedRobot.gasFlow < 10}/>
          </div>
          <div className="axis-grid">{Object.entries(selectedRobot.axes).map(([key, value]) => <span key={key}><small>{key.toUpperCase()} AXIS</small><b>{value}°</b></span>)}</div>
          <div className="job-line"><span>TASK <b>{selectedRobot.jobName}</b></span><span>ZONE <b>{selectedRobot.seamNo}</b></span></div>
        </>}
      </aside>
    </div>

    <div className="shop-bottom-grid operations-grid">
      <section className="twin-panel operation-overview premium-panel">
        <div className="twin-panel-head"><div><b>현재 생산 운영</b><span>관리자가 즉시 판단할 수 있는 핵심 운영 지표입니다.</span></div></div>
        <div className="operation-kpis">
          <article><span>현재 공정</span><b>{activeStep?.name || "공정 대기"}</b><small>{activeStep ? `${activeStep.progressPercent}% 진행` : "작업 지시 대기"}</small></article>
          <article><span>설비 평균 진행률</span><b>{averageProgress}%</b><small>{snapshot.robots.filter((robot) => robot.servoOn).length}/{snapshot.robots.length}대 ONLINE</small></article>
          <article><span>공정 위치</span><b>{Math.round(snapshot.blockPositionPercent || 0)}%</b><small>INBOUND → OUTBOUND</small></article>
          <article><span>데이터 출처</span><b>{snapshot.dataSource === "SIMULATOR" ? "SIMULATION" : snapshot.dataSource}</b><small>게이트웨이 교체 가능 구조</small></article>
        </div>
      </section>
      <section className="twin-panel alarm-panel premium-panel">
        <div className="twin-panel-head"><div><b>{displayName} 실시간 알람</b><span>미확인 {openAlarms.length}건</span></div></div>
        <div className="alarm-list">{snapshot.alarms.length === 0 ? <div className="empty-state"><CheckCircle2/>발생한 알람이 없습니다.</div> : snapshot.alarms.slice(0, 4).map((alarm) => <div className={`alarm-item ${alarm.status}`} key={alarm.id}><AlertTriangle/><div><b>{alarm.title}</b><span>{alarm.assetCode || "SHOP"} · {formatTime(alarm.occurredAt)}</span></div>{alarm.status === "open" ? <button onClick={() => acknowledge(alarm.id)}>확인</button> : <small>확인됨</small>}</div>)}</div>
      </section>
    </div>

    <section className="twin-panel history-panel premium-panel">
      <button className="history-toggle" onClick={loadHistory}><History/><div><b>시간대별 공정·설비 이력</b><span>장애 원인 추적과 운영 재현에 필요한 텔레메트리 기록</span></div><strong>{historyOpen ? "접기" : "펼치기"}</strong></button>
      {historyOpen && <HistoryChart history={history}/>}
    </section>
  </div>;
}

function TwinHeader({ eyebrow, title, description, meta }) {
  return <div className="twin-header"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><div className="twin-live"><i/>LIVE CONNECTED<small>{meta}</small></div></div>;
}

function Metric({ icon: Icon, label, value, unit, warn }) {
  return <div className={warn ? "metric warn" : "metric"}>{Icon && <Icon/>}<span>{label}</span><b>{value}<small>{unit}</small></b></div>;
}

function ProcessStrip({ steps }) {
  return <div className="process-strip">{steps.map((step, index) => <React.Fragment key={step.code}><div className={`process-step ${step.status}`}><span>{step.status === "done" ? <CheckCircle2/> : index + 1}</span><div><b>{step.name}</b><small>{step.status === "active" ? `${step.progressPercent}% 진행` : step.status === "done" ? "완료" : "대기"}</small></div></div>{index < steps.length - 1 && <i/>}</React.Fragment>)}</div>;
}

function HistoryChart({ history }) {
  const points = history.slice(0, 24).reverse();
  if (!points.length) return <div className="empty-state"><Clock3/>SHOP 화면을 유지하면 5초 간격 이력이 저장됩니다.</div>;
  const max = Math.max(...points.map((point) => point.currentAmp), 1);
  return <div className="history-content"><div className="history-bars">{points.map((point, index) => <div key={`${point.assetCode}-${point.recordedAt}-${index}`} title={`${point.assetCode} ${point.currentAmp}A`}><i className={point.riskLevel} style={{ height: `${Math.max(6, point.currentAmp / max * 100)}%` }}/></div>)}</div><div className="history-legend"><span><i className="low"/>정상</span><span><i className="high"/>위험</span><small>최근 전류 이력 · 최대 {max}A</small></div></div>;
}

function TwinLoading() {
  return <div className="twin-state"><Radio/><b>디지털 트윈 데이터를 연결하고 있습니다.</b><span>MySQL과 Spring Boot 상태를 확인합니다.</span></div>;
}

function TwinError({ message, onRetry }) {
  return <div className="twin-state error"><AlertTriangle/><b>디지털 트윈 API에 연결할 수 없습니다.</b><span>{message}</span><button onClick={onRetry}>다시 연결</button></div>;
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default DigitalTwin;
