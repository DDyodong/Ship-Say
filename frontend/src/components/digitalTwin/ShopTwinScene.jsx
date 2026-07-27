import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Minus, Plus, RotateCcw } from "lucide-react";

function ShopTwinScene({ snapshot, selectedRobot, onSelectRobot }) {
  const controlsRef = useRef();
  const robots = snapshot.robots || [];
  const danger = robots.some((robot) => robot.riskLevel !== "low");
  const changeZoom = (factor) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length() * factor;
    if (distance < 11 || distance > 42) return;
    camera.position.copy(controls.target.clone().add(offset.multiplyScalar(factor)));
    controls.update();
  };
  const resetCamera = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.object.position.set(18, 14, 22);
    controls.target.set(0, 1.4, 0);
    controls.update();
  };
  return <div className={`shop-three-shell ${danger ? "has-alarm" : ""}`}>
    <Canvas shadows dpr={[1, 1.7]} camera={{ position: [18, 14, 22], fov: 38, near: .1, far: 110 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#071720"]}/>
        <fog attach="fog" args={["#071720", 22, 48]}/>
        <hemisphereLight intensity={1.25} color="#d7f6ff" groundColor="#061016"/>
        <directionalLight castShadow position={[8, 14, 6]} intensity={2.6} color="#dff8ff"
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}/>
        <pointLight position={[0, 6, -4]} intensity={32} color="#4cdcff" distance={24}/>
        <ShopWorld snapshot={snapshot} robots={robots} selectedRobot={selectedRobot} onSelectRobot={onSelectRobot}/>
        <ContactShadows position={[0, -.04, 0]} scale={24} opacity={.55} blur={2.4} far={15}/>
        <OrbitControls ref={controlsRef} makeDefault target={[0, 1.4, 0]} enableDamping dampingFactor={.12}
          enableZoom={false} rotateSpeed={.25} panSpeed={.4} minDistance={11} maxDistance={42}
          minPolarAngle={.55} maxPolarAngle={1.42}/>
      </Suspense>
    </Canvas>
    <div className="shop-scene-status"><i className={danger ? "danger" : "normal"}/><div><b>{danger ? "설비 이상 감지" : "공정 정상 운전"}</b><span>실시간 텔레메트리 · {snapshot.dataSource === "SIMULATOR" ? "시뮬레이션 데이터" : snapshot.dataSource}</span></div></div>
    <div className="shop-camera-controls"><span>천천히 드래그하여 회전</span><button onClick={() => changeZoom(1.2)} aria-label="축소"><Minus/></button><button onClick={() => changeZoom(.82)} aria-label="확대"><Plus/></button><button onClick={resetCamera} aria-label="카메라 초기화"><RotateCcw/></button></div>
  </div>;
}

function ShopWorld({ snapshot, robots, selectedRobot, onSelectRobot }) {
  const blockX = -12 + Math.min(100, Math.max(0, snapshot.blockPositionPercent || 0)) * .24;
  const robotPositions = [
    [-5.3, .15, -4.2, false], [1.6, .15, -4.2, true],
    [-2.5, .15, 0, false], [4.2, .15, 0, true],
    [-6.3, .15, 4.2, false], [.8, .15, 4.2, true],
  ];
  return <group>
    <FactoryShell/>
    <Conveyor z={-4.2}/><Conveyor z={0}/><Conveyor z={4.2}/>
    <TBarBlock x={blockX} z={0}/><TBarBlock x={blockX - 5} z={-4.2}/><TBarBlock x={blockX + 4} z={4.2}/>
    <Gantry z={-4.2}/><Gantry z={0}/><Gantry z={4.2}/>
    {robots.map((robot, index) => {
      const [x, y, z, mirror] = robotPositions[index] || [8 + (index - 6) * 1.7, .15, 4.2, index % 2 === 1];
      return <Robot key={robot.assetCode} robot={robot} position={[x, y, z]} mirror={mirror}
        selected={selectedRobot?.assetCode === robot.assetCode} onSelect={onSelectRobot}/>;
    })}
    <MaterialZone/><InspectionZone/><ControlRoom/>
    <CameraUnit/>
    <SafetyFence/>
  </group>;
}

