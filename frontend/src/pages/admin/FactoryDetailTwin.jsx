import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Clock3, Factory,
  FileCheck2, Gauge, HardHat, Link2, Radio, ScanLine, ShieldAlert,
  Thermometer, UserRound, UsersRound, Video, Wrench, Zap,
} from "lucide-react";
import EquipmentTwinScene from "../../components/digitalTwin/EquipmentTwinScene";
import { getFactoryDetail } from "../../data/factoryEquipmentCatalog";
import {
  buildWeldingDemoFrame, robotTimeline, weldingAutoplayScenarioStarts, weldingScenarioStarts,
} from "../../data/weldingProcessDemo";
import { levelFromScore } from "../../utils/workerRiskEngine";

function FactoryDetailTwin({ facilityCode, onBack, notify }) {
  const factory = useMemo(() => getFactoryDetail(facilityCode), [facilityCode]);
  const isWeldingDemo = factory.code === "TAG-4";
  const alarmAsset = factory.equipment.find((asset) => asset.fault);
  const [selectedAsset, setSelectedAsset] = useState(alarmAsset || factory.equipment[0]);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [inventoryTab, setInventoryTab] = useState("equipment");
  const [responseState, setResponseState] = useState({ alert: false, evacuate: false, isolate: false, maintenance: false });
  const [demoPlayback, setDemoPlayback] = useState({ mode: "AUTO", block: 0, scenarioStart: 0, step: 0, produced: 0 });
  const [demoPlaying, setDemoPlaying] = useState(true);

  const demoFrameIndex = demoPlayback.mode === "AUTO"
    ? weldingAutoplayScenarioStarts[demoPlayback.block] + Math.min(demoPlayback.step, 5)
    : demoPlayback.scenarioStart + Math.min(demoPlayback.step, 5);
  const weldingDemo = useMemo(
    () => isWeldingDemo ? buildWeldingDemoFrame(demoFrameIndex, demoPlayback.produced, demoPlayback.step) : null,
    [demoFrameIndex, demoPlayback.produced, demoPlayback.step, isWeldingDemo],
  );
  const liveFactory = useMemo(() => {
    if (!weldingDemo) return factory;
    const equipment = factory.equipment.map((asset) => {
      const base = { ...asset, fault: null, status: "NORMAL" };
      if (asset.kind === "ROBOT") return {
        ...base,
        status: weldingDemo.status,
        operatingState: weldingDemo.isOffline ? "OFFLINE" : weldingDemo.workpieceAtRobot ? "RUNNING" : "STANDBY",
        utilization: Math.round(weldingDemo.operatingLoadScore),
        liveCondition: weldingDemo,
        fault: weldingDemo.isOffline ? {
          part: "로봇 제어 통신",
          symptom: weldingDemo.scenarioLabel,
          cause: weldingDemo.cause,
          severity: "CRITICAL",
        } : null,
        sensors: [
          { label: "축 토크", value: weldingDemo.telemetry.torque_percent, unit: "%", normalRange: "≤ 70", alarm: weldingDemo.scoreParts.torque > 0 },
          { label: "모터 온도", value: weldingDemo.telemetry.temperature_c, unit: "°C", normalRange: "≤ 65", alarm: weldingDemo.scoreParts.thermal > 0 },
          { label: "용접 전류", value: weldingDemo.telemetry.current_amp, unit: "A", normalRange: "226–250", alarm: weldingDemo.scoreParts.current > 0 },
        ],
      };
      if (asset.kind === "CONVEYOR") return {
        ...base,
        operatingState: ["TRANSFER", "RELEASE", "REWORK_RETURN"].includes(weldingDemo.processStage) ? "RUNNING" : "STANDBY",
        liveCondition: weldingDemo,
      };
      if (asset.kind === "INSPECTOR") return {
        ...base,
        status: weldingDemo.workpieceAtInspection && weldingDemo.result !== "PASS" ? "WARNING" : "NORMAL",
        operatingState: weldingDemo.workpieceAtInspection ? "RUNNING" : "STANDBY",
        liveCondition: weldingDemo,
        sensors: [
          { label: "전류 표준편차", value: weldingDemo.quality.current_amp_std, unit: "A", normalRange: "모델 입력", alarm: weldingDemo.quality.current_amp_std > 20 },
          { label: "최저 가스 유량", value: weldingDemo.quality.gas_flow_min, unit: "L/min", normalRange: "≥ 15", alarm: weldingDemo.quality.gas_flow_min < 15 },
          { label: "결함 위험 확률", value: weldingDemo.qualityRiskScore, unit: "%", normalRange: `< ${weldingDemo.quality.threshold * 100}`, alarm: weldingDemo.result !== "PASS" },
        ],
      };
      return base;
    });
    return { ...factory, equipment, openFaults: equipment.filter((asset) => asset.fault).length };
  }, [factory, weldingDemo]);
  const selectedAssetView = liveFactory.equipment.find((asset) => asset.assetCode === selectedAsset?.assetCode) || liveFactory.equipment[0];

  useEffect(() => {
    setSelectedAsset(factory.equipment.find((asset) => asset.fault) || factory.equipment[0]);
    setSelectedWorker(null);
    setInventoryTab("equipment");
    setResponseState({ alert: false, evacuate: false, isolate: false, maintenance: false });
  }, [factory]);

  useEffect(() => {
    if (!isWeldingDemo || !demoPlaying) return undefined;
    const timer = window.setInterval(() => {
      setDemoPlayback((current) => {
        if (current.step < 6) return { ...current, step: current.step + 1 };
        if (current.mode !== "AUTO") return current;
        return {
          ...current,
          block: (current.block + 1) % weldingAutoplayScenarioStarts.length,
          step: 0,
          produced: current.produced + 1,
        };
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [demoPlaying, isWeldingDemo]);

  useEffect(() => {
    if (demoPlayback.mode !== "AUTO" && demoPlayback.step === 6) setDemoPlaying(false);
  }, [demoPlayback.mode, demoPlayback.step]);

  const startAutoplay = () => {
    setDemoPlayback((current) => ({ ...current, mode: "AUTO", block: 0, scenarioStart: 0, step: 0 }));
    setDemoPlaying(true);
  };
  const jumpToScenario = (scenarioStart) => {
    setDemoPlayback((current) => ({
      mode: "MANUAL",
      block: current.block,
      scenarioStart,
      step: 0,
      produced: current.produced + 1,
    }));
    setDemoPlaying(true);
  };
  const toggleDemo = () => {
    if (demoPlaying) setDemoPlaying(false);
    else if (demoPlayback.mode !== "AUTO" && demoPlayback.step === 6) startAutoplay();
    else setDemoPlaying(true);
  };

  const executeResponse = (key, message) => {
    setResponseState((current) => ({ ...current, [key]: true }));
    notify?.(message);
  };

  const chooseAsset = (asset) => { setSelectedAsset(asset); setSelectedWorker(null); };
  const chooseWorker = (worker) => {
    setSelectedWorker(worker);
    setInventoryTab("workers");
    setSelectedAsset(factory.equipment.find((asset) => asset.assetCode === worker.assignedAssetCode) || selectedAsset);
  };

  return <div className="twin-theme-page factory-detail-twin min-h-full bg-[#050b12] px-5 py-5 text-slate-100 md:px-7 md:py-6">
    <header className="twin-theme-hero rounded-3xl border border-cyan-400/15 bg-[radial-gradient(circle_at_85%_10%,rgba(0,210,255,.12),transparent_30%),linear-gradient(135deg,#0b1a27,#071019)] p-6 shadow-2xl">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="flex items-start gap-4"><button onClick={onBack} className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.035] text-slate-300 hover:text-cyan-200"><ArrowLeft size={17}/></button><div><div className="flex items-center gap-2 text-[9px] font-black tracking-[.2em] text-cyan-300"><Factory size={14}/> HANWHA OCEAN · FACILITY SAFETY TWIN</div><h1 className="mt-2 text-2xl font-black text-white">{factory.name}</h1><p className="mt-1 text-xs text-slate-400">{factory.code} · {factory.profileLabel} · 작업자·허가·설비·센서 통합 운영</p><p className="mt-1 text-[10px] text-slate-600">{isWeldingDemo ? "보유 로봇·용접 품질 CSV를 재생하는 합성 데이터 기반 PoC입니다" : "실제 센서·게이트웨이 연동 전, 설비 프로필 템플릿으로 생성한 시연 데이터입니다"}</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><span className="sim-badge">SIMULATION</span><span className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-3 py-2 text-[9px] font-black text-emerald-300"><Radio size={13}/> {isWeldingDemo ? "CSV DATASET LOADED" : "EDGE GATEWAY CONNECTED"}</span><span className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[9px] font-bold text-slate-400">{isWeldingDemo ? `SAMPLE · T+${weldingDemo.telemetry.t_sec.toFixed(0)}s` : "LAST SYNC · 13:42:21"}</span></div>
      </div>
    </header>

    <section className="my-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {isWeldingDemo ? <>
        <Kpi icon={Radio} label="CSV 센서 채널" value={7} unit="CHANNELS"/>
        <Kpi icon={Factory} label="현재 추적 블록" value={weldingDemo.workpieceId} unit="WORKPIECE"/>
        <Kpi icon={Gauge} label="로봇 운전부하" value={weldingDemo.operatingLoadScore} unit="SCORE" danger={weldingDemo.operatingLoadScore >= 60}/>
        <Kpi icon={AlertTriangle} label="용접 품질 위험" value={weldingDemo.qualityRiskScore} unit="%" danger={weldingDemo.qualityRiskScore >= 60}/>
      </> : <>
        <Kpi icon={Factory} label="연동 설비" value={factory.equipment.length} unit="ASSETS"/>
        <Kpi icon={UsersRound} label="현장 작업자" value={factory.workers.length} unit="PEOPLE"/>
        <Kpi icon={ShieldAlert} label="위험 노출 작업자" value={factory.exposedWorkers} unit="ACTION" danger={factory.exposedWorkers > 0}/>
        <Kpi icon={AlertTriangle} label="활성 설비 이상" value={factory.openFaults} unit="CRITICAL" danger={factory.openFaults > 0}/>
      </>}
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <EquipmentTwinScene factory={liveFactory} selectedAsset={selectedAssetView} onSelectAsset={chooseAsset}/>
      <aside className="twin-theme-panel rounded-2xl border border-cyan-400/15 bg-[#08131d] p-4 shadow-xl">
        <p className="text-[9px] font-black tracking-[.16em] text-cyan-300">OPERATION INVENTORY <span className="text-slate-600">(SIMULATION)</span></p>
        <h2 className="mt-2 text-sm font-black text-white">현장 객체 실시간 연계</h2>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-black/20 p-1">
          <Tab active={inventoryTab === "equipment"} onClick={() => setInventoryTab("equipment")} icon={Factory}>설비 {liveFactory.equipment.length}</Tab>
          <Tab active={inventoryTab === "workers"} onClick={() => setInventoryTab("workers")} icon={UsersRound}>작업자 {factory.workers.length}</Tab>
        </div>
        <div className="mt-3 max-h-[500px] space-y-2 overflow-y-auto pr-1">
          {inventoryTab === "equipment" ? liveFactory.equipment.map((asset) => <button key={asset.assetCode} onClick={() => chooseAsset(asset)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${!selectedWorker && selectedAssetView.assetCode === asset.assetCode ? "border-cyan-300/35 bg-cyan-400/[.08]" : "border-white/[.07] bg-white/[.025] hover:bg-white/[.05]"}`}><StatusDot status={asset.status}/><div className="min-w-0 flex-1"><span className="block text-[8px] font-black tracking-wider text-slate-500">{asset.assetCode}</span><b className="mt-0.5 block truncate text-[10px] text-slate-200">{asset.name}</b><small className={`mt-1 block text-[8px] ${asset.fault ? "text-red-300" : "text-slate-600"}`}>{asset.fault ? `${asset.fault.part} · ${asset.fault.symptom}` : `${asset.operatingState} · 운전 부하 ${asset.utilization}%`}</small></div><ChevronRight size={13} className="shrink-0 text-slate-600"/></button>) : factory.workers.map((worker) => <button key={worker.workerId} onClick={() => chooseWorker(worker)} className={`w-full rounded-xl border p-3 text-left transition ${selectedWorker?.workerId === worker.workerId ? "border-amber-300/35 bg-amber-400/[.07]" : worker.riskLevel === "HIGH" ? "border-red-400/20 bg-red-500/[.045]" : "border-white/[.07] bg-white/[.025] hover:bg-white/[.05]"}`}><div className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${worker.riskLevel === "HIGH" ? "bg-red-500/15 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`}><UserRound size={15}/></span><div className="min-w-0 flex-1"><span className="block text-[8px] font-black text-slate-500">{worker.workerId} · {worker.role}</span><b className="mt-0.5 block text-[10px] text-white">{worker.name}</b><small className="mt-1 block truncate text-[8px] text-slate-500">{worker.task}</small></div><RiskBadge level={worker.riskLevel}/></div><div className="mt-2 flex items-center justify-between border-t border-white/[.06] pt-2 text-[8px]"><span className="truncate text-slate-500">{worker.assignedAssetName}</span><span className={worker.permitStatus === "VALID" ? "text-emerald-300" : "text-amber-300"}>{worker.permitStatus === "VALID" ? "허가 유효" : "허가 만료 임박"}</span></div></button>)}
        </div>
      </aside>
    </section>

    {isWeldingDemo ? <WeldingProcessDemoPanel demo={weldingDemo} playing={demoPlaying} autoMode={demoPlayback.mode === "AUTO"} onToggle={toggleDemo} onRestart={startAutoplay} onAuto={startAutoplay} onJump={jumpToScenario}/> : <>
      <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        {selectedWorker ? <><WorkerSafetyPanel worker={selectedWorker} factory={factory} responseState={responseState} notify={notify}/><WorkerPermitPanel worker={selectedWorker}/></> : <><AssetDiagnosis asset={selectedAssetView} notify={notify}/><SensorPanel asset={selectedAssetView}/></>}
      </section>

      <IncidentCommandConsole factory={factory} alarmAsset={alarmAsset} state={responseState} execute={executeResponse}/>
      <EnterpriseOperationsPanel factory={factory} alarmAsset={alarmAsset} notify={notify}/>

      <section className="mt-4 rounded-2xl border border-cyan-400/10 bg-[#08131d] p-5">
      <div className="flex items-center justify-between"><div><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">FACILITY RESPONSE AUDIT</p><h2 className="mt-1 text-sm font-black text-white">이상 감지부터 현장 조치까지</h2></div><span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[8px] font-black text-red-300">미조치 {factory.openFaults}건</span></div>
      <div className="mt-4 grid gap-2 md:grid-cols-4"><MaintenanceStep time="13:42:18" title="센서 이상 감지" body={`${alarmAsset.name} · ${alarmAsset.fault.part}`} done/><MaintenanceStep time="13:42:19" title="작업자 영향 계산" body={`위험 반경 내 ${factory.exposedWorkers}명 자동 식별`} done/><MaintenanceStep time="13:42:20" title="허가·PPE 교차검증" body="작업자 배정 및 보호구 상태 확인" done/><MaintenanceStep time="승인 대기" title="선택 정지·정비 승인" body={alarmAsset.fault.action}/></div>
      </section>
    </>}
  </div>;
}

function WeldingProcessDemoPanel({ demo, playing, autoMode, onToggle, onRestart, onAuto, onJump }) {
  const telemetry = demo.telemetry;
  const quality = demo.quality;
  const stageLabel = {
    WELDING: "로봇 용접",
    TRANSFER: "검사기로 이송",
    INSPECTION: "용접 품질 검사",
    RELEASE: "PASS · 다음 공정 반출",
    RECHECK: "RECHECK · 재검사 유지",
    REWORK_RETURN: "REWORK · 로봇 복귀",
    HOLD: "HOLD · 안전 정지",
  }[demo.processStage];
  const resultTone = demo.result === "PASS" ? "text-emerald-300" : demo.result === "HOLD" ? "text-slate-300" : demo.result === "RECHECK" ? "text-amber-300" : "text-red-300";
  const statusTone = demo.status === "NORMAL" ? "border-emerald-400/20 bg-emerald-400/[.06] text-emerald-300" : demo.status === "WARNING" ? "border-amber-400/25 bg-amber-400/[.07] text-amber-300" : "border-red-400/25 bg-red-500/[.08] text-red-300";
  const timelineProgress = demo.processStep / 6 * 100;
  return <section className="mt-4 space-y-4">
    <article className="rounded-2xl border border-cyan-400/15 bg-[#08131d] p-5 shadow-xl">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">WELDING PROCESS DIGITAL TWIN</p><span className="sim-badge">CSV REPLAY</span></div>
          <h2 className="mt-2 text-base font-black text-white">센서 이상 → 로봇 동작 변화 → 품질 저하 → 재작업 판정</h2>
          <p className="mt-1 text-[9px] text-slate-500">rb_weld_01_timeline.csv · weld_quality_seams.csv · 5초 단위 데이터를 1.4초 간격으로 재생</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRestart} className="h-9 rounded-lg border border-white/10 bg-white/[.035] px-3 text-[9px] font-black text-slate-300 hover:text-white">처음부터</button>
          <button onClick={onToggle} className="h-9 rounded-lg border border-cyan-300/25 bg-cyan-400/[.08] px-4 text-[9px] font-black text-cyan-200">{playing ? "일시정지" : autoMode ? "계속 재생" : "자동 재생으로 복귀"}</button>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="font-mono text-[9px] font-black text-cyan-200">T+{telemetry.t_sec.toFixed(0)}s</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-amber-400 to-red-400 transition-[width] duration-500" style={{ width: `${timelineProgress}%` }}/></div>
        <span className="text-[8px] text-slate-500">CSV ROW {demo.frameIndex + 1}/{robotTimeline.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={onAuto} className={`rounded-full border px-2.5 py-1 text-[8px] font-black transition ${autoMode ? "border-emerald-300/35 bg-emerald-400/[.1] text-emerald-200" : "border-white/[.08] bg-white/[.025] text-slate-500 hover:text-slate-300"}`}>자동 재생 · 70/20/10</button>
        {weldingScenarioStarts.map((index) => {
          const scenario = buildWeldingDemoFrame(index);
          const active = !autoMode && demo.scenario === scenario.scenario;
          return <button key={scenario.scenario} onClick={() => onJump(index)} className={`rounded-full border px-2.5 py-1 text-[8px] font-black transition ${active ? "border-cyan-300/35 bg-cyan-400/[.1] text-cyan-200" : "border-white/[.08] bg-white/[.025] text-slate-500 hover:text-slate-300"}`}>{scenario.scenarioLabel}</button>;
        })}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <ProcessStage index="01" label="현재 블록" value={demo.workpieceId} active/>
        <ProcessStage index="02" label="공정 상태" value={stageLabel} active={demo.processStage === "WELDING"}/>
        <ProcessStage index="03" label="CSV 이상 시나리오" value={demo.scenarioLabel} active={demo.confirmedAnomaly || demo.isOffline} danger={demo.status === "ALARM"}/>
        <ProcessStage index="04" label="최종 판정" value={demo.qualityFinalized ? `${demo.result} · ${demo.routingLabel}` : "검사 대기"} active={demo.qualityFinalized} danger={demo.result === "REWORK"}/>
      </div>
    </article>

    <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
      <article className="rounded-2xl border border-cyan-400/15 bg-[#08131d] p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">ROBOT CONDITION · ASS-04-01</p><h3 className="mt-2 text-sm font-black text-white">CSV 기반 실시간 로봇 상태</h3></div><span className={`rounded-full border px-2.5 py-1 text-[8px] font-black ${statusTone}`}>{demo.status}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          <TelemetryValue label="용접 전압" value={telemetry.voltage.toFixed(1)} unit="V" danger={demo.arcInstability > .55}/>
          <TelemetryValue label="용접 전류" value={telemetry.current_amp.toFixed(1)} unit="A" danger={demo.scoreParts.current > 0}/>
          <TelemetryValue label="축 토크" value={telemetry.torque_percent.toFixed(1)} unit="%" danger={demo.scoreParts.torque > 0}/>
          <TelemetryValue label="모터 온도" value={telemetry.temperature_c.toFixed(1)} unit="°C" danger={demo.scoreParts.thermal > 0}/>
          <TelemetryValue label="가스 유량" value={telemetry.gas_flow.toFixed(1)} unit="L/min" danger={telemetry.gas_flow < 15}/>
          <TelemetryValue label="이송 속도" value={telemetry.travel_speed.toFixed(1)} unit="cm/min" danger={false}/>
        </div>
        <div className="mt-4 rounded-xl border border-white/[.07] bg-black/10 p-4">
          <div className="flex items-center justify-between"><div><p className="text-[8px] font-black text-slate-500">ROBOT OPERATING LOAD SCORE</p><p className="mt-1 text-[8px] text-slate-600">0.40 토크 + 0.25 온도 + 0.25 전류편차 + 0.10 가동상태</p></div><b className={`text-2xl ${demo.operatingLoadScore >= 60 ? "text-red-300" : demo.operatingLoadScore >= 30 ? "text-amber-300" : "text-emerald-300"}`}>{demo.operatingLoadScore}<small className="ml-1 text-[9px]">점</small></b></div>
          <div className="mt-4 space-y-2">
            <FormulaBar label="축 토크 위험도 · 40%" value={demo.scoreParts.torque}/>
            <FormulaBar label="열적 부담 · 25%" value={demo.scoreParts.thermal}/>
            <FormulaBar label="전류 편차 · 25%" value={demo.scoreParts.current}/>
            <FormulaBar label="가동 상태 · 10%" value={demo.scoreParts.duty}/>
          </div>
        </div>
        <div className={`mt-3 rounded-xl border p-4 ${demo.status === "NORMAL" ? "border-emerald-400/15 bg-emerald-400/[.035]" : "border-amber-400/20 bg-amber-400/[.045]"}`}><p className="text-[8px] font-black text-slate-500">DATA-DRIVEN INTERPRETATION</p><p className="mt-2 text-[10px] leading-5 text-slate-200">{demo.cause}</p><p className="mt-1 text-[8px] text-slate-600">CSV 이상 탐지 점수 {telemetry.anomalyScore.toFixed(5)} · 임계값 {telemetry.anomalyThreshold.toFixed(5)} · {telemetry.detectionSource}</p></div>
      </article>

      <article className="rounded-2xl border border-cyan-400/15 bg-[#08131d] p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">WELD QUALITY · SEAM {quality.seam_id}</p><h3 className="mt-2 text-sm font-black text-white">동일 블록 품질 예측 및 판정</h3></div><b className={`text-lg font-black ${resultTone}`}>{demo.qualityFinalized ? demo.result : "PREDICTING"}</b></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <TelemetryValue label="전류 평균" value={quality.current_amp_mean.toFixed(1)} unit="A"/>
          <TelemetryValue label="전류 표준편차" value={quality.current_amp_std.toFixed(1)} unit="A" danger={quality.current_amp_std > 20}/>
          <TelemetryValue label="전압 표준편차" value={quality.voltage_std.toFixed(2)} unit="V" danger={quality.voltage_std > 2}/>
          <TelemetryValue label="최저 가스 유량" value={quality.gas_flow_min.toFixed(1)} unit="L/min" danger={quality.gas_flow_min < 15}/>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <DemoScoreCard label="공정 불안정" value={demo.processInstabilityScore} suffix="점"/>
          <DemoScoreCard label="모델 품질 위험" value={demo.qualityRiskScore} suffix="%" danger={demo.qualityRiskScore >= 60}/>
          <DemoScoreCard label="최종 재작업" value={demo.reworkScore} suffix="점" danger={demo.reworkScore >= 60}/>
        </div>
        <div className="mt-4 rounded-xl border border-white/[.07] bg-black/10 p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[8px] font-black text-slate-500">REWORK SCORE</p><p className="mt-1 text-[8px] text-slate-600">0.30 공정 불안정 + 0.70 CSV 모델 결함확률</p></div><b className={`text-xl ${resultTone}`}>{demo.reworkScore}점</b></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.06]"><div className={`h-full rounded-full transition-[width] duration-500 ${demo.reworkScore >= 60 ? "bg-red-400" : demo.reworkScore >= 30 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${demo.reworkScore}%` }}/></div>
          <div className="mt-2 flex justify-between text-[7px] text-slate-600"><span>PASS 0–29</span><span>RECHECK 30–59</span><span>REWORK 60–100</span></div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[8px]">
          <QualityValidationCard label="CSV 정답 라벨" value={quality.trueLabel} tone={quality.trueLabel === "PASS" ? "good" : "danger"}/>
          <QualityValidationCard label="학습 모델 예측" value={`${quality.modelPrediction} · ${(quality.defectRiskProbability * 100).toFixed(1)}%`} tone={quality.modelPrediction === "PASS" ? "good" : "danger"}/>
          <QualityValidationCard label="모델 판정 검증" value={demo.validationResult} tone={demo.qualityAgreement ? "good" : "warning"}/>
        </div>
        {demo.qualityFinalized && <div className={`mt-3 rounded-xl border p-3 ${demo.qualityAgreement ? "border-emerald-400/20 bg-emerald-400/[.05]" : "border-amber-400/20 bg-amber-400/[.05]"}`}><div className="flex items-center justify-between gap-3"><div><span className="text-[8px] font-black text-slate-500">QUALITY DECISION TRACE</span><p className="mt-1 text-[9px] text-slate-300">정답과 예측 {demo.qualityAgreement ? "일치" : "불일치"} · 운영 조치: {demo.routingLabel}</p></div><b className={demo.qualityAgreement ? "text-[11px] text-emerald-300" : "text-[11px] text-amber-300"}>{demo.qualityAgreement ? "검증 통과" : "오판 확인 필요"}</b></div></div>}
        <p className="mt-3 text-[8px] leading-4 text-slate-600">이 화면의 숫자는 UI용 고정값이 아니라 두 CSV의 현재 행과 모델 출력값을 재생합니다. 실제 센서 연동 전 합성 데이터 PoC입니다.</p>
      </article>
    </div>
  </section>;
}

function ProcessStage({ index, label, value, active, danger }) { return <div className={`rounded-xl border p-3 transition ${danger ? "border-red-400/25 bg-red-500/[.06]" : active ? "border-cyan-300/25 bg-cyan-400/[.055]" : "border-white/[.07] bg-white/[.02]"}`}><span className="text-[8px] font-black text-slate-600">{index} · {label}</span><b className={`mt-2 block text-[10px] ${danger ? "text-red-300" : active ? "text-cyan-200" : "text-slate-400"}`}>{value}</b></div>; }
function TelemetryValue({ label, value, unit, danger }) { return <div className={`rounded-xl border p-3 ${danger ? "border-red-400/20 bg-red-500/[.055]" : "border-white/[.07] bg-white/[.025]"}`}><span className="block text-[8px] text-slate-500">{label}</span><b className={`mt-1 block text-sm ${danger ? "text-red-200" : "text-slate-100"}`}>{value}<small className="ml-1 text-[8px] text-slate-600">{unit}</small></b></div>; }
function FormulaBar({ label, value }) { return <div className="grid grid-cols-[120px_minmax(0,1fr)_30px] items-center gap-2"><span className="text-[8px] text-slate-500">{label}</span><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className={`h-full rounded-full transition-[width] duration-500 ${value >= 60 ? "bg-red-400" : value >= 30 ? "bg-amber-400" : "bg-cyan-400"}`} style={{ width: `${value}%` }}/></div><b className="text-right text-[8px] text-slate-300">{value}</b></div>; }
function DemoScoreCard({ label, value, suffix, danger }) { return <div className={`rounded-xl border p-3 text-center ${danger ? "border-red-400/20 bg-red-500/[.055]" : "border-white/[.07] bg-white/[.025]"}`}><span className="block text-[7px] text-slate-600">{label}</span><b className={`mt-1 block text-lg ${danger ? "text-red-300" : "text-cyan-200"}`}>{value}<small className="ml-0.5 text-[8px]">{suffix}</small></b></div>; }
function QualityValidationCard({ label, value, tone }) { const style = tone === "good" ? "border-emerald-400/20 bg-emerald-400/[.05] text-emerald-300" : tone === "danger" ? "border-red-400/20 bg-red-500/[.055] text-red-300" : "border-amber-400/20 bg-amber-400/[.055] text-amber-300"; return <div className={`rounded-lg border p-3 ${style}`}><span className="block text-[7px] text-slate-500">{label}</span><b className="mt-1 block text-[9px]">{value}</b></div>; }

function WorkerSafetyPanel({ worker, factory, responseState, notify }) {
  const assignedAsset = factory.equipment.find((asset) => asset.assetCode === worker.assignedAssetCode);
  const distanceReduction = responseState.evacuate ? worker.riskAnalysis.factors.find((factor) => factor.key === "distance").score : 0;
  const isolationReduction = responseState.isolate ? worker.riskAnalysis.factors.filter((factor) => factor.key === "equipment" || factor.key === "assignment").reduce((sum, factor) => sum + factor.score, 0) : 0;
  const liveRiskScore = Math.max(0, worker.riskScore - distanceReduction - isolationReduction);
  const liveRiskLevel = levelFromScore(liveRiskScore);
  return <article className={`rounded-2xl border p-5 ${worker.riskLevel === "HIGH" ? "border-red-400/25 bg-red-500/[.045]" : "border-emerald-400/15 bg-[#08131d]"}`}>
    <div className="flex items-start justify-between"><div><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">WORKER–ASSET SAFETY GRAPH</p><h2 className="mt-2 text-base font-black text-white">{worker.name} <small className="ml-1 text-[9px] font-medium text-slate-500">{worker.workerId}</small></h2><p className="mt-1 text-[9px] text-slate-500">{worker.shift} · {worker.task}</p></div><RiskBadge level={liveRiskLevel}/></div>
    <div className="mt-4 grid grid-cols-2 gap-2"><Info label="현재 AI 위험점수" value={`${liveRiskScore} / 100${liveRiskScore !== worker.riskScore ? ` (초기 ${worker.riskScore})` : ""}`} danger={liveRiskScore >= 60}/><Info label="이상 부품과 거리" value={responseState.evacuate ? "안전구역 도착" : `${worker.distanceToFault}m`} danger={!responseState.evacuate && worker.riskLevel === "HIGH"}/><Info label="배정 설비" value={worker.assignedAssetName}/><Info label="설비 격리 상태" value={responseState.isolate ? "LOTO 격리 완료" : "운전 중"} danger={!responseState.isolate && Boolean(assignedAsset?.fault)}/></div>
    <RiskAnalysisPanel analysis={worker.riskAnalysis}/>
    <div className="mt-3 rounded-xl border border-white/[.07] bg-black/10 p-4"><p className="text-[9px] font-black text-slate-500">PPE LIVE CHECK</p><div className="mt-3 grid grid-cols-3 gap-2"><Ppe label="안전모" ok={worker.ppe.helmet}/><Ppe label="안전대" ok={worker.ppe.harness}/><Ppe label="안전조끼" ok={worker.ppe.vest}/></div></div>
    <div className="mt-3 grid gap-2 md:grid-cols-2"><div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3"><div className="flex items-center gap-2"><Video size={13} className="text-cyan-300"/><b className="text-[9px] text-slate-300">{worker.cameraId}</b></div><p className="mt-1 text-[8px] text-slate-600">CCTV 재식별 · 최근 포착 {worker.lastSeenAt}</p></div><div className={`rounded-xl border p-3 ${worker.qualificationValid ? "border-emerald-400/15 bg-emerald-400/[.04]" : "border-red-400/20 bg-red-500/[.05]"}`}><b className={`text-[9px] ${worker.qualificationValid ? "text-emerald-300" : "text-red-300"}`}>{worker.qualificationValid ? "작업 자격 유효" : "작업 자격 재확인 필요"}</b><p className="mt-1 text-[8px] text-slate-600">{worker.qualification}</p></div></div>
    <div className={`mt-3 rounded-xl border p-4 ${worker.riskLevel === "HIGH" ? "border-red-400/20 bg-red-500/[.06]" : "border-emerald-400/15 bg-emerald-400/[.04]"}`}><p className="text-[9px] font-black text-slate-500">AI EXPOSURE REASON</p><p className="mt-2 text-[11px] leading-5 text-slate-200">{worker.riskReason}</p><p className="mt-2 border-t border-white/[.06] pt-2 text-[9px] font-black text-cyan-200">권고 · {worker.recommendedAction}</p></div>
    <button onClick={() => notify?.(`${worker.name} 작업자에게 작업 중지 및 안전구역 대피 요청을 전송했습니다.`)} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-[10px] font-black text-white hover:bg-red-400"><ShieldAlert size={14}/> 작업 중지 및 대피 요청</button>
  </article>;
}

function WorkerPermitPanel({ worker }) { return <article className="rounded-2xl border border-cyan-400/10 bg-[#08131d] p-5"><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">PERMIT TO WORK LINK</p><h2 className="mt-2 text-sm font-black text-white">작업허가서 실시간 검증</h2><div className="mt-4 rounded-xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-cyan-200">{worker.permitId}</span><span className={`rounded-full px-2 py-1 text-[8px] font-black ${worker.permitStatus === "VALID" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{worker.permitStatus}</span></div><div className="mt-4 space-y-3"><Row label="허가 유형" value={worker.permitType}/><Row label="작업 위치" value={worker.assignedAssetName}/><Row label="승인 작업" value={worker.task}/><Row label="유효 시간" value={`오늘 ${worker.permitExpiresAt}까지`}/></div></div><div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[.04] p-4"><div className="flex gap-3"><FileCheck2 size={17} className="shrink-0 text-emerald-300"/><div><b className="text-[10px] text-emerald-200">작업·위치·담당 설비 일치</b><p className="mt-1 text-[9px] leading-4 text-slate-500">현장 위치가 허가 범위를 벗어나거나 허가가 만료되면 관리자와 작업자 앱에 즉시 차단 알림을 보냅니다.</p></div></div></div><div className="mt-4 flex items-center gap-2 text-[8px] text-slate-600"><Link2 size={12} className="text-cyan-300"/> 작업허가서 · 작업자 위치 · 설비 태그 연결</div></article>; }

function IncidentCommandConsole({ factory, alarmAsset, state, execute }) {
  const steps = [
    { key: "alert", title: "현장 경보 전송", body: `${factory.exposedWorkers}명 작업자 앱·방송 연동`, action: "경보 전송" },
    { key: "evacuate", title: "대피 완료 확인", body: `${factory.safetyState.musterPoint} · 예상 42초`, action: "대피 확인" },
    { key: "isolate", title: "설비 선택 격리", body: `${alarmAsset.assetCode} LOTO 적용`, action: "격리 승인" },
    { key: "maintenance", title: "정비 작업 발행", body: `${alarmAsset.fault.part} 점검 작업지시`, action: "작업 발행" },
  ];
  const complete = Object.values(state).filter(Boolean).length;
  return <section className="mt-4 rounded-2xl border border-red-400/20 bg-[linear-gradient(120deg,rgba(239,68,68,.07),#08131d_38%)] p-5"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><Activity size={15} className="text-red-300"/><p className="text-[9px] font-black tracking-[.16em] text-red-300">INCIDENT COMMAND CONSOLE · {factory.safetyState.incidentId}</p></div><h2 className="mt-2 text-base font-black text-white">AI 권고를 현장 실행 명령으로 전환</h2></div><div className="flex items-center gap-3"><span className="text-[9px] font-black text-slate-500">조치 {complete}/4</span><div className="h-2 w-28 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width:`${complete * 25}%`}}/></div></div></div><div className="mt-4 grid gap-2 md:grid-cols-4">{steps.map((step, index) => <div key={step.key} className={`rounded-xl border p-4 ${state[step.key] ? "border-emerald-400/20 bg-emerald-400/[.05]" : "border-white/[.07] bg-black/10"}`}><div className="flex items-center justify-between"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/[.05] text-[9px] font-black text-slate-400">0{index + 1}</span>{state[step.key] && <CheckCircle2 size={15} className="text-emerald-300"/>}</div><b className="mt-3 block text-[10px] text-slate-200">{step.title}</b><p className="mt-1 min-h-8 text-[8px] leading-4 text-slate-600">{step.body}</p><button disabled={state[step.key]} onClick={() => execute(step.key, `${step.title} 처리가 완료되었습니다.`)} className={`mt-3 h-8 w-full rounded-lg text-[8px] font-black ${state[step.key] ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[.06] text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-200"}`}>{state[step.key] ? "완료 · 증적 저장" : step.action}</button></div>)}</div></section>;
}

