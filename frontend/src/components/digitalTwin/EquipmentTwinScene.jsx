import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Box, RotateCcw, ScanLine } from "lucide-react";

const POSITIONS = [[-5, 0, -3.2], [2.2, 0, -3.2], [-4.3, 0, 3.4], [3.3, 0, 3.1], [0, 0, 0]];

// 작업자는 3D로 표현하지 않는다 — 실제 GPS/UWB 위치 연동 전까지는 좌표를 지어낼 수밖에 없고,
// 그건 "진짜 위치"처럼 보여서 오해를 준다. 작업자 목록·위험도는 FactoryDetailTwin 사이드
// 패널(목록 클릭 → chooseWorker)에서만 보여준다.
function EquipmentTwinScene({ factory, selectedAsset, onSelectAsset }) {
  const controlsRef = useRef();
  const alarmIndex = factory.equipment.findIndex((asset) => asset.fault);
  const resetCamera = () => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(13, 10, 16);
    controlsRef.current.target.set(0, 1.5, 0);
    controlsRef.current.update();
  };
  return <div className="twin-preserve-dark relative h-[610px] overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#06111a]">
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: [13, 10, 16], fov: 40, near: .1, far: 90 }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#06111a"]}/><fog attach="fog" args={["#06111a", 20, 46]}/>
        <hemisphereLight intensity={1.1} color="#d9f8ff" groundColor="#071016"/>
        <directionalLight castShadow position={[8, 13, 8]} intensity={2.4} color="#dff9ff" shadow-mapSize-width={2048} shadow-mapSize-height={2048}/>
        <pointLight position={[0, 7, 0]} intensity={24} color="#1fd7ff" distance={26}/>
        <FactoryFloor profileKey={factory.profileKey}/>
        <SafetyZone alarmPosition={POSITIONS[alarmIndex]}/>
        {factory.equipment.map((asset, index) => <MachineUnit key={asset.assetCode} asset={asset} position={POSITIONS[index] || [index * 2 - 4, 0, 0]}
          selected={selectedAsset?.assetCode === asset.assetCode} onSelect={onSelectAsset}/>) }
        <ContactShadows position={[0, -.04, 0]} scale={25} opacity={.58} blur={2.5} far={15}/>
        <OrbitControls ref={controlsRef} makeDefault target={[0, 1.5, 0]} enableDamping dampingFactor={.1} minDistance={8} maxDistance={32} minPolarAngle={.45} maxPolarAngle={1.45}/>
      </Suspense>
    </Canvas>
    <div className="absolute left-4 top-4 rounded-xl border border-white/10 bg-[#07131e]/85 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[9px] font-black tracking-[.15em] text-cyan-300"><ScanLine size={13}/> EQUIPMENT TWIN</div>
      <p className="mt-1 text-[10px] text-slate-400">설비를 선택하면 부품 단위 진단 정보가 연동됩니다.</p>
      <span className="sim-badge mt-1.5 inline-flex">SIMULATION</span>
    </div>
    <button onClick={resetCamera} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-[#07131e]/85 text-slate-300 backdrop-blur-xl hover:text-white" aria-label="3D 화면 초기화"><RotateCcw size={15}/></button>
    <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#07131e]/85 px-3 py-2 text-[9px] text-slate-400 backdrop-blur-xl"><Box size={13} className="text-cyan-300"/> 드래그 회전 · 휠 확대 · 설비 클릭</div>
  </div>;
}

// 이상 설비 주변의 AI 위험 반경만 표시한다. 대피 경로·집결지는 특정 작업자 위치가 있어야
// 의미가 있는데 그 위치를 3D로는 더 이상 만들지 않으므로(위 주석 참고), 여기서는 그리지 않는다.
// 집결지·대피 시간 정보는 FactoryDetailTwin의 2D 카드(IncidentCommandConsole)에 그대로 남아있다.
function SafetyZone({ alarmPosition }) {
  const pulseRef = useRef();
  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 2.4) * .08;
    pulseRef.current.scale.set(scale, scale, scale);
  });
  if (!alarmPosition) return null;
  return <group position={[alarmPosition[0], .04, alarmPosition[2]]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.1, 2.22, 64]}/><meshBasicMaterial color="#ff354d" transparent opacity={.92}/></mesh>
    <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.1, 64]}/><meshBasicMaterial color="#ff263f" transparent opacity={.12} depthWrite={false}/></mesh>
    <Html center position={[0, .18, -2.45]} distanceFactor={10}><div className="whitespace-nowrap rounded-lg border border-red-400/50 bg-[#260810]/90 px-2.5 py-1.5 text-[8px] font-black text-red-200">AI 위험 반경 · 8m</div></Html>
  </group>;
}

