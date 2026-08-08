import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clock3,
  FileCheck2,
  Gauge,
  MapPinned,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Route,
  ShieldCheck,
  Siren,
  Sparkles,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import KakaoYardMap from "../../components/digitalTwin/KakaoYardMap";
import facilityTags from "../../components/digitalTwin/geojeShipyardTags.json";
import { predictSpatialRisk, spatialRiskModelMetadata } from "../../utils/spatialRiskPredictor";

const FACILITIES = facilityTags
  .filter((facility) => facility.status === "confirmed")
  .map((facility) => ({ code: `TAG-${facility.id}`, name: facility.name, lat: facility.lat, lng: facility.lng }));

const ORIGIN = FACILITIES.find((facility) => facility.code === "TAG-17");
const WIND_DEGREES = 45;

const PHASES = [
  { code: "OPERATING", time: "정상", short: "정상 운영", title: "고소 용접 작업 정상 운영", description: "CAM-01과 디지털 트윈이 현장 상태를 동기화하고 있습니다." },
  { code: "DETECT", time: "+00:03", short: "AI 감지", title: "안전벨트 미착용 감지", description: "CAM-01이 W-088의 PPE 위반을 97.4% 신뢰도로 감지했습니다." },
  { code: "FUSION", time: "+00:08", short: "트윈 융합", title: "현장 맥락 자동 결합", description: "작업허가서·작업 높이·환기설비·인접 작업자를 공간 모델에 결합합니다." },
  { code: "FORECAST", time: "+00:14", short: "AI 예측", title: "2차 사고 확산 가능성 예측", description: "학습된 MLP가 15개 시설의 30·60·90초 위험 확률을 추론합니다." },
  { code: "OPTIMIZE", time: "+00:20", short: "대응 최적화", title: "504개 대응전략 비교 완료", description: "인명 위험·대피 시간·생산 손실을 함께 최소화하는 대응안을 선택합니다." },
  { code: "EXECUTE", time: "+00:27", short: "현장 실행", title: "부분 작업 중지 및 대피 실행", description: "선택된 통제 반경과 대피 경로를 현장 관리자에게 전파합니다." },
  { code: "STABLE", time: "+00:36", short: "안정화", title: "위험도 정상 범위 회복", description: "작업자 대피와 설비 격리 완료 후 잔여 위험을 재평가했습니다." },
];

const RISK_SCORE = [6, 72, 84, 91, 67, 31, 7];
const EXPOSED_COUNT = [0, 1, 1, 4, 4, 2, 0];
const FORECAST_TIME = [5, 5, 15, 60, 90, 90, 120];