function FactoryShell() {
  return <group>
    <mesh receiveShadow position={[0, -.12, 0]}><boxGeometry args={[31, .22, 19]}/><meshStandardMaterial color="#152b34" roughness={.92}/></mesh>
    <mesh receiveShadow position={[0, .005, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[30.7, 18.7, 30, 18]}/><meshStandardMaterial color="#1e3a43" wireframe transparent opacity={.26}/></mesh>
    {[-14, -9.3, -4.6, 0, 4.6, 9.3, 14].map((x) => <group key={x}>
      <Beam position={[x, 3.2, -8.7]} scale={[.18, 6.4, .18]}/><Beam position={[x, 3.2, 8.7]} scale={[.18, 6.4, .18]}/>
      <Beam position={[x, 6.3, 0]} scale={[.18, .18, 17.6]}/>
    </group>)}
    {[-8.7, 8.7].map((z) => <group key={z}>
      <Beam position={[0, 6.4, z]} scale={[29, .22, .22]}/>
      <mesh position={[0, 3.1, z]}><boxGeometry args={[29, 5.7, .08]}/><meshStandardMaterial color="#0c222c" transparent opacity={.5}/></mesh>
    </group>)}
    {[-11, -7, -3, 1, 5, 9, 13].map((x) => <mesh key={x} position={[x, 6.05, 0]} rotation={[0, 0, 0]}>
      <boxGeometry args={[2.3, .06, .34]}/><meshStandardMaterial color="#c5f5ff" emissive="#9deeff" emissiveIntensity={2.6}/>
      <pointLight position={[0, -.4, 0]} intensity={7} distance={5.5} color="#d8f7ff"/>
    </mesh>)}
  </group>;
}

function Beam({ position, scale }) {
  return <mesh castShadow position={position}><boxGeometry args={scale}/><meshStandardMaterial color="#3a7081" metalness={.58} roughness={.34}/></mesh>;
}

function Conveyor({ z }) {
  return <group position={[0, .28, z]}>
    <RoundedBox castShadow receiveShadow args={[25, .35, 2.15]} radius={.12} smoothness={3}>
      <meshStandardMaterial color="#263b42" metalness={.7} roughness={.35}/>
    </RoundedBox>
    {Array.from({ length: 30 }).map((_, i) => <mesh key={i} castShadow position={[-11.8 + i * .82, .26, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[.09, .09, 1.85, 12]}/><meshStandardMaterial color="#8ba5ad" metalness={.8} roughness={.25}/>
    </mesh>)}
    {[-11.5, -7.6, -3.8, 0, 3.8, 7.6, 11.5].map((x) => <group key={x} position={[x, -.45, 0]}>
      <Beam position={[0, 0, -.72]} scale={[.18, 1, .18]}/><Beam position={[0, 0, .72]} scale={[.18, 1, .18]}/>
    </group>)}
  </group>;
}

function TBarBlock({ x, z }) {
  return <group position={[x, .78, z]}>
    <mesh castShadow><boxGeometry args={[2.25, .16, 1.25]}/><meshStandardMaterial color="#b7c9ce" metalness={.72} roughness={.23}/></mesh>
    <mesh castShadow position={[0, .48, 0]}><boxGeometry args={[2.15, .82, .14]}/><meshStandardMaterial color="#d4e1e4" metalness={.7} roughness={.2}/></mesh>
    <mesh position={[0, .95, 0]}><boxGeometry args={[2.22, .025, .18]}/><meshStandardMaterial color="#32d4ff" emissive="#149ac2" emissiveIntensity={3}/></mesh>
  </group>;
}

function Gantry({ z }) {
  return <group position={[0, 0, z]}>
    <Beam position={[-7.5, 3.25, 0]} scale={[.35, 6.3, .35]}/><Beam position={[7.5, 3.25, 0]} scale={[.35, 6.3, .35]}/>
    <Beam position={[0, 6.28, 0]} scale={[15.4, .38, .38]}/>
    <mesh castShadow position={[0, 5.85, 0]}><boxGeometry args={[1.4, .55, .8]}/><meshStandardMaterial color="#2398bd" metalness={.65}/></mesh>
    <mesh position={[0, 4.6, 0]}><cylinderGeometry args={[.04, .04, 2.2, 8]}/><meshStandardMaterial color="#bdd3d8" metalness={.8}/></mesh>
  </group>;
}

function Robot({ robot, position, mirror, selected, onSelect }) {
  const shoulder = useRef();
  const elbow = useRef();
  const state = robot?.operatingState || "IDLE";
  useFrame(({ clock }) => {
    if (!shoulder.current || !elbow.current) return;
    const active = state === "WELDING" || state === "TRACKING";
    const wave = active ? Math.sin(clock.elapsedTime * 1.1 + (mirror ? 1.5 : 0)) : 0;
    shoulder.current.rotation.z = (mirror ? -.72 : .72) + wave * .12;
    elbow.current.rotation.z = (mirror ? 1.15 : -1.15) + wave * .18;
  });
  if (!robot) return null;
  const alarm = robot.riskLevel !== "low";
  const accent = alarm ? "#ff5169" : selected ? "#ff8a23" : "#25c9ee";
  return <group position={position} onClick={(e) => { e.stopPropagation(); onSelect(robot); }}
    onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "default"; }}>
    <mesh castShadow position={[0, .3, 0]}><cylinderGeometry args={[.58, .72, .6, 24]}/><meshStandardMaterial color="#174a5d" metalness={.68}/></mesh>
    <mesh castShadow position={[0, .72, 0]}><cylinderGeometry args={[.34, .42, .5, 24]}/><meshStandardMaterial color={accent} metalness={.55} roughness={.28}/></mesh>
    <group ref={shoulder} position={[0, .94, 0]}>
      <ArmSegment length={1.7} color={accent}/>
      <group ref={elbow} position={[0, 1.55, 0]}>
        <ArmSegment length={1.45} color="#47b8d0" slim/>
        <group position={[0, 1.35, 0]}>
          <mesh castShadow><cylinderGeometry args={[.13, .18, .72, 16]}/><meshStandardMaterial color="#a9c7cd" metalness={.8}/></mesh>
          {state === "WELDING" && <WeldSpark/>}
        </group>
      </group>
    </group>
    <mesh position={[0, .08, 0]}><torusGeometry args={[.78, .035, 12, 40]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3}/></mesh>
    <Html center position={[0, 3.75, 0]} distanceFactor={10}><button className={`three-robot-label ${selected ? "selected" : ""}`} onClick={() => onSelect(robot)}>
      <span>{robot.assetCode}</span><b>{robot.assetName}</b><small>{state} · {Number(robot.currentAmp).toFixed(1)}A</small>
    </button></Html>
  </group>;
}