function FactoryFloor({ profileKey }) {
  const accent = { ASSEMBLY: "#00d2ff", CUTTING: "#35e0ad", PAINT: "#ff9d38", DOCK: "#c084fc", OUTFITTING: "#4de0f5" }[profileKey];
  return <group>
    <mesh receiveShadow position={[0, -.15, 0]}><boxGeometry args={[19, .25, 15]}/><meshStandardMaterial color="#132833" roughness={.9}/></mesh>
    <Grid position={[0, .01, 0]} args={[18.5,14.5]} cellSize={.5} cellThickness={.35} cellColor="#31505a" sectionSize={2.5} sectionThickness={.75} sectionColor={accent} fadeDistance={22} fadeStrength={1.4}/>
    {[-8.5,8.5].map((x)=><group key={x}>{[-6.5,0,6.5].map((z)=><mesh key={z} castShadow position={[x,3.2,z]}><boxGeometry args={[.22,6.4,.22]}/><meshStandardMaterial color="#316779" metalness={.55}/></mesh>)}</group>)}
    <mesh position={[0,6.25,0]}><boxGeometry args={[17.3,.18,.18]}/><meshStandardMaterial color="#39788c" metalness={.55}/></mesh>
  </group>;
}

// 정상/경고/고장 3단계에 걸쳐 속도·흔들림을 이 훅 하나로 통일한다.
// alarm일 때는 부드러운 사인파 대신 여러 고주파를 섞은 jitter를 더해 "삐걱거리는" 느낌을 낸다.
// (Math.random 대신 시간 기반 합성이라 리렌더돼도 흔들림이 튀지 않고, seed로 설비마다 위상이 달라진다)
function faultJitter(t, seed = 0) {
  return (Math.sin(t * 27 + seed) + Math.sin(t * 41 + seed * 1.7) + Math.sin(t * 63 + seed * 2.3)) / 3;
}
function speedMultiplier(alarm, warning) { return alarm ? 2.4 : warning ? 1.4 : 1; }

function MachineUnit({ asset, position, selected, onSelect }) {
  const alarm = Boolean(asset.fault);
  const warning = !alarm && asset.status === "WARNING";
  const running = asset.operatingState === "RUNNING";
  const seed = asset.assetCode.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 100;
  const accent = alarm ? "#ff3b4f" : selected ? "#ff9d38" : warning ? "#ffb23e" : "#23c8ee";
  const issuePositions = { ROBOT:[0,2.3,0], POSITIONER:[0,1.1,.4], CONVEYOR:[2.5,.55,0], CUTTER:[0,2.3,0], FAN:[0,1.65,.55], PUMP:[.7,.8,0], CRANE:[0,3.8,0] };
  const motion = { accent, alarm, warning, running, seed };
  return <group position={position} onClick={(event)=>{event.stopPropagation();onSelect(asset);}} onPointerOver={()=>{document.body.style.cursor="pointer";}} onPointerOut={()=>{document.body.style.cursor="default";}}>
    {asset.kind === "ROBOT" && <RobotMachine {...motion}/>}
    {asset.kind === "POSITIONER" && <PositionerMachine {...motion}/>}
    {asset.kind === "CONVEYOR" && <ConveyorMachine {...motion}/>}
    {asset.kind === "CUTTER" && <CutterMachine {...motion}/>}
    {asset.kind === "FAN" && <FanMachine {...motion}/>}
    {asset.kind === "PUMP" && <PumpMachine {...motion}/>}
    {asset.kind === "CRANE" && <CraneMachine {...motion}/>}
    <mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.2,1.28,48]}/><meshBasicMaterial color={accent}/></mesh>
    {alarm && <FaultMarker position={issuePositions[asset.kind]} part={asset.fault.part} seed={seed}/>}
    <Html center position={[0,4.9,0]} distanceFactor={10}><button onClick={()=>onSelect(asset)} className={`min-w-[118px] rounded-lg border px-2.5 py-2 text-left shadow-xl backdrop-blur-md ${alarm?"border-red-400/60 bg-[#230b12]/90":"border-cyan-400/25 bg-[#07151f]/88"}`}><span className={`block text-[8px] font-black tracking-wider ${alarm?"text-red-300":"text-cyan-300"}`}>{asset.assetCode}</span><b className="mt-0.5 block whitespace-nowrap text-[10px] text-white">{asset.name}</b><small className={`mt-0.5 block text-[8px] ${alarm?"text-red-300":"text-slate-500"}`}>{alarm?asset.fault.symptom:`${asset.operatingState} · ${asset.utilization}%`}</small></button></Html>
  </group>;
}