function SafetyScenarioTwin({ notify, onOpenFactory }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const phase = PHASES[phaseIndex];

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setPhaseIndex((current) => {
        if (current >= PHASES.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 4300);
    return () => window.clearInterval(timer);
  }, [playing]);

  const rawPredictions = useMemo(() => predictSpatialRisk({
    originCode: ORIGIN.code,
    hazardCode: "GAS",
    windDegrees: WIND_DEGREES,
    forecastSeconds: FORECAST_TIME[phaseIndex],
  }), [phaseIndex]);

  const facilityRisks = useMemo(() => rawPredictions
    .map((prediction) => ({
      ...FACILITIES.find((facility) => facility.code === prediction.facilityCode),
      probability: phaseIndex === 6 ? prediction.probability * 0.11 : prediction.probability,
    }))
    .sort((left, right) => right.probability - left.probability), [phaseIndex, rawPredictions]);

  const affectedFacilities = phaseIndex >= 3 && phaseIndex <= 5
    ? facilityRisks.filter((facility) => facility.code === ORIGIN.code || facility.probability >= 0.28)
    : [];
  const optimization = useMemo(() => optimizeResponses(facilityRisks), [facilityRisks]);
  const safePoint = offsetCoordinate(ORIGIN, WIND_DEGREES + 180, 270);
  const workers = createScenarioWorkers(phaseIndex, safePoint);
  const exposedWorkers = workers.filter((worker) => worker.danger);
  const routes = phaseIndex === 5 ? exposedWorkers.map((worker) => [
    { lat: worker.lat, lng: worker.lng },
    offsetCoordinate({ lat: worker.lat, lng: worker.lng }, 205, 80),
    safePoint,
  ]) : [];

  const mapAlerts = phaseIndex === 1 || phaseIndex === 2
    ? [{ cameraId: "CAM-01", facilityCode: ORIGIN.code, active: true, message: "안전벨트 미착용" }]
    : affectedFacilities.map((facility) => ({
      cameraId: "MLP-PREDICT",
      facilityCode: facility.code,
      active: true,
      message: `위험 ${Math.round(facility.probability * 100)}%`,
    }));

  const plumeRadius = [0, 0, 0, 95, 132, 82, 0][phaseIndex];
  const riskSimulation = {
    active: plumeRadius > 0,
    center: ORIGIN,
    radiusMeters: plumeRadius,
    windDegrees: WIND_DEGREES,
    routes,
    safePoint: phaseIndex >= 4 && phaseIndex <= 5 ? safePoint : null,
    color: phaseIndex === 5 ? "#ff9f0a" : "#ff453a",
  };

  const start = () => {
    if (phaseIndex === PHASES.length - 1) setPhaseIndex(0);
    setPlaying(true);
    notify?.("운영 이벤트의 AI 분석을 시작합니다.");
  };
  const reset = () => { setPlaying(false); setPhaseIndex(0); };

  const alertBanner = phaseIndex === 1 ? <div className="twin-preserve-dark rounded-2xl border border-red-400/50 bg-[#17090e]/95 px-5 py-4 shadow-[0_0_32px_rgba(255,59,48,.4)]">
    <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500 text-white"><Siren size={18}/></span><div><p className="text-[9px] font-black tracking-[.17em] text-red-300">CAM-01 · AI DETECTION</p><p className="mt-1 text-sm font-black text-white">W-088 안전벨트 미착용 · 신뢰도 97.4%</p><p className="mt-1 text-[10px] text-slate-400">소부재조립공장 고소 용접 구역</p></div></div>
  </div> : null;

  return <div className="twin-theme-page safety-twin min-h-full bg-[#050b12] px-5 py-5 text-slate-100 md:px-7 md:py-6">
    <header className="twin-theme-hero rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_82%_15%,rgba(0,210,255,.13),transparent_30%),linear-gradient(135deg,#0b1a27,#071019)] p-6 shadow-2xl md:p-7">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div><div className="flex items-center gap-2 text-[10px] font-black tracking-[.22em] text-cyan-300"><Sparkles size={15}/> HANWHA OCEAN · SAFETY OPERATIONS PLATFORM</div><h1 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">통합 안전 운영 디지털 트윈</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">CCTV·작업자·작업허가서·설비 데이터를 공간 모델에 결합해 위험 예측부터 현장 조치까지 통합 운영합니다.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.07] px-3 py-2 text-[9px] font-black text-emerald-300">MLP v{spatialRiskModelMetadata.version} · R² {spatialRiskModelMetadata.metrics.r2}</span>
          <button onClick={playing ? () => setPlaying(false) : start} className="flex h-10 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-[10px] font-black text-slate-950">{playing ? <Pause size={14}/> : <Play size={14}/>} {playing ? "분석 일시정지" : phaseIndex ? "분석 계속" : "운영 이벤트 분석"}</button>
          <button onClick={reset} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-400 hover:text-white"><RotateCcw size={15}/></button>
        </div>
      </div>
    </header>

    <section className="my-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi icon={Gauge} label="현재 위험도" value={`${RISK_SCORE[phaseIndex]}`} unit="/ 100" danger={RISK_SCORE[phaseIndex] >= 60}/>
      <Kpi icon={Users} label="위험 노출 작업자" value={EXPOSED_COUNT[phaseIndex]} unit="PEOPLE" danger={EXPOSED_COUNT[phaseIndex] > 0}/>
      <Kpi icon={BrainCircuit} label="최고 시설 위험 확률" value={`${Math.round(facilityRisks[0].probability * 100)}%`} unit="MLP OUTPUT" danger={phaseIndex >= 3 && phaseIndex <= 5}/>
      <Kpi icon={Clock3} label="사건 경과" value={phase.time} unit={phase.short.toUpperCase()}/>
    </section>

    <section className={`twin-theme-surface overflow-hidden rounded-3xl border bg-[#07121c] shadow-2xl ${RISK_SCORE[phaseIndex] >= 60 ? "border-red-500/40" : "border-cyan-400/15"}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4"><div><p className="text-[10px] font-black tracking-[.16em] text-cyan-300">{phase.code}</p><h2 className="mt-1 text-sm font-black text-white">{phase.title}</h2><p className="mt-1 text-[10px] text-slate-500">{phase.description}</p></div><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${playing ? "animate-pulse bg-emerald-400 shadow-[0_0_12px_#34d399]" : "bg-slate-600"}`}/></div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0 overflow-hidden border-b border-white/10 xl:border-b-0 xl:border-r">
          <KakaoYardMap workers={workers} cameraAlerts={mapAlerts} cameraConnected cameraStatusText={cameraStatusForPhase(phaseIndex)} riskSimulation={riskSimulation} alertBanner={alertBanner} onOpenShop={onOpenFactory} onUnavailable={() => {}}/>
        </div>
        <StoryPanel phaseIndex={phaseIndex} facilityRisks={facilityRisks} optimization={optimization} onAdvance={() => { setPlaying(false); setPhaseIndex((current) => Math.min(PHASES.length - 1, current + 1)); }}/>
      </div>
      <OperationalTimeline phaseIndex={phaseIndex} onSelect={(index) => { setPlaying(false); setPhaseIndex(index); }}/>
    </section>
  </div>;
}

