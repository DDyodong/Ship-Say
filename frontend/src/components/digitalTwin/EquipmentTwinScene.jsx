import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Grid, Html, Line, OrbitControls, RoundedBox } from "@react-three/drei";
import { Box, RotateCcw, ScanLine } from "lucide-react";

const POSITIONS = [[-5, 0, -3.2], [2.2, 0, -3.2], [-4.3, 0, 3.4], [3.3, 0, 3.1], [0, 0, 0]];
const WORKER_POSITIONS = [[-2.6, 0, -2], [5.3, 0, -1.5], [-1.5, 0, 4.8], [5.4, 0, 4.5], [-6.7, 0, 1.1], [.4, 0, 1.7]];

function EquipmentTwinScene({ factory, selectedAsset, selectedWorker, onSelectAsset, onSelectWorker }) {
  const controlsRef = useRef();
  const alarmIndex = factory.equipment.findIndex((asset) => asset.fault);
  const exposedIndex = factory.workers.findIndex((worker) => worker.riskLevel === "HIGH");
  const resetCamera = () => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(13, 10, 16);
    controlsRef.current.target.set(0, 1.5, 0);
    controlsRef.current.update();
  };
  return <div className="relative h-[610px] overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#06111a]">
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: [13, 10, 16], fov: 40, near: .1, far: 90 }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#06111a"]}/><fog attach="fog" args={["#06111a", 20, 46]}/>
        <hemisphereLight intensity={1.1} color="#d9f8ff" groundColor="#071016"/>
        <directionalLight castShadow position={[8, 13, 8]} intensity={2.4} color="#dff9ff" shadow-mapSize-width={2048} shadow-mapSize-height={2048}/>
        <pointLight position={[0, 7, 0]} intensity={24} color="#1fd7ff" distance={26}/>
        <FactoryFloor profileKey={factory.profileKey}/>
        <SafetyZone alarmPosition={POSITIONS[alarmIndex]} workerPosition={WORKER_POSITIONS[exposedIndex]}/>
        {factory.equipment.map((asset, index) => <MachineUnit key={asset.assetCode} asset={asset} position={POSITIONS[index] || [index * 2 - 4, 0, 0]}
          selected={selectedAsset?.assetCode === asset.assetCode} onSelect={onSelectAsset}/>) }
        {factory.workers.map((worker, index) => <WorkerAvatar key={worker.workerId} worker={worker} position={WORKER_POSITIONS[index]}
          selected={selectedWorker?.workerId === worker.workerId} onSelect={onSelectWorker}/>) }
        <ContactShadows position={[0, -.04, 0]} scale={25} opacity={.58} blur={2.5} far={15}/>
        <OrbitControls ref={controlsRef} makeDefault target={[0, 1.5, 0]} enableDamping dampingFactor={.1} minDistance={8} maxDistance={32} minPolarAngle={.45} maxPolarAngle={1.45}/>
      </Suspense>
    </Canvas>
    <div className="absolute left-4 top-4 rounded-xl border border-white/10 bg-[#07131e]/85 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[9px] font-black tracking-[.15em] text-cyan-300"><ScanLine size={13}/> LIVE EQUIPMENT TWIN</div>
      <p className="mt-1 text-[10px] text-slate-400">설비를 선택하면 부품 단위 진단 정보가 연동됩니다.</p>
    </div>
    <button onClick={resetCamera} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-[#07131e]/85 text-slate-300 backdrop-blur-xl hover:text-white" aria-label="3D 화면 초기화"><RotateCcw size={15}/></button>
    <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-white/10 bg-[#07131e]/85 px-3 py-2 text-[9px] text-slate-400 backdrop-blur-xl"><Box size={13} className="text-cyan-300"/> 드래그 회전 · 휠 확대 · 작업자/설비 클릭</div>
  </div>;
}

function SafetyZone({ alarmPosition, workerPosition }) {
  const pulseRef = useRef();
  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 2.4) * .08;
    pulseRef.current.scale.set(scale, scale, scale);
  });
  if (!alarmPosition || !workerPosition) return null;
  const safePoint = [-7.6, .08, 5.8];
  const route = [[workerPosition[0], .1, workerPosition[2]], [-4.6, .1, 1.2], [-6.1, .1, 3.8], safePoint];
  return <group>
    <group position={[alarmPosition[0], .04, alarmPosition[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.1, 2.22, 64]}/><meshBasicMaterial color="#ff354d" transparent opacity={.92}/></mesh>
      <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.1, 64]}/><meshBasicMaterial color="#ff263f" transparent opacity={.12} depthWrite={false}/></mesh>
      <Html center position={[0, .18, -2.45]} distanceFactor={10}><div className="whitespace-nowrap rounded-lg border border-red-400/50 bg-[#260810]/90 px-2.5 py-1.5 text-[8px] font-black text-red-200">AI 위험 반경 · 8m</div></Html>
    </group>
    <Line points={route} color="#36f1b3" lineWidth={3} dashed dashScale={2.4} dashSize={.35} gapSize={.2}/>
    <group position={safePoint}><mesh position={[0,.03,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.75,.9,40]}/><meshBasicMaterial color="#36f1b3"/></mesh><pointLight position={[0,.5,0]} intensity={4} distance={2.5} color="#36f1b3"/><Html center position={[0,.7,0]} distanceFactor={9}><div className="whitespace-nowrap rounded-lg border border-emerald-400/40 bg-[#071b17]/92 px-2 py-1 text-[8px] font-black text-emerald-200">비상 집결지 A · ETA 42초</div></Html></group>
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