// 어깨·팔꿈치가 실제로 흔들리는 로봇팔. ShopTwinScene.jsx에 있던 리그를 그대로 옮기고,
// running(가동 중)일 때만 흔들리도록 데이터에 연결했다. 고장이면 사인파 대신 jitter를 섞는다.
function RobotMachine({accent,alarm,warning,running,seed}) {
  const shoulder = useRef(); const elbow = useRef();
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const wave = running ? Math.sin(t * 1.1 * speed + seed) : 0;
    const jitter = alarm ? faultJitter(t, seed) * .09 : 0;
    if (shoulder.current) shoulder.current.rotation.z = -.65 + wave * .16 + jitter;
    if (elbow.current) elbow.current.rotation.z = 1.3 + wave * .24 + jitter * 1.5;
  });
  return <group><mesh castShadow position={[0,.35,0]}><cylinderGeometry args={[.65,.82,.7,24]}/><meshStandardMaterial color="#17495c" metalness={.65}/></mesh><mesh castShadow position={[0,.88,0]}><cylinderGeometry args={[.38,.48,.6,24]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.2:0}/></mesh><group ref={shoulder} position={[0,1.18,0]}><Arm length={1.65} color="#2ca9c8"/><group ref={elbow} position={[0,1.5,0]}><Arm length={1.35} color={accent}/></group></group></group>; }
function Arm({length,color}) { return <group><mesh castShadow position={[0,length/2,0]}><capsuleGeometry args={[.2,length-.3,8,16]}/><meshStandardMaterial color={color} metalness={.6}/></mesh><mesh position={[0,length,0]}><sphereGeometry args={[.28,18,18]}/><meshStandardMaterial color="#bdd7dc" metalness={.7}/></mesh></group>; }

