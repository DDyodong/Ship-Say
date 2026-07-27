import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, Database,
  Factory, Gauge, History, Radio, ShieldAlert, Thermometer, Zap,
} from "lucide-react";
import { apiRequest } from "../../api/client";
import ShopTwinScene from "../../components/digitalTwin/ShopTwinScene";
import YardTwinScene from "../../components/digitalTwin/YardTwinScene";

const riskLabel = { low: "정상", medium: "주의", high: "위험", critical: "심각" };

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
      setSnapshot(data);
      setError("");
      if (view.type === "shop") setSelectedRobot((current) => data.robots.find((robot) => robot.assetCode === current?.assetCode) || data.robots[0] || null);
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

  return view.type === "yard"
    ? <YardView snapshot={snapshot} onOpenShop={openShop} onUnavailable={(name) => notify(`${name} 상세 화면은 설비 연동 후 제공됩니다.`)}/>
    : <ShopView snapshot={snapshot} selectedRobot={selectedRobot} onSelectRobot={setSelectedRobot} onBack={goYard}
      historyOpen={historyOpen} loadHistory={loadHistory} history={history} acknowledge={acknowledge}/>;
}

function YardView({ snapshot, onOpenShop, onUnavailable }) {
  return <div className="digital-twin-page premium-twin">
    <TwinHeader eyebrow="DIGITAL TWIN · YARD OPERATIONS" title="조선소 디지털 트윈 관제"
      description="야드 전체의 생산 시설과 도크, 선박, 설비 상태를 하나의 운영 화면에서 확인합니다."
      meta={`${formatTime(snapshot.generatedAt)} 갱신`}/>
    <div className="twin-stat-grid">
      <TwinStat icon={Factory} label="가동 시설" value={`${snapshot.runningFacilities}개`} detail="야드 전체 시설"/>
      <TwinStat icon={ShieldAlert} label="주의 시설" value={`${snapshot.warningFacilities}개`} detail="관리자 확인 필요" tone="orange"/>
      <TwinStat icon={AlertTriangle} label="미확인 알람" value={`${snapshot.openAlarms}건`} detail="SHOP 설비 포함" tone="red"/>
      <TwinStat icon={Radio} label="데이터 상태" value="CONNECTED" detail="1초 주기 갱신" tone="green"/>
    </div>
    <div className="yard-control-layout">
      <section className="twin-panel yard-map-panel premium-panel">
        <div className="twin-panel-head"><div><span>카메라를 회전하고 시설을 선택해 공정 내부로 진입합니다.</span></div><i className="live-dot">LIVE</i></div>
        <YardTwinScene facilities={snapshot.facilities} onOpenShop={onOpenShop} onUnavailable={onUnavailable}/>
      </section>
      <aside className="twin-panel facility-list-panel premium-panel">
        <div className="twin-panel-head"><div><b>시설 운영 현황</b><span>{snapshot.siteName}</span></div></div>
        <div className="facility-list">
          {snapshot.facilities.map((facility) => <button key={facility.code}
            onClick={() => facility.code === "T-BAR-SHOP" ? onOpenShop(facility.code) : onUnavailable(facility.name)}>
            <span className={`risk-indicator ${facility.riskLevel}`}/>
            <div><b>{facility.name}</b><small>{facility.code} · {riskLabel[facility.riskLevel] || facility.riskLevel}</small></div>
            <strong>{facility.progressPercent}%</strong>
          </button>)}
        </div>
        <div className="yard-note"><Database/><div><b>운영 데이터 계층</b><span>현재 T-BAR SHOP은 실시간 시뮬레이션 데이터입니다. 동일 API 규격으로 실제 로봇 게이트웨이를 연결할 수 있습니다.</span></div></div>
      </aside>
    </div>
  </div>;
}