function MachineUnit({ asset, position, selected, onSelect }) {
  const alarm = Boolean(asset.fault);
  const accent = alarm ? "#ff3b4f" : selected ? "#ff9d38" : "#23c8ee";
  const issuePositions = { ROBOT:[0,2.3,0], POSITIONER:[0,1.1,.4], CONVEYOR:[2.5,.55,0], CUTTER:[0,2.3,0], FAN:[0,1.65,.55], PUMP:[.7,.8,0], CRANE:[0,3.8,0] };
  return <group position={position} onClick={(event)=>{event.stopPropagation();onSelect(asset);}} onPointerOver={()=>{document.body.style.cursor="pointer";}} onPointerOut={()=>{document.body.style.cursor="default";}}>
    {asset.kind === "ROBOT" && <RobotMachine accent={accent} alarm={alarm}/>}
    {asset.kind === "POSITIONER" && <PositionerMachine accent={accent} alarm={alarm}/>}
    {asset.kind === "CONVEYOR" && <ConveyorMachine accent={accent} alarm={alarm}/>}
    {asset.kind === "CUTTER" && <CutterMachine accent={accent} alarm={alarm}/>}
    {asset.kind === "FAN" && <FanMachine accent={accent} alarm={alarm}/>}
    {asset.kind === "PUMP" && <PumpMachine accent={accent} alarm={alarm}/>}
    {asset.kind === "CRANE" && <CraneMachine accent={accent} alarm={alarm}/>}
    <mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.2,1.28,48]}/><meshBasicMaterial color={accent}/></mesh>
    {alarm && <FaultMarker position={issuePositions[asset.kind]} part={asset.fault.part}/>}
    <Html center position={[0,4.9,0]} distanceFactor={10}><button onClick={()=>onSelect(asset)} className={`min-w-[118px] rounded-lg border px-2.5 py-2 text-left shadow-xl backdrop-blur-md ${alarm?"border-red-400/60 bg-[#230b12]/90":"border-cyan-400/25 bg-[#07151f]/88"}`}><span className={`block text-[8px] font-black tracking-wider ${alarm?"text-red-300":"text-cyan-300"}`}>{asset.assetCode}</span><b className="mt-0.5 block whitespace-nowrap text-[10px] text-white">{asset.name}</b><small className={`mt-0.5 block text-[8px] ${alarm?"text-red-300":"text-slate-500"}`}>{alarm?asset.fault.symptom:`${asset.operatingState} · ${asset.utilization}%`}</small></button></Html>
  </group>;
}