// 턴테이블 원판을 Y축으로 돌린다. 단색 원판만 돌리면 회전이 안 보이니 accent 마커를 원판 가장자리에 붙여서 눈에 띄게 한다.
function PositionerMachine({accent,alarm,warning,running,seed}) {
  const table = useRef();
  useFrame(({clock}) => {
    if (!table.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .04 : 0;
    table.current.rotation.y = (running ? t * .6 * speed : 0) + jitter;
  });
  return <group><RoundedBox castShadow args={[2.5,.75,1.9]} position={[0,.42,0]} radius={.15}><meshStandardMaterial color="#214553" metalness={.58}/></RoundedBox><group ref={table} position={[0,1.05,0]}><mesh castShadow><cylinderGeometry args={[.85,.85,.3,32]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1:0}/></mesh><mesh position={[.6,.02,0]}><boxGeometry args={[.18,.1,.18]}/><meshStandardMaterial color="#eafeff" emissive="#eafeff" emissiveIntensity={1.4}/></mesh></group><mesh position={[0,1.5,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.13,.13,2.3,16]}/><meshStandardMaterial color="#9fb6bc" metalness={.75}/></mesh></group>; }

// 롤러 자체 회전은 원통이라 눈에 안 보이므로, 벨트 위를 흐르는 발광 스트립으로 "이송 중"을 표현한다.
const CONVEYOR_LENGTH = 5.3;
const CONVEYOR_STRIP_COUNT = 4;

function ConveyorMachine({accent,alarm,warning,running,seed}) {
  const body = useRef();
  const strips = useRef([]);
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) : 0;

    // 이송 동작과 고장 진동을 분리한다. STANDBY여도 고장 자체는 눈에 보여야 한다.
    if (body.current) {
      body.current.position.y = alarm ? jitter * .025 : 0;
      body.current.rotation.z = alarm ? jitter * .012 : 0;
    }

    if (!running) return;
    const spacing = CONVEYOR_LENGTH / CONVEYOR_STRIP_COUNT;
    strips.current.forEach((strip, index) => {
      if (!strip) return;
      const travelled = (t * .9 * speed + index * spacing) % CONVEYOR_LENGTH;
      const x = travelled - CONVEYOR_LENGTH / 2;
      strip.position.x = x + jitter * .025;

      // 양 끝에서 사라진 상태로 되감아 반복 경계의 순간이동을 숨긴다.
      const distanceToEdge = CONVEYOR_LENGTH / 2 - Math.abs(x);
      strip.material.opacity = Math.min(1, Math.max(0, distanceToEdge / .4));
    });
  });
  return <group ref={body}><RoundedBox castShadow receiveShadow args={[5.5,.42,1.6]} position={[0,.55,0]} radius={.12}><meshStandardMaterial color="#203c46" metalness={.58}/></RoundedBox>{Array.from({length:9}).map((_,i)=><mesh key={i} position={[-2.35+i*.59,.82,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.1,.1,1.35,12]}/><meshStandardMaterial color="#8ea7ad" metalness={.8}/></mesh>)}{running && Array.from({length:CONVEYOR_STRIP_COUNT}).map((_,index)=><mesh key={index} ref={(node)=>{strips.current[index]=node;}} position={[-CONVEYOR_LENGTH/2,.79,0]}><boxGeometry args={[.25,.05,1.3]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} transparent opacity={0} depthWrite={false}/></mesh>)}<mesh position={[2.55,.45,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.38,.38,.9,18]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.3:0}/></mesh></group>; }

// 절단 토치가 위아래로 왕복하며 절단 스트로크를 표현. 고장이면 스파크처럼 emissive가 불규칙하게 떨린다.
function CutterMachine({accent,alarm,warning,running,seed}) {
  const torch = useRef(); const tip = useRef();
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    if (torch.current) torch.current.position.y = 2.05 + (running ? Math.sin(t * 2.2 * speed + seed) * .18 : 0);
    if (tip.current) tip.current.emissiveIntensity = alarm ? 1.6 + Math.abs(faultJitter(t, seed)) * 1.8 : 1;
  });
  return <group><RoundedBox castShadow args={[4.8,.45,2.4]} position={[0,.38,0]} radius={.12}><meshStandardMaterial color="#263f49" metalness={.64}/></RoundedBox>{[-2,2].map(x=><mesh key={x} position={[x,1.55,0]}><boxGeometry args={[.18,2.5,.18]}/><meshStandardMaterial color="#376b79" metalness={.55}/></mesh>)}<mesh position={[0,2.72,0]}><boxGeometry args={[4.3,.22,.22]}/><meshStandardMaterial color="#39798c" metalness={.6}/></mesh><mesh ref={torch} position={[0,2.05,0]}><cylinderGeometry args={[.16,.1,1.2,18]}/><meshStandardMaterial ref={tip} color={accent} emissive={alarm?accent:"#126c80"} emissiveIntensity={alarm?2:1}/></mesh></group>; }