function ShopView({ snapshot, selectedRobot, onSelectRobot, onBack, historyOpen, loadHistory, history, acknowledge }) {
  const openAlarms = snapshot.alarms.filter((alarm) => alarm.status === "open");
  const activeStep = snapshot.process.find((step) => step.status === "active");
  const averageProgress = snapshot.robots.length
    ? Math.round(snapshot.robots.reduce((sum, robot) => sum + Number(robot.progressPercent || 0), 0) / snapshot.robots.length) : 0;
  return <div className="digital-twin-page premium-twin">
    <div className="shop-title-row">
      <button className="twin-back" onClick={onBack}><ArrowLeft/>야드 관제로</button>
      <TwinHeader eyebrow="DIGITAL TWIN · SHOP OPERATIONS" title={snapshot.facility.name}
        description="T-Bar 반입부터 자동 용접, 품질 검사, 반출까지 공정과 설비 데이터를 통합합니다."
        meta={`${snapshot.dataSource === "SIMULATOR" ? "SIMULATION DATA" : snapshot.dataSource} · ${formatTime(snapshot.generatedAt)}`}/>
    </div>
    <div className="shop-control-grid">
      <section className="twin-panel shop-main-panel premium-panel">
        <div className="twin-panel-head"><div><b>실시간 공정 디지털 트윈</b><span>로봇을 선택하면 우측 텔레메트리가 전환됩니다.</span></div><i className="live-dot">OPERATING</i></div>
        <ShopTwinScene snapshot={snapshot} selectedRobot={selectedRobot} onSelectRobot={onSelectRobot}/>
        <ProcessStrip steps={snapshot.process}/>
      </section>
      <aside className="twin-panel telemetry-panel premium-panel">
        <div className="twin-panel-head"><div><b>로봇 텔레메트리</b><span>{selectedRobot?.assetCode || "-"} · {selectedRobot?.modelName || "-"}</span></div><span className={`robot-health ${selectedRobot?.riskLevel || "low"}`}>{riskLabel[selectedRobot?.riskLevel] || "정상"}</span></div>
        {selectedRobot && <>
          <div className="robot-summary"><Bot/><div><b>{selectedRobot.assetName}</b><span>{selectedRobot.operatingState} · SERVO {selectedRobot.servoOn ? "ON" : "OFF"}</span></div><strong>{Math.round(selectedRobot.progressPercent)}%</strong></div>
          <div className="metric-grid">
            <Metric icon={Zap} label="용접 전류" value={selectedRobot.currentAmp} unit="A" warn={selectedRobot.currentAmp > 320}/>
            <Metric icon={Activity} label="전압" value={selectedRobot.voltage} unit="V"/>
            <Metric icon={Gauge} label="축 토크" value={selectedRobot.torquePercent} unit="%" warn={selectedRobot.torquePercent > 85}/>
            <Metric icon={Thermometer} label="온도" value={selectedRobot.temperatureC} unit="°C"/>
            <Metric label="와이어 송급" value={selectedRobot.wireFeed} unit="m/min"/>
            <Metric label="보호가스" value={selectedRobot.gasFlow} unit="L/min" warn={selectedRobot.gasFlow < 10}/>
          </div>
          <div className="axis-grid">{Object.entries(selectedRobot.axes).map(([key, value]) => <span key={key}><small>{key.toUpperCase()} AXIS</small><b>{value}°</b></span>)}</div>
          <div className="job-line"><span>JOB <b>{selectedRobot.jobName}</b></span><span>SEAM <b>{selectedRobot.seamNo}</b></span></div>
        </>}
      </aside>
    </div>

    <div className="shop-bottom-grid operations-grid">
      <section className="twin-panel operation-overview premium-panel">
        <div className="twin-panel-head"><div><b>현재 생산 운영</b><span>관리자가 즉시 판단할 수 있는 핵심 운영 지표입니다.</span></div></div>
        <div className="operation-kpis">
          <article><span>현재 공정</span><b>{activeStep?.name || "공정 대기"}</b><small>{activeStep ? `${activeStep.progressPercent}% 진행` : "작업 지시 대기"}</small></article>
          <article><span>로봇 평균 진행률</span><b>{averageProgress}%</b><small>{snapshot.robots.filter((robot) => robot.servoOn).length}/{snapshot.robots.length}대 SERVO ON</small></article>
          <article><span>블록 위치</span><b>{Math.round(snapshot.blockPositionPercent || 0)}%</b><small>INBOUND → OUTBOUND</small></article>
          <article><span>데이터 출처</span><b>{snapshot.dataSource === "SIMULATOR" ? "SIMULATION" : snapshot.dataSource}</b><small>게이트웨이 교체 가능 구조</small></article>
        </div>
      </section>
      <section className="twin-panel alarm-panel premium-panel">
        <div className="twin-panel-head"><div><b>SHOP 실시간 알람</b><span>미확인 {openAlarms.length}건</span></div></div>
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

function TwinStat({ icon: Icon, label, value, detail, tone = "cyan" }) {
  return <article className={`twin-stat ${tone}`}><Icon/><div><span>{label}</span><b>{value}</b><small>{detail}</small></div></article>;
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