function EnterpriseOperationsPanel({ factory, alarmAsset, notify }) { return <section className="mt-4 rounded-2xl border border-cyan-400/15 bg-[linear-gradient(120deg,#0a1722,#071018)] p-5"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">ENTERPRISE DECISION SUPPORT</p><h2 className="mt-1 text-base font-black text-white">전면 중단 대신, 영향 범위만 정확히 통제</h2><p className="mt-1 text-[10px] text-slate-500">설비 상태만 보는 화면이 아니라 누가·어떤 허가로·어느 고장 설비 주변에서 일하는지 계산해 현장 결정을 지원합니다.</p></div><button onClick={() => notify?.(`${alarmAsset.assetCode} 선택 정지안이 승인 대기열에 등록되었습니다.`)} className="h-10 rounded-xl border border-cyan-300/25 bg-cyan-400/[.08] px-4 text-[10px] font-black text-cyan-200 hover:bg-cyan-400/[.14]">선택 정지안 검토 요청</button></div><div className="mt-5 grid gap-3 md:grid-cols-4"><ValueCard icon={UsersRound} label="즉시 보호 대상" value={`${factory.exposedWorkers}명`} body="고장 반경 내 작업자 자동 식별" danger/><ValueCard icon={Factory} label="선택 정지 범위" value={`1 / ${factory.equipment.length}`} body="정상 설비는 생산 지속"/><ValueCard icon={Clock3} label="예상 비가동 방지" value="3.6h" body="운영 모델 기준 추정값"/><ValueCard icon={FileCheck2} label="감사 증적" value="4종" body="CCTV·허가·센서·조치 이력"/></div></section>; }

function RiskAnalysisPanel({ analysis }) {
  if (!analysis) return null;
  const controlCards = [
    ["PPE 보완", analysis.controls.ppeRestored],
    ["안전구역 이동", analysis.controls.movedToSafeZone],
    ["설비 격리", analysis.controls.equipmentIsolated],
    ["권고 조치 전체", analysis.controls.allRecommended],
  ];
  return <div className="mt-3 rounded-xl border border-cyan-400/15 bg-[#06121b] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] font-black tracking-[.14em] text-cyan-300">EXPLAINABLE RISK ENGINE</p><p className="mt-1 text-[8px] text-slate-600">정책 {analysis.policyVersion} · 증적 완전성 {analysis.evidenceConfidence}%</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] text-slate-400">0–29 정상 · 30–59 주의 · 60–79 위험 · 80+ 긴급</span></div><div className="mt-4 space-y-2">{analysis.factors.map((factor) => <div key={factor.key} className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-2"><div><b className="block text-[8px] text-slate-400">{factor.label}</b><small className="block truncate text-[7px] text-slate-700">{factor.evidence}</small></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className={`h-full rounded-full ${factor.score ? "bg-gradient-to-r from-amber-400 to-red-500" : "bg-emerald-400/50"}`} style={{width:`${Math.max(factor.score ? 8 : 2, factor.score / factor.max * 100)}%`}}/></div><b className={factor.score ? "text-[9px] text-red-300" : "text-[9px] text-emerald-300"}>+{factor.score}</b></div>)}</div><div className="mt-4 border-t border-white/[.07] pt-3"><p className="text-[8px] font-black text-slate-500">조치 후 예상 위험도 · COUNTERFACTUAL</p><div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">{controlCards.map(([label, score]) => <div key={label} className="rounded-lg bg-white/[.025] p-2"><span className="block text-[7px] text-slate-600">{label}</span><b className={`mt-1 block text-[11px] ${score >= 60 ? "text-red-300" : score >= 30 ? "text-amber-300" : "text-emerald-300"}`}>{score}점</b></div>)}</div></div></div>;
}