function StoryPanel({ phaseIndex, facilityRisks, optimization, onAdvance }) {
  const content = [<ReadyPanel/>, <DetectionPanel/>, <FusionPanel/>, <ForecastPanel risks={facilityRisks}/>, <OptimizationPanel optimization={optimization}/>, <ExecutionPanel optimization={optimization}/>, <StablePanel/>][phaseIndex];
  return <aside className="twin-theme-panel flex min-h-[640px] flex-col bg-[#08131d] p-4"><div className="flex-1">{content}</div>{phaseIndex < PHASES.length - 1 && <button onClick={onAdvance} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[.07] text-[10px] font-black text-cyan-200 hover:bg-cyan-400/15">다음 단계 보기 <ChevronRight size={14}/></button>}</aside>;
}

function PanelHeader({ eyebrow, title, status, danger }) {
  return <div className="border-b border-white/10 pb-4"><div className="flex items-center justify-between"><span className={`text-[9px] font-black tracking-[.18em] ${danger ? "text-red-300" : "text-cyan-300"}`}>{eyebrow}</span><span className={`rounded-full px-2 py-1 text-[8px] font-black ${danger ? "bg-red-500/15 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`}>{status}</span></div><h3 className="mt-3 text-base font-black text-white">{title}</h3><p className="mt-1 text-[10px] text-slate-500">TAG-17 · 소부재조립공장</p></div>;
}

function ReadyPanel() { return <><PanelHeader eyebrow="OPERATIONS SYNCHRONIZED" title="고소 용접 작업 모니터링" status="LIVE"/><div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.04] p-5 text-center"><Radio size={26} className="mx-auto text-cyan-300"/><p className="mt-3 text-xs font-black text-slate-200">디지털 트윈 동기화 완료</p><p className="mt-2 text-[10px] leading-5 text-slate-500">CAM-01, 작업자 위치, 작업허가서, 설비 상태를 하나의 공간 상태로 결합했습니다.</p></div><Evidence icon={Users} label="현장 작업자" value="7명"/><Evidence icon={FileCheck2} label="활성 작업허가서" value="PTW-081 · 고소/용접"/></>; }
function DetectionPanel() { return <><PanelHeader eyebrow="01 · VISION AI" title="PPE 위반 감지" status="CRITICAL" danger/><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="작업자" value="W-088"/><Metric label="AI 신뢰도" value="97.4%" danger/><Metric label="안전모" value="착용"/><Metric label="안전벨트" value="미착용" danger/></div><div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[.06] p-3 text-[10px] leading-5 text-red-100">기존 시스템은 여기서 알림을 보내고 종료됩니다. 디지털 트윈은 감지 결과를 현장 전체 맥락과 결합합니다.</div></>; }
function FusionPanel() { return <><PanelHeader eyebrow="02 · TWIN CONTEXT FUSION" title="같은 위반, 다른 위험" status="4 DATA SOURCES"/><div className="mt-4 space-y-2"><Evidence icon={FileCheck2} label="작업허가서" value="고소 용접 · 8.4m"/><Evidence icon={Wrench} label="환기 설비" value="출력 저하 · 62%" danger/><Evidence icon={Users} label="인접 작업자" value="반경 120m · 6명"/><Evidence icon={Wind} label="환경 데이터" value="북동풍 · 4.8m/s"/></div><div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-3 text-[10px] leading-5 text-amber-100">AI가 단순 PPE 위반을 ‘고소 용접 + 환기 저하 + 인접 작업자 밀집’ 복합 위험으로 재분류했습니다.</div></>; }
function ForecastPanel({ risks }) { return <><PanelHeader eyebrow="03 · TRAINED MLP INFERENCE" title="시설별 미래 위험 예측" status="R² 0.9941" danger/><p className="mt-4 text-[9px] font-black tracking-[.14em] text-slate-500">+60 SEC FACILITY RISK</p><div className="mt-3 space-y-3">{risks.slice(0,5).map((facility) => <RiskBar key={facility.code} facility={facility}/>)}</div><div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[.05] p-3 text-[10px] leading-5 text-cyan-100">15,000건의 디지털 트윈 학습 데이터로 훈련된 신경망이 공간별 확산 확률을 추론했습니다.</div></>; }
function OptimizationPanel({ optimization }) { return <><PanelHeader eyebrow="04 · COUNTERFACTUAL OPTIMIZER" title="대응전략 비교" status={`${optimization.candidateCount} PLANS`}/><div className="mt-4 space-y-2"><PlanRow name="경고 방송만" risk="63%" loss="2%"/><PlanRow name="공장 전체 중지" risk="8%" loss="100%"/><PlanRow name="AI 최적 대응안" risk={`${optimization.residualRisk}%`} loss={`${optimization.productionLoss}%`} selected/></div><div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[.07] p-4"><p className="text-[9px] font-black tracking-[.14em] text-emerald-300">RECOMMENDED ACTION</p><p className="mt-2 text-xs font-black text-white">{optimization.radius}m 부분 통제 + B통로 대피</p><p className="mt-2 text-[10px] leading-5 text-slate-400">예상 대피 {optimization.evacuationMinutes}분 · 생산 손실 {optimization.productionLoss}% · 잔여 위험 {optimization.residualRisk}%</p></div></>; }
function ExecutionPanel({ optimization }) { return <><PanelHeader eyebrow="05 · RESPONSE EXECUTION" title="AI 대응안 현장 실행" status="IN PROGRESS"/><div className="mt-4 space-y-2"><CheckStep label={`${optimization.radius}m 위험구역 전자 통제선 설정`} done/><CheckStep label="W-088 외 3명 B통로 대피" done/><CheckStep label="용접 2라인 선택적 작업 중지" done/><CheckStep label="현장 관리자 PPE 재확인"/></div><div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[.05] p-3 text-[10px] leading-5 text-cyan-100"><b>청록색 경로</b>는 현재 위험 확산 방향과 통로 상태를 반영해 선택된 안전 대피 경로입니다.</div></>; }
function StablePanel() { return <><PanelHeader eyebrow="06 · CLOSED LOOP" title="현장 안정화 완료" status="RESOLVED"/><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="위험도" value="91 → 7"/><Metric label="노출 작업자" value="4 → 0"/><Metric label="대응 시간" value="36초"/><Metric label="생산 중지" value="1개 라인"/></div><div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-5 text-center"><CheckCircle2 size={28} className="mx-auto text-emerald-300"/><p className="mt-3 text-xs font-black text-emerald-200">작업자 전원 안전 확인</p><p className="mt-2 text-[10px] leading-5 text-slate-500">공장 전체 중지 없이 필요한 구역만 통제해 안전과 생산성을 함께 확보했습니다.</p></div></>; }

function OperationalTimeline({ phaseIndex, onSelect }) { return <div className="border-t border-white/10 bg-[#07111a] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[9px] font-black tracking-[.16em] text-slate-500">INCIDENT OPERATION LOG</span><span className="text-[8px] text-slate-600">EVT-20260805-0142</span></div><div className="grid grid-cols-4 gap-2 lg:grid-cols-7">{PHASES.map((phase,index) => <button key={phase.code} onClick={() => onSelect(index)} className={`rounded-xl border p-2.5 text-left transition ${index===phaseIndex ? "border-cyan-300/40 bg-cyan-400/10" : index<phaseIndex ? "border-emerald-400/15 bg-emerald-400/[.04]" : "border-white/[.06] bg-white/[.02]"}`}><span className={`text-[8px] font-black ${index===phaseIndex ? "text-cyan-300" : "text-slate-600"}`}>{phase.time}</span><p className={`mt-1 text-[9px] font-bold ${index===phaseIndex ? "text-white" : "text-slate-500"}`}>{phase.short}</p></button>)}</div></div>; }
function Kpi({icon:Icon,label,value,unit,danger}) { return <article className={`rounded-2xl border p-4 ${danger ? "border-red-400/25 bg-red-500/[.06]" : "border-cyan-400/10 bg-[#0a1621]"}`}><div className="flex items-center justify-between text-[10px] font-bold text-slate-500"><span>{label}</span><Icon size={15} className={danger?"text-red-300":"text-cyan-300"}/></div><div className="mt-3 flex items-end gap-2"><b className={`text-2xl font-black ${danger?"text-red-200":"text-white"}`}>{value}</b><small className="mb-1 text-[8px] font-black tracking-wider text-slate-600">{unit}</small></div></article>; }
function Metric({label,value,danger}) { return <div className={`rounded-xl border p-3 ${danger?"border-red-400/20 bg-red-500/[.06]":"border-white/[.07] bg-white/[.025]"}`}><span className="block text-[9px] text-slate-500">{label}</span><b className={`mt-1 block text-xs ${danger?"text-red-200":"text-slate-200"}`}>{value}</b></div>; }
function Evidence({icon:Icon,label,value,danger}) { return <div className={`mt-2 flex items-center gap-3 rounded-xl border p-3 ${danger?"border-amber-400/20 bg-amber-400/[.05]":"border-white/[.07] bg-white/[.025]"}`}><Icon size={15} className={danger?"text-amber-300":"text-cyan-300"}/><div><span className="block text-[9px] text-slate-500">{label}</span><b className="mt-0.5 block text-[10px] text-slate-200">{value}</b></div></div>; }
function RiskBar({facility}) { return <div><div className="mb-1 flex justify-between text-[9px]"><span className="max-w-[230px] truncate font-bold text-slate-300">{facility.name}</span><b className="text-red-200">{Math.round(facility.probability*100)}%</b></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500" style={{width:`${Math.max(3,facility.probability*100)}%`}}/></div></div>; }
function PlanRow({name,risk,loss,selected}) { return <div className={`flex items-center gap-3 rounded-xl border p-3 ${selected?"border-emerald-400/30 bg-emerald-400/[.07]":"border-white/[.07] bg-white/[.025]"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg ${selected?"bg-emerald-400/15 text-emerald-300":"bg-slate-800 text-slate-500"}`}>{selected?<ShieldCheck size={14}/>:<CircleStop size={13}/>}</span><div className="min-w-0 flex-1"><b className={`block text-[10px] ${selected?"text-emerald-200":"text-slate-300"}`}>{name}</b><span className="text-[8px] text-slate-600">잔여 위험 {risk} · 생산 손실 {loss}</span></div>{selected&&<span className="text-[8px] font-black text-emerald-300">SELECTED</span>}</div>; }
function CheckStep({label,done}) { return <div className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3"><span className={`grid h-6 w-6 place-items-center rounded-full ${done?"bg-emerald-400/15 text-emerald-300":"border border-white/10 text-slate-600"}`}>{done?<CheckCircle2 size={13}/>:<Clock3 size={12}/>}</span><span className={`text-[10px] font-bold ${done?"text-slate-200":"text-slate-500"}`}>{label}</span></div>; }

function optimizeResponses(risks) {
  const aggregate = risks.slice(0,5).reduce((sum,item)=>sum+item.probability,0)/5;
  const modes=[{code:"PARTIAL",effect:.22,loss:10},{code:"ZONE",effect:.55,loss:27},{code:"FULL",effect:.83,loss:88}];
  const candidates=[];
  for(const radius of [60,80,100,120,140,160,180]) for(const bearing of [0,45,90,135,180,225,270,315]) for(const mode of modes) for(const ventilation of [.45,.7,1]) {
    const directionError=Math.abs((((bearing-(WIND_DEGREES+180))%360)+540)%360-180);
    const routePenalty=directionError/180; const control=Math.min(.92,mode.effect+radius/900+ventilation*.08);
    const residual=aggregate*(1-control); const evac=3.2+routePenalty*4+(180-radius)/180;
    const loss=mode.loss+radius*.055; const score=residual*70+evac*2.2+loss*.24;
    candidates.push({radius,bearing,mode:mode.code,ventilation,residualRisk:Math.round(residual*100),evacuationMinutes:Math.max(3,Math.round(evac)),productionLoss:Math.round(loss),score});
  }
  candidates.sort((a,b)=>a.score-b.score); return {...candidates[0],candidateCount:candidates.length};
}
function createScenarioWorkers(phaseIndex,safePoint) {
  const placements=[["W-031",290,55],["W-088",30,42],["W-142",70,68],["W-205",105,90],["W-317",145,116],["W-402",220,150],["W-511",320,190]];
  return placements.map(([id,bearing,distance],index)=>{ if(phaseIndex===6&&index<4){const point=offsetCoordinate(safePoint,220+index*22,index*8);return{id,label:id,...point,danger:false};} const point=offsetCoordinate(ORIGIN,bearing,distance); const danger=phaseIndex>=3&&phaseIndex<=4?index<4:phaseIndex===5?index<2:phaseIndex===1||phaseIndex===2?index===1:false; return{id,label:id,...point,danger}; });
}
function offsetCoordinate(origin,bearingDegrees,distance){const bearing=bearingDegrees*Math.PI/180;return{lat:origin.lat+Math.cos(bearing)*distance/111320,lng:origin.lng+Math.sin(bearing)*distance/(111320*Math.cos(origin.lat*Math.PI/180))};}
function cameraStatusForPhase(index){return["CAM-01 · 정상 분석 중","CAM-01 · PPE 위반 감지","TWIN · 현장 데이터 융합","MLP · 시설 위험 추론","AI · 대응안 최적화","OPS · 현장 조치 실행","TWIN · 안전 상태 동기화"][index];}

export default SafetyScenarioTwin;