function ArmSegment({ length, color, slim }) {
  return <group>
    <mesh castShadow position={[0, length / 2, 0]}><capsuleGeometry args={[slim ? .16 : .24, length - .3, 10, 18]}/><meshStandardMaterial color={color} metalness={.62} roughness={.25}/></mesh>
    <mesh castShadow position={[0, length, 0]}><sphereGeometry args={[slim ? .22 : .3, 20, 20]}/><meshStandardMaterial color="#b8d4da" metalness={.7}/></mesh>
  </group>;
}

function WeldSpark() {
  const ref = useRef();
  useFrame(({ clock }) => { if (ref.current) ref.current.scale.setScalar(.72 + Math.sin(clock.elapsedTime * 18) * .25); });
  return <group ref={ref} position={[0, -.44, 0]}>
    <mesh><sphereGeometry args={[.11, 12, 12]}/><meshBasicMaterial color="#fff7d6"/></mesh>
    <pointLight color="#38dfff" intensity={22} distance={4}/>
  </group>;
}

function CameraUnit() {
  return <group position={[12.4, 3.8, -7.3]} rotation={[0, -.6, 0]}>
    <RoundedBox castShadow args={[1.05, .65, .65]} radius={.1}><meshStandardMaterial color="#1b5268" metalness={.65}/></RoundedBox>
    <mesh position={[-.58, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.22, .22, .28, 20]}/><meshStandardMaterial color="#47d8ff" emissive="#0c7896" emissiveIntensity={2}/></mesh>
    <Html center position={[0, -.72, 0]} distanceFactor={11}><div className="three-camera-label">CAM-12 · LIVE</div></Html>
  </group>;
}

