import React, { Suspense, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Layers3, Minus, MousePointer2, Plus, RotateCcw } from "lucide-react";

const categories = [
  ["ALL", "전체 야드"], ["FABRICATION", "가공"], ["ASSEMBLY", "조립"],
  ["PAINTING", "도장"], ["OUTFITTING", "의장"], ["DOCK", "도크"],
];

const riskColors = {
  low: "#35e0ad",
  medium: "#ff9d38",
  high: "#ff5169",
  critical: "#ff2448",
};

function YardTwinScene({ facilities, onOpenShop, onUnavailable }) {
  const controlsRef = useRef();
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const visibleFacilities = useMemo(() => facilities.filter((facility) => filter === "ALL"
    || facility.type === filter
    || (filter === "DOCK" && facility.type === "QUAY")), [facilities, filter]);

  const selectFacility = (facility) => {
    setSelected(facility);
    if (facility.code === "T-BAR-SHOP") onOpenShop(facility.code);
  };

  const changeZoom = (factor) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length() * factor;
    if (distance < 14 || distance > 50) return;
    camera.position.copy(controls.target.clone().add(offset.multiplyScalar(factor)));
    controls.update();
  };

  const resetCamera = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.object.position.set(20, 23, 24);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return <div className="yard-three-shell">
    <div className="yard-three-toolbar">
      <div className="yard-filters"><Layers3/>{categories.map(([value, label]) => <button key={value}
        className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="three-camera-controls"><span><MousePointer2/> 천천히 드래그하여 회전</span><button onClick={() => changeZoom(1.2)} aria-label="축소"><Minus/></button><button onClick={() => changeZoom(.82)} aria-label="확대"><Plus/></button><button onClick={resetCamera} aria-label="카메라 초기화"><RotateCcw/></button></div>
    </div>
    <div className="yard-three-canvas">
      <Canvas shadows dpr={[1, 1.6]} camera={{ position: [20, 23, 24], fov: 36, near: .1, far: 150 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}>
        <Suspense fallback={null}>
          <color attach="background" args={["#06141d"]}/>
          <fog attach="fog" args={["#06141d", 30, 70]}/>
          <hemisphereLight intensity={1.25} color="#b8ecff" groundColor="#071017"/>
          <directionalLight castShadow position={[12, 24, 8]} intensity={2.4} color="#d9f5ff"
            shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-far={60}/>
          <pointLight position={[-10, 5, -7]} intensity={26} color="#18bfee" distance={25}/>
          <YardWorld facilities={visibleFacilities} selected={selected} onSelect={selectFacility}/>
          <ContactShadows position={[0, -.22, 0]} opacity={.55} scale={42} blur={2.5} far={18}/>
          <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={.12} target={[0, 0, 0]}
            enableZoom={false} rotateSpeed={.28} panSpeed={.45} minDistance={14} maxDistance={50}
            minPolarAngle={.55} maxPolarAngle={1.32}/>
        </Suspense>
      </Canvas>
      <div className="yard-scene-brand"><b>SMART YARD DIGITAL TWIN</b><span>GEO-REFERENCED OPERATIONS VIEW</span></div>
      <div className="yard-north"><b>N</b><i/></div>
      <div className="yard-map-summary">
        <span><i className="low"/>정상 {facilities.filter((f) => f.riskLevel === "low").length}</span>
        <span><i className="medium"/>주의 {facilities.filter((f) => f.riskLevel === "medium").length}</span>
        <span><i className="high"/>위험 {facilities.filter((f) => ["high", "critical"].includes(f.riskLevel)).length}</span>
        <small>시설 {facilities.length}개 · 도크/안벽/생산 SHOP 통합</small>
      </div>
    </div>
    {selected && selected.code !== "T-BAR-SHOP" && <div className="yard-selection-card modern">
      <button onClick={() => setSelected(null)}>×</button><span>{selected.type}</span><b>{selected.name}</b>
      <p>{selected.code} · 공정 진행률 {selected.progressPercent}%</p>
      <div className="selection-progress"><i style={{ width: `${selected.progressPercent}%` }}/></div>
      <button className="selection-action" onClick={() => onUnavailable(selected.name)}>상세 설비 연동 예정</button>
    </div>}
  </div>;
}

function YardWorld({ facilities, selected, onSelect }) {
  return <group>
    <Water/>
    <mesh receiveShadow position={[-1, -.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[38, 24]}/><meshStandardMaterial color="#14343d" roughness={.88} metalness={.12}/>
    </mesh>
    <RoadNetwork/>
    <HarborEdge/>
    {facilities.map((facility) => <Facility key={facility.code} facility={facility}
      selected={selected?.code === facility.code} onSelect={() => onSelect(facility)}/>)}
    <Cranes/>
  </group>;
}

function Water() {
  return <mesh receiveShadow position={[0, -.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[100, 100, 1, 1]}/>
    <meshStandardMaterial color="#063149" roughness={.3} metalness={.28}/>
  </mesh>;
}

function RoadNetwork() {
  const horizontal = [-7.4, -3.6, .4, 4.4, 8];
  const vertical = [-12, -6, 0, 6, 12];
  return <group position={[-1, -.08, 0]}>
    {horizontal.map((z) => <group key={z} position={[0, 0, z]}>
      <mesh receiveShadow><boxGeometry args={[35, .08, 1.05]}/><meshStandardMaterial color="#263b41" roughness={.95}/></mesh>
      <mesh position={[0, .05, 0]}><boxGeometry args={[34, .015, .06]}/><meshBasicMaterial color="#c9a44c"/></mesh>
    </group>)}
    {vertical.map((x) => <group key={x} position={[x, 0, 0]}>
      <mesh receiveShadow><boxGeometry args={[.9, .08, 22]}/><meshStandardMaterial color="#263b41" roughness={.95}/></mesh>
      <mesh position={[0, .05, 0]}><boxGeometry args={[.05, .015, 21]}/><meshBasicMaterial color="#b69749"/></mesh>
    </group>)}
  </group>;
}

function HarborEdge() {
  return <group position={[16.5, 0, 0]}>
    {[-6.8, -1.9, 3.3, 8].map((z, index) => <group key={z} position={[index % 2 ? -.3 : .2, 0, z]}>
      <mesh receiveShadow position={[0, -.05, 0]}><boxGeometry args={[4.8, .28, 3.3]}/><meshStandardMaterial color="#274957" metalness={.25}/></mesh>
      {index < 3 && <Ship position={[1.8, .15, 0]} scale={index === 2 ? 1.15 : .85}/>}
    </group>)}
  </group>;
}

function Ship({ position, scale = 1 }) {
  return <group position={position} scale={scale} rotation={[0, -.08, 0]}>
    <mesh castShadow><boxGeometry args={[4.4, .42, 1.6]}/><meshStandardMaterial color="#d4e3e8" roughness={.38} metalness={.2}/></mesh>
    <mesh castShadow position={[.5, .42, 0]}><boxGeometry args={[2.1, .52, 1.28]}/><meshStandardMaterial color="#edf5f6"/></mesh>
    <mesh castShadow position={[-1.45, .52, 0]}><boxGeometry args={[.65, .75, 1.2]}/><meshStandardMaterial color="#b7d1da"/></mesh>
    <mesh position={[1.3, .34, 0]}><boxGeometry args={[.08, .75, 1.72]}/><meshStandardMaterial color="#27c6e9" emissive="#0a5d75"/></mesh>
  </group>;
}

function Facility({ facility, selected, onSelect }) {
  const x = (facility.mapX - 46) * .31;
  const z = (facility.mapY - 45) * .21;
  const width = Math.max(1.7, facility.mapWidth * .19);
  const depth = Math.max(1.15, facility.mapHeight * .14);
  const isDock = facility.type === "DOCK";
  const isQuay = facility.type === "QUAY";
  const color = riskColors[facility.riskLevel] || riskColors.low;
  if (isDock || isQuay) return <Dock facility={facility} position={[x, 0, z]} width={width} depth={depth}
    selected={selected} color={color} onSelect={onSelect}/>;
  return <Building facility={facility} position={[x, 0, z]} width={width} depth={depth}
    selected={selected} color={color} onSelect={onSelect}/>;
}

function Building({ facility, position, width, depth, selected, color, onSelect }) {
  const height = facility.code === "T-BAR-SHOP" ? 1.5 : .8 + (facility.mapHeight % 5) * .1;
  const openable = facility.code === "T-BAR-SHOP";
  return <group position={position} onClick={(e) => { e.stopPropagation(); onSelect(); }}
    onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "default"; }}>
    <RoundedBox castShadow receiveShadow args={[width, height, depth]} radius={.08} smoothness={3} position={[0, height / 2, 0]}>
      <meshStandardMaterial color={selected || openable ? "#17657c" : "#254b58"} roughness={.5} metalness={.35}
        emissive={selected ? color : "#061015"} emissiveIntensity={selected ? .42 : .08}/>
    </RoundedBox>
    <mesh castShadow position={[0, height + .12, 0]} rotation={[0, 0, .025]}>
      <boxGeometry args={[width * 1.04, .16, depth * 1.05]}/><meshStandardMaterial color="#4595a8" metalness={.48} roughness={.35}/>
    </mesh>
    {[-.3, 0, .3].map((ratio) => <mesh key={ratio} position={[ratio * width, height * .45, depth / 2 + .011]}>
      <boxGeometry args={[Math.max(.14, width * .12), height * .38, .025]}/><meshStandardMaterial color="#85d9e9" emissive="#126279" emissiveIntensity={.6}/>
    </mesh>)}
    <StatusBeacon position={[width * .38, height + .38, -depth * .25]} color={color}/>
    {(selected || openable) && <Html center position={[0, height + .85, 0]} distanceFactor={13} zIndexRange={[10, 0]}>
      <div className={`three-facility-label ${openable ? "primary" : ""}`}>
        <span>{facility.code}</span><b>{facility.name}</b><small>{facility.progressPercent}% 진행 · {openable ? "클릭하여 SHOP 진입" : "시설 선택"}</small>
      </div>
    </Html>}
  </group>;
}

function Dock({ facility, position, width, depth, selected, color, onSelect }) {
  return <group position={position} onClick={(e) => { e.stopPropagation(); onSelect(); }}
    onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "default"; }}>
    <mesh receiveShadow position={[0, -.02, 0]}><boxGeometry args={[width * 1.1, .18, depth * 1.2]}/><meshStandardMaterial color={selected ? "#185e76" : "#163746"} metalness={.3}/></mesh>
    <mesh position={[0, .08, 0]}><boxGeometry args={[width * .82, .06, depth * .72]}/><meshStandardMaterial color="#075071" metalness={.35} roughness={.3}/></mesh>
    <Ship position={[0, .26, 0]} scale={Math.min(.8, width / 5.2)}/>
    <StatusBeacon position={[width * .42, .55, -depth * .4]} color={color}/>
    {selected && <Html center position={[0, 1.15, 0]} distanceFactor={13}><div className="three-facility-label"><span>{facility.code}</span><b>{facility.name}</b><small>건조 공정 {facility.progressPercent}%</small></div></Html>}
  </group>;
}