function AssetDiagnosis({ asset, notify }) { const fault = asset.fault; return <article className={`rounded-2xl border p-5 ${fault ? "border-red-400/25 bg-red-500/[.045]" : "border-emerald-400/15 bg-[#08131d]"}`}><div className="flex items-start justify-between"><div><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">SELECTED ASSET DIAGNOSIS</p><h2 className="mt-2 text-base font-black text-white">{asset.name}</h2><p className="mt-1 text-[9px] font-mono text-slate-500">{asset.assetCode} · {asset.kind}</p></div><StatusBadge status={asset.status}/></div>{fault ? <div className="mt-4"><div className="grid grid-cols-2 gap-2"><Info label="이상 부품" value={fault.part} danger/><Info label="감지 증상" value={fault.symptom} danger/><Info label="AI 진단 신뢰도" value={`${fault.confidence}%`}/><Info label="최초 감지" value={fault.detectedAt}/></div><div className="mt-3 rounded-xl border border-white/[.07] bg-black/10 p-4"><p className="text-[9px] font-black text-slate-500">AI ROOT CAUSE ANALYSIS</p><p className="mt-2 text-[11px] leading-5 text-slate-200">{fault.cause}</p></div><div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[.045] p-4"><p className="text-[9px] font-black text-cyan-300">RECOMMENDED MAINTENANCE</p><p className="mt-2 text-[11px] leading-5 text-cyan-50">{fault.action}</p></div><button onClick={() => notify?.(`${asset.assetCode} 정비 작업 요청을 등록했습니다.`)} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-[10px] font-black text-white"><Wrench size={14}/> 정비 작업 요청</button></div> : <div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[.05] p-6 text-center"><CheckCircle2 size={25} className="mx-auto text-emerald-300"/><p className="mt-3 text-xs font-black text-emerald-200">설비 정상 운전</p><p className="mt-1 text-[10px] text-slate-500">부품과 센서값이 정상 범위에 있습니다.</p></div>}</article>; }