function SafetyFence() {
  return <group position={[0, .8, 7.15]}>
    {Array.from({ length: 21 }).map((_, i) => <mesh key={i} position={[-14 + i * 1.4, 0, 0]}><boxGeometry args={[.06, 1.5, .06]}/><meshStandardMaterial color="#deae3d" metalness={.5}/></mesh>)}
    <mesh><boxGeometry args={[28, .07, .07]}/><meshStandardMaterial color="#e0ad38"/></mesh>
    <mesh position={[0, .75, 0]}><boxGeometry args={[28, .07, .07]}/><meshStandardMaterial color="#e0ad38"/></mesh>
  </group>;
}

function MaterialZone() {
  return <group position={[-12.3, .2, -6.5]}>
    {[-1.1, 0, 1.1].map((z) => <group key={z} position={[0, 0, z]}>{[0, .35, .7].map((y) => <mesh key={y} castShadow position={[0, y, 0]}><boxGeometry args={[3.6, .16, .72]}/><meshStandardMaterial color="#81979e" metalness={.7}/></mesh>)}</group>)}
    <Html center position={[0, 1.5, 0]} distanceFactor={13}><div className="shop-zone-tag">강재 대기 구역</div></Html>
  </group>;
}

function InspectionZone() {
  return <group position={[11.4, .3, 4.3]}>
    <RoundedBox castShadow args={[4.2, .55, 2.7]} radius={.12}><meshStandardMaterial color="#173d4b" metalness={.4}/></RoundedBox>
    {[-1.5, 1.5].map((x) => <Beam key={x} position={[x, 1.4, 0]} scale={[.16, 2.5, .16]}/>)}
    <Beam position={[0, 2.6, 0]} scale={[3.2, .16, .16]}/>
    <mesh position={[0, 2.25, 0]}><boxGeometry args={[1.4, .18, .35]}/><meshStandardMaterial color="#56d9f7" emissive="#1d9dbb" emissiveIntensity={2}/></mesh>
    <Html center position={[0, 3.25, 0]} distanceFactor={13}><div className="shop-zone-tag accent">용접 품질 검사</div></Html>
  </group>;
}

function ControlRoom() {
  return <group position={[11.8, 1.6, -5.7]}>
    <RoundedBox castShadow args={[4.8, 3.1, 3.2]} radius={.12}><meshStandardMaterial color="#173541" metalness={.25}/></RoundedBox>
    {[-1.45, 0, 1.45].map((x) => <mesh key={x} position={[x, .35, 1.62]}><boxGeometry args={[1.05, .9, .05]}/><meshStandardMaterial color="#66d7ee" emissive="#165d70" emissiveIntensity={1.8}/></mesh>)}
    <Html center position={[0, 2.1, 0]} distanceFactor={13}><div className="shop-zone-tag">SHOP 제어실</div></Html>
  </group>;
}

export default ShopTwinScene;