function StatusBeacon({ position, color }) {
  return <group position={position}>
    <mesh><cylinderGeometry args={[.04, .04, .32, 12]}/><meshStandardMaterial color="#9eb9c1" metalness={.7}/></mesh>
    <mesh position={[0, .2, 0]}><sphereGeometry args={[.095, 18, 18]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={4}/></mesh>
    <pointLight position={[0, .2, 0]} color={color} intensity={2.5} distance={2.2}/>
  </group>;
}

function Cranes() {
  return <group>
    {[[-13, -8], [-6, 7.7], [5, 7.6], [12, 7.2], [13, -6]].map(([x, z], index) => <group key={index} position={[x, 0, z]} scale={.75}>
      <mesh castShadow position={[0, 1, 0]}><boxGeometry args={[.22, 2, .22]}/><meshStandardMaterial color="#e4ad36" metalness={.55}/></mesh>
      <mesh castShadow position={[.8, 1.9, 0]}><boxGeometry args={[1.8, .18, .18]}/><meshStandardMaterial color="#f0b73c" metalness={.55}/></mesh>
      <mesh position={[1.55, 1.25, 0]}><boxGeometry args={[.05, 1.2, .05]}/><meshStandardMaterial color="#d7a232"/></mesh>
    </group>)}
  </group>;
}

export default YardTwinScene;