function SensorPanel({ asset }) { return <article className="rounded-2xl border border-cyan-400/10 bg-[#08131d] p-5"><div className="flex items-center gap-2"><p className="text-[9px] font-black tracking-[.16em] text-cyan-300">TELEMETRY</p><span className="sim-badge">SIMULATION</span></div><h2 className="mt-2 text-sm font-black text-white">부품 센서 데이터</h2><div className="mt-4 space-y-3">{asset.sensors.map((sensor, index) => { const Icon = index === 0 ? Zap : index === 1 ? Thermometer : Gauge; return <div key={sensor.label} className={`rounded-xl border p-3 ${sensor.alarm ? "border-red-400/20 bg-red-500/[.055]" : "border-white/[.07] bg-white/[.025]"}`}><div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-lg ${sensor.alarm ? "bg-red-500/15 text-red-300" : "bg-cyan-400/10 text-cyan-300"}`}><Icon size={14}/></span><div className="flex-1"><span className="block text-[10px] font-medium text-slate-500">{sensor.label}</span><b className={sensor.alarm ? "text-red-200" : "text-slate-200"}>{sensor.value}<small className="ml-1 text-[9px] text-slate-600">{sensor.unit}</small></b></div><span className="text-[9px] font-medium text-slate-600">정상 {sensor.normalRange}</span></div></div>; })}</div><div className="mt-4 flex items-center gap-2 text-[9px] text-slate-600"><ScanLine size={12} className="text-cyan-300"/> 설비 프로필 기반 생성값 · 실제 센서 미연동</div></article>; }

function Tab({ active, onClick, icon: Icon, children }) { return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-[9px] font-black ${active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-600"}`}><Icon size={12}/>{children}</button>; }
function Kpi({ icon: Icon, label, value, unit, danger }) { return <article className={`rounded-2xl border p-4 ${danger ? "border-red-400/25 bg-red-500/[.055]" : "border-cyan-400/10 bg-[#0a1621]"}`}><div className="flex items-center justify-between text-[9px] font-bold text-slate-500"><span>{label}</span><Icon size={15} className={danger ? "text-red-300" : "text-cyan-300"}/></div><div className="mt-3 flex items-end gap-2"><b className={`text-2xl font-black ${danger ? "text-red-200" : "text-white"}`}>{value}</b><small className="mb-1 text-[8px] font-black text-slate-600">{unit}</small></div></article>; }
function ValueCard({ icon: Icon, label, value, body, danger }) { return <div className={`rounded-xl border p-4 ${danger ? "border-red-400/20 bg-red-500/[.05]" : "border-white/[.07] bg-white/[.025]"}`}><div className="flex items-center justify-between"><span className="text-[8px] font-black text-slate-500">{label}</span><Icon size={14} className={danger ? "text-red-300" : "text-cyan-300"}/></div><b className={`mt-2 block text-xl ${danger ? "text-red-200" : "text-white"}`}>{value}</b><p className="mt-1 text-[8px] text-slate-600">{body}</p></div>; }
function Ppe({ label, ok }) { return <div className={`rounded-lg border p-2 text-center ${ok ? "border-emerald-400/15 bg-emerald-400/[.04]" : "border-red-400/25 bg-red-500/[.07]"}`}><HardHat size={14} className={`mx-auto ${ok ? "text-emerald-300" : "text-red-300"}`}/><b className="mt-1 block text-[8px] text-slate-300">{label}</b><small className={`text-[8px] ${ok ? "text-emerald-300" : "text-red-300"}`}>{ok ? "착용" : "미착용"}</small></div>; }
function Row({ label, value }) { return <div className="flex justify-between gap-4 text-[9px]"><span className="text-slate-600">{label}</span><b className="text-right text-slate-300">{value}</b></div>; }
function RiskBadge({ level }) { return <span className={`rounded-full px-2 py-1 text-[8px] font-black ${level === "CRITICAL" ? "bg-red-500 text-white" : level === "HIGH" ? "bg-red-500/15 text-red-300" : level === "MEDIUM" ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/10 text-emerald-300"}`}>{level}</span>; }
function StatusDot({ status }) { return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status === "ALARM" ? "bg-red-500 shadow-[0_0_10px_#ef4444]" : status === "WARNING" ? "bg-amber-400" : "bg-emerald-400"}`}/>; }
function StatusBadge({ status }) { return <span className={`rounded-full px-2.5 py-1 text-[8px] font-black ${status === "ALARM" ? "bg-red-500/15 text-red-300" : status === "WARNING" ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"}`}>{status}</span>; }
function Info({ label, value, danger }) { return <div className={`rounded-xl border p-3 ${danger ? "border-red-400/20 bg-red-500/[.055]" : "border-white/[.07] bg-white/[.025]"}`}><span className="block text-[8px] text-slate-500">{label}</span><b className={`mt-1 block text-[10px] ${danger ? "text-red-200" : "text-slate-200"}`}>{value}</b></div>; }
function MaintenanceStep({ time, title, body, done }) { return <div className="flex gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-4"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-400/15 text-emerald-300" : "border border-white/10 text-slate-600"}`}>{done ? <CheckCircle2 size={14}/> : <Clock3 size={13}/>}</span><div><span className="text-[8px] font-black text-slate-600">{time}</span><b className="mt-1 block text-[10px] text-slate-200">{title}</b><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-500">{body}</p></div></div>; }

export default FactoryDetailTwin;