function RobotMachine({accent,alarm}) { return <group><mesh castShadow position={[0,.35,0]}><cylinderGeometry args={[.65,.82,.7,24]}/><meshStandardMaterial color="#17495c" metalness={.65}/></mesh><mesh castShadow position={[0,.88,0]}><cylinderGeometry args={[.38,.48,.6,24]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.2:0}/></mesh><group rotation={[0,0,-.65]} position={[0,1.18,0]}><Arm length={1.65} color="#2ca9c8"/><group rotation={[0,0,1.3]} position={[0,1.5,0]}><Arm length={1.35} color={accent}/></group></group></group>; }
function Arm({length,color}) { return <group><mesh castShadow position={[0,length/2,0]}><capsuleGeometry args={[.2,length-.3,8,16]}/><meshStandardMaterial color={color} metalness={.6}/></mesh><mesh position={[0,length,0]}><sphereGeometry args={[.28,18,18]}/><meshStandardMaterial color="#bdd7dc" metalness={.7}/></mesh></group>; }
function PositionerMachine({accent,alarm}) { return <group><RoundedBox castShadow args={[2.5,.75,1.9]} position={[0,.42,0]} radius={.15}><meshStandardMaterial color="#214553" metalness={.58}/></RoundedBox><mesh castShadow position={[0,1.05,0]}><cylinderGeometry args={[.85,.85,.3,32]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1:0}/></mesh><mesh position={[0,1.5,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.13,.13,2.3,16]}/><meshStandardMaterial color="#9fb6bc" metalness={.75}/></mesh></group>; }
function ConveyorMachine({accent,alarm}) { return <group><RoundedBox castShadow args={[5.5,.42,1.6]} position={[0,.55,0]} radius={.12}><meshStandardMaterial color="#203c46" metalness={.58}/></RoundedBox>{Array.from({length:9}).map((_,i)=><mesh key={i} position={[-2.35+i*.59,.82,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.1,.1,1.35,12]}/><meshStandardMaterial color="#8ea7ad" metalness={.8}/></mesh>)}<mesh position={[2.55,.45,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.38,.38,.9,18]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.3:0}/></mesh></group>; }
function CutterMachine({accent,alarm}) { return <group><RoundedBox castShadow args={[4.8,.45,2.4]} position={[0,.38,0]} radius={.12}><meshStandardMaterial color="#263f49" metalness={.64}/></RoundedBox>{[-2,2].map(x=><mesh key={x} position={[x,1.55,0]}><boxGeometry args={[.18,2.5,.18]}/><meshStandardMaterial color="#376b79" metalness={.55}/></mesh>)}<mesh position={[0,2.72,0]}><boxGeometry args={[4.3,.22,.22]}/><meshStandardMaterial color="#39798c" metalness={.6}/></mesh><mesh position={[0,2.05,0]}><cylinderGeometry args={[.16,.1,1.2,18]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#126c80"} emissiveIntensity={alarm?2:1}/></mesh></group>; }
function FanMachine({accent,alarm}) { const rotor=useRef();useFrame(({clock})=>{if(rotor.current)rotor.current.rotation.z=clock.elapsedTime*2.4;});return <group><mesh castShadow position={[0,1.6,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[1.35,1.35,.75,32]}/><meshStandardMaterial color="#244955" metalness={.55}/></mesh><group ref={rotor} position={[0,1.6,.42]}>{[0,1,2,3,4,5].map(i=><mesh key={i} rotation={[0,0,i*Math.PI/3]} position={[0,.55,0]}><boxGeometry args={[.28,1.1,.08]}/><meshStandardMaterial color="#71aeba" metalness={.62}/></mesh>)}<mesh><cylinderGeometry args={[.3,.3,.28,20]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.5:0}/></mesh></group><RoundedBox args={[2.2,.55,1.4]} position={[0,.3,0]} radius={.12}><meshStandardMaterial color="#173845"/></RoundedBox></group>; }
function PumpMachine({accent,alarm}) { return <group><RoundedBox args={[3.2,.35,1.65]} position={[0,.2,0]} radius={.1}><meshStandardMaterial color="#1c3b47"/></RoundedBox><mesh castShadow position={[-.65,.75,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.58,.58,1.45,24]}/><meshStandardMaterial color="#2d6675" metalness={.6}/></mesh><mesh castShadow position={[.75,.78,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.72,.72,.7,24]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.2:0}/></mesh><mesh position={[1.2,1.38,0]}><cylinderGeometry args={[.13,.13,1.2,12]}/><meshStandardMaterial color="#8cb2ba" metalness={.7}/></mesh></group>; }
function CraneMachine({accent,alarm}) { return <group>{[-2.2,2.2].map(x=><mesh key={x} position={[x,2,0]}><boxGeometry args={[.25,4,.25]}/><meshStandardMaterial color="#386f80" metalness={.6}/></mesh>)}<mesh position={[0,4,0]}><boxGeometry args={[5,.3,.35]}/><meshStandardMaterial color="#3c7f92" metalness={.6}/></mesh><RoundedBox args={[1.1,.65,.8]} position={[0,3.65,0]} radius={.1}><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.5:0}/></RoundedBox><mesh position={[0,2.5,0]}><cylinderGeometry args={[.035,.035,2.2,8]}/><meshStandardMaterial color="#b8ced3" metalness={.8}/></mesh><mesh position={[0,1.35,0]}><torusGeometry args={[.22,.06,10,22]}/><meshStandardMaterial color="#c6d9dd" metalness={.8}/></mesh></group>; }
function FaultMarker({position,part}) { return <group position={position}><mesh><sphereGeometry args={[.16,18,18]}/><meshBasicMaterial color="#ff2f48"/></mesh><pointLight intensity={12} distance={3.2} color="#ff2f48"/><mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.32,.035,10,28]}/><meshBasicMaterial color="#ff5368"/></mesh><Html center position={[0,.6,0]} distanceFactor={9}><div className="whitespace-nowrap rounded-lg border border-red-400/60 bg-[#260810]/95 px-2 py-1 text-[9px] font-black text-red-200 shadow-[0_0_18px_rgba(255,47,72,.5)]">이상 부품 · {part}</div></Html></group>; }