function FanMachine({accent,alarm,warning,running,seed}) { const rotor=useRef();useFrame(({clock})=>{if(!rotor.current)return;const t=clock.elapsedTime;const speed=speedMultiplier(alarm,warning);const jitter=alarm?faultJitter(t,seed)*.3:0;rotor.current.rotation.z=(running?t*2.4*speed:0)+jitter;});return <group><mesh castShadow position={[0,1.6,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[1.35,1.35,.75,32]}/><meshStandardMaterial color="#244955" metalness={.55}/></mesh><group ref={rotor} position={[0,1.6,.42]}>{[0,1,2,3,4,5].map(i=><mesh key={i} rotation={[0,0,i*Math.PI/3]} position={[0,.55,0]}><boxGeometry args={[.28,1.1,.08]}/><meshStandardMaterial color="#71aeba" metalness={.62}/></mesh>)}<mesh><cylinderGeometry args={[.3,.3,.28,20]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.5:0}/></mesh></group><RoundedBox args={[2.2,.55,1.4]} position={[0,.3,0]} radius={.12}><meshStandardMaterial color="#173845"/></RoundedBox></group>; }

// 펌프는 임펠러가 하우징 안에 숨어 있어 회전이 안 보이므로, 대신 하우징 전체가 숨쉬듯 맥동한다
// (스펙 문서의 "압력 상승: 미세하게 팽창·맥동"과 그대로 맞아떨어지는 표현).
function PumpMachine({accent,alarm,warning,running,seed}) {
  const body = useRef();
  useFrame(({clock}) => {
    if (!body.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const base = running ? 1 + Math.sin(t * 2 * speed) * .025 : 1;
    const jitter = alarm ? faultJitter(t, seed) * .04 : 0;
    body.current.scale.setScalar(base + jitter);
  });
  return <group ref={body}><RoundedBox args={[3.2,.35,1.65]} position={[0,.2,0]} radius={.1}><meshStandardMaterial color="#1c3b47"/></RoundedBox><mesh castShadow position={[-.65,.75,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.58,.58,1.45,24]}/><meshStandardMaterial color="#2d6675" metalness={.6}/></mesh><mesh castShadow position={[.75,.78,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.72,.72,.7,24]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.2:0}/></mesh><mesh position={[1.2,1.38,0]}><cylinderGeometry args={[.13,.13,1.2,12]}/><meshStandardMaterial color="#8cb2ba" metalness={.7}/></mesh></group>; }

// 후크 블록이 케이블 아래에서 진자처럼 살짝 흔들린다. 고장이면 흔들림이 불규칙해진다.
function CraneMachine({accent,alarm,warning,running,seed}) {
  const hook = useRef();
  useFrame(({clock}) => {
    if (!hook.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const sway = running ? Math.sin(t * .8 * speed + seed) * .05 : 0;
    const jitter = alarm ? faultJitter(t, seed) * .06 : 0;
    hook.current.rotation.z = sway + jitter;
  });
  return <group>{[-2.2,2.2].map(x=><mesh key={x} position={[x,2,0]}><boxGeometry args={[.25,4,.25]}/><meshStandardMaterial color="#386f80" metalness={.6}/></mesh>)}<mesh position={[0,4,0]}><boxGeometry args={[5,.3,.35]}/><meshStandardMaterial color="#3c7f92" metalness={.6}/></mesh><RoundedBox args={[1.1,.65,.8]} position={[0,3.65,0]} radius={.1}><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.5:0}/></RoundedBox><group ref={hook} position={[0,2.5,0]}><mesh position={[0,-.85,0]}><cylinderGeometry args={[.035,.035,2.2,8]}/><meshStandardMaterial color="#b8ced3" metalness={.8}/></mesh><mesh position={[0,-1.65,0]}><torusGeometry args={[.22,.06,10,22]}/><meshStandardMaterial color="#c6d9dd" metalness={.8}/></mesh></group></group>; }

// 이상 부품 마커도 SafetyZone과 같은 방식으로 숨쉬듯 pulse — 지금은 고정 크기라 눈에 덜 띄었다.
function FaultMarker({position,part,seed=0}) {
  const ring = useRef();
  useFrame(({clock}) => { if (ring.current) { const s = 1 + Math.abs(faultJitter(clock.elapsedTime, seed)) * .3; ring.current.scale.setScalar(s); } });
  return <group position={position}><mesh ref={ring}><sphereGeometry args={[.16,18,18]}/><meshBasicMaterial color="#ff2f48"/></mesh><pointLight intensity={12} distance={3.2} color="#ff2f48"/><mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.32,.035,10,28]}/><meshBasicMaterial color="#ff5368"/></mesh><Html center position={[0,.6,0]} distanceFactor={9}><div className="whitespace-nowrap rounded-lg border border-red-400/60 bg-[#260810]/95 px-2 py-1 text-[9px] font-black text-red-200 shadow-[0_0_18px_rgba(255,47,72,.5)]">이상 부품 · {part}</div></Html></group>; }

export default EquipmentTwinScene;