function WorkerAvatar({ worker, position, selected, onSelect }) {
  const groupRef = useRef();
  const danger = worker.riskLevel === "HIGH";
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(clock.elapsedTime * 2.1 + Number(worker.workerId.slice(-1))) * .025;
  });
  const accent = danger ? "#ff354d" : selected ? "#ff9d38" : "#35e0ad";
  return <group ref={groupRef} position={position} onClick={(event) => { event.stopPropagation(); onSelect(worker); }}
    onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "default"; }}>
    <mesh castShadow position={[0,1.73,0]}><sphereGeometry args={[.22,18,18]}/><meshStandardMaterial color="#d8ab87" roughness={.7}/></mesh>
    <mesh castShadow position={[0,1.92,0]}><sphereGeometry args={[.25,18,18,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color={worker.ppe.helmet ? "#f2c744" : "#ff354d"} emissive={worker.ppe.helmet ? "#3a2900" : "#ff354d"} emissiveIntensity={danger ? 1.2 : .2}/></mesh>
    <mesh castShadow position={[0,1.18,0]}><capsuleGeometry args={[.24,.62,8,14]}/><meshStandardMaterial color="#e5762d" roughness={.55}/></mesh>
    <mesh position={[0,1.24,.23]}><boxGeometry args={[.28,.45,.025]}/><meshStandardMaterial color="#e8f04b" emissive="#8b8c12" emissiveIntensity={.4}/></mesh>
    {[-.17,.17].map((x) => <group key={x}><mesh castShadow position={[x,.49,0]} rotation={[0,0,x<0?-.08:.08]}><capsuleGeometry args={[.09,.62,6,10]}/><meshStandardMaterial color="#223a49"/></mesh><mesh castShadow position={[x,1.18,0]} rotation={[0,0,x<0?-.26:.26]}><capsuleGeometry args={[.075,.48,6,10]}/><meshStandardMaterial color="#d8ab87"/></mesh></group>)}
    <mesh position={[0,.03,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.42,.49,36]}/><meshBasicMaterial color={accent}/></mesh>
    {danger && <pointLight position={[0,1.1,0]} intensity={6} distance={2.5} color="#ff354d"/>}
    <Html center position={[0,2.55,0]} distanceFactor={9}><button onClick={() => onSelect(worker)} className={`whitespace-nowrap rounded-lg border px-2 py-1.5 text-left shadow-xl backdrop-blur-md ${danger ? "border-red-400/60 bg-[#250a11]/92" : selected ? "border-amber-400/40 bg-[#1c1608]/90" : "border-emerald-400/25 bg-[#07171a]/88"}`}><span className={`block text-[8px] font-black ${danger ? "text-red-300" : "text-emerald-300"}`}>{worker.workerId} · {worker.name}</span><small className="mt-0.5 block text-[8px] text-slate-400">{danger ? worker.riskReason : worker.task}</small></button></Html>
  </group>;
}

export default EquipmentTwinScene;
