import React, { Suspense, useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Box, RotateCcw, ScanLine } from "lucide-react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 오버헤드 스튜디오 조명(RectAreaLight)을 쓰려면 한 번 초기화가 필요하다.
if (typeof window !== "undefined") RectAreaLightUniformsLib.init();

const EQUIPMENT_IVORY = "#e8e1d3";
const EQUIPMENT_IVORY_LIGHT = "#f3ede2";
const EQUIPMENT_IVORY_SHADE = "#cbc4b8";
const EQUIPMENT_MECHANICAL = "#4d5353";
const EQUIPMENT_WHEEL = "#252b2d";

const CAD_IVORY_MATERIAL = new THREE.MeshStandardMaterial({
  color: EQUIPMENT_IVORY,
  roughness: 0.52,
  metalness: 0.24,
});

const DEFAULT_LAYOUT = [
  { position: [-5.5, 0, -3.2], rotationY: 0 },
  { position: [5.5, 0, -3.2], rotationY: 0 },
  { position: [-5.5, 0, 3.2], rotationY: 0 },
  { position: [5.5, 0, 3.2], rotationY: 0 },
];

// 공정별 실제 작업 흐름을 읽을 수 있도록 대형 설비는 후면, 보조 설비는 측면,
// 이송 설비는 전면에 배치하고 중앙에는 작업 통로를 남긴다.
const EQUIPMENT_LAYOUTS = {
  ASSEMBLY: [
    // 긴 중앙 이송축을 기준으로 포지셔너·용접 로봇은 측면 작업 셀,
    // 품질 검사기는 컨베이어를 가로지르는 포털형 검사 게이트로 둔다.
    { position: [-1.1, 0, -1.15], rotationY: -Math.PI / 2 },
    { position: [-5.15, 0, -2.55], rotationY: 0 },
    { position: [0, 0, 1], rotationY: 0 },
    { position: [4.7, 0, 1], rotationY: Math.PI / 2 },
  ],
  CUTTING: [
    { position: [-4.4, 0, .8], rotationY: Math.PI / 2 },
    { position: [0, 0, .8], rotationY: 0 },
    { position: [-4.9, 0, -3.45], rotationY: 0 },
    { position: [4.9, 0, -3.45], rotationY: 0 },
  ],
  SMALLPART: [
    { position: [-4.4, 0, 1], rotationY: Math.PI / 2 },
    { position: [0, 0, -1.1], rotationY: -Math.PI / 2 },
    { position: [0, 0, 1], rotationY: 0 },
    { position: [-5.2, 0, -3.45], rotationY: 0 },
  ],
  PAINT: [
    { position: [-6.1, 0, 3], rotationY: 0 },
    { position: [-5.2, 0, -9.25], rotationY: 0 },
    { position: [5.2, 0, -9.25], rotationY: 0 },
    { position: [6.1, 0, 3], rotationY: Math.PI },
    { position: [-3.9, 0, 5.8], rotationY: 0 },
    { position: [3.9, 0, 5.8], rotationY: Math.PI },
  ],
  DOCK: [
    { position: [0, 0, -4.5], rotationY: 0 },
    { position: [-6, 0, 3.1], rotationY: 0 },
    { position: [7.2, 0, 2.7], rotationY: Math.PI / 2 },
  ],
  OUTFITTING: [
    { position: [-5.2, 0, -2.45], rotationY: 0 },
    { position: [-1.75, 0, 2.45], rotationY: Math.PI },
    { position: [1.75, 0, -2.45], rotationY: 0 },
    { position: [5.2, 0, -9.25], rotationY: 0 },
  ],
  OFFSHORE: [
    { position: [0, 0, 0], rotationY: 0 },
    { position: [-4.4, 0, 0], rotationY: 0 },
    { position: [4.25, 0, 0], rotationY: 0 },
    { position: [8.4, 0, 5.7], rotationY: 0 },
  ],
};

// 컨베이어·로봇 셀·대형 크레인처럼 공정축에 고정되는 설비는 정렬을 유지한다.
// 펌프·팬·대차 같은 보조 설비에만 공장 코드 기반의 작은 변형을 적용해,
// 같은 프로필을 쓰는 공장도 복사한 듯 똑같아 보이지 않도록 한다.
const FIXED_PROCESS_KINDS = new Set(["ROBOT", "CONVEYOR", "INSPECTOR", "CUTTER", "BLOCK_CRANE", "GOLIATH"]);
const CONCEPT_LAYOUT_VARIANTS = [
  { x: .36, z: -.2, rotation: .055 },
  { x: -.28, z: .34, rotation: -.07 },
  { x: .18, z: .42, rotation: .09 },
  { x: -.42, z: -.16, rotation: -.045 },
];

const OUTFITTING_SECONDARY_LAYOUT = {
  "파이프 벤딩 머신": { position: [-5, 0, -3.1], rotationY: 0 },
  "수압 시험 펌프": { position: [0, 0, 2.8], rotationY: Math.PI },
  "배관 자동 용접기": { position: [4.2, 0, -3.2], rotationY: Math.PI },
  "국소 배기 장치": { position: [5.2, 0, -9.25], rotationY: 0 },
};

function rotateFactoryPlacement(placement, angle, offsetX = 0, offsetZ = 0) {
  const [x, y, z] = placement.position;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    position: [x * cos - z * sin + offsetX, y, x * sin + z * cos + offsetZ],
    rotationY: placement.rotationY + angle,
  };
}

function withFacilityLayoutVariation(asset, placement, facilityCode, index) {
  if (facilityCode === "TAG-25" && OUTFITTING_SECONDARY_LAYOUT[asset.name]) return OUTFITTING_SECONDARY_LAYOUT[asset.name];
  const assemblyLayoutTransform = {
    "TAG-1": { angle: -.075, x: -.2, z: .25 },
    "TAG-2": { angle: .12, x: .25, z: -.2 },
    "TAG-4": { angle: -.14, x: .1, z: .15 },
  }[facilityCode];
  if (assemblyLayoutTransform) return rotateFactoryPlacement(
    placement,
    assemblyLayoutTransform.angle,
    assemblyLayoutTransform.x,
    assemblyLayoutTransform.z,
  );
  if (asset.fixedLayout || asset.lineSync || FIXED_PROCESS_KINDS.has(asset.kind)) return placement;
  const facilityNumber = Number(String(facilityCode || "0").match(/\d+/)?.[0] || 0);
  const variant = CONCEPT_LAYOUT_VARIANTS[(facilityNumber + index) % CONCEPT_LAYOUT_VARIANTS.length];
  const mobility = asset.kind === "TRANSPORTER" ? 1.35 : ["PUMP", "FAN"].includes(asset.kind) ? 1 : .62;
  const variedX = placement.position[0] + variant.x * mobility;
  const dockMinimumQuayX = asset.kind === "TRANSPORTER" ? 7 : 5.85;
  const dockQuayX = ["TAG-22", "TAG-23"].includes(facilityCode) && ["PUMP", "TRANSPORTER"].includes(asset.kind)
    ? Math.sign(placement.position[0]) * Math.max(dockMinimumQuayX, Math.abs(variedX))
    : variedX;
  return {
    position: [dockQuayX, placement.position[1], placement.position[2] + variant.z * mobility],
    rotationY: placement.rotationY + variant.rotation * mobility,
  };
}

const LABEL_POSITION_BY_KIND = {
  ROBOT: [0, 4.35, 0],
  INSPECTOR: [0, 3.35, 0],
  POSITIONER: [0, 2.45, 0],
  BENDER: [0, 3.15, 0],
  CONVEYOR: [0, 1.75, 0],
  TRANSPORTER: [0, 2.25, 0],
  CUTTER: [0, 3.55, 0],
  FAN: [0, 3.25, 0],
  PUMP: [0, 2.35, 0],
  CRANE: [0, 5.1, 0],
  BLOCK_CRANE: [0, 8.35, 0],
  GOLIATH: [0, 8.35, 0],
};

const SELECTION_RING_SCALE_BY_KIND = {
  ROBOT: [1.05, 1.05, 1],
  INSPECTOR: [1.9, 1.05, 1],
  POSITIONER: [1.35, 1.1, 1],
  BENDER: [1.8, 1.05, 1],
  CONVEYOR: [2.35, .85, 1],
  TRANSPORTER: [2.05, 1.05, 1],
  CUTTER: [2, 1.15, 1],
  FAN: [1.3, 1.05, 1],
  PUMP: [1.5, .9, 1],
  CRANE: [2.25, .85, 1],
  BLOCK_CRANE: [10.5, 1.5, 1],
  GOLIATH: [10.5, 1.5, 1],
};

// 로봇 관절 끝단은 경량 GLB를 재사용한다. 나머지 설비는 화면에서 직접 구성한
// 프로시저럴 모델을 사용해 대용량 CAD가 배포 결과물에 포함되지 않게 한다.
const CAD_BASE_PATH = "/cad";
const gltfLoader = new GLTFLoader();
let robotHeadPromise = null;

function normalizeCadGroup(group, targetHeight) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = targetHeight / Math.max(size.y, 1e-6);
  group.scale.multiplyScalar(scale);
  group.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  group.position.x -= center.x;
  group.position.z -= center.z;
  group.position.y -= scaledBox.min.y;
  group.updateMatrixWorld(true);
  return group;
}

function loadRobotHeadGroup() {
  if (robotHeadPromise) return robotHeadPromise;
  robotHeadPromise = gltfLoader.loadAsync(`${CAD_BASE_PATH}/robot-head.glb`).then((gltf) => {
    const group = gltf.scene;
    group.traverse((child) => {
      if (!child.isMesh) return;
      child.material = CAD_IVORY_MATERIAL;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return normalizeCadGroup(group, .72);
  });
  return robotHeadPromise;
}

// 작업자는 3D로 표현하지 않는다 — 실제 GPS/UWB 위치 연동 전까지는 좌표를 지어낼 수밖에 없고,
// 그건 "진짜 위치"처럼 보여서 오해를 준다. 작업자 목록·위험도는 FactoryDetailTwin 사이드
// 패널(목록 클릭 → chooseWorker)에서만 보여준다.
function EquipmentTwinScene({ factory, selectedAsset, onSelectAsset }) {
  const controlsRef = useRef();
  const cameraPosition = factory.profileKey === "DOCK" ? [18, 12, 22] : [13.5, 8.5, 16];
  const dockState = factory.profileKey === "DOCK" && factory.code === "TAG-23" ? "FLOODING" : "DRY_BUILDING";
  const alarmIndex = factory.equipment.findIndex((asset) => asset.fault);
  const layout = EQUIPMENT_LAYOUTS[factory.profileKey] || DEFAULT_LAYOUT;
  const placements = factory.equipment.map((asset, index) => withFacilityLayoutVariation(asset, layout[index] || DEFAULT_LAYOUT[index] || {
    position: [index * 3 - 4.5, 0, 0],
    rotationY: 0,
  }, factory.code, index));
  const resetCamera = () => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(...cameraPosition);
    controlsRef.current.target.set(0, 1.5, 0);
    controlsRef.current.update();
  };
  return <div className="twin-preserve-dark relative h-[610px] overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#06111a]">
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: cameraPosition, fov: factory.profileKey === "DOCK" ? 40 : 38, near: .1, far: 140 }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#06111a"]}/><fog attach="fog" args={["#06111a", 30, 70]}/>
        <Environment preset="studio" environmentIntensity={0.7}/>
        <hemisphereLight intensity={0.55} color="#f4f7f9" groundColor="#171c21"/>
        <directionalLight castShadow position={[10, 15, 10]} intensity={2.3} color="#fff6e6" shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0015}/>
        <pointLight position={[0, 7, 0]} intensity={5} color="#ffffff" distance={30} decay={2}/>
        <FactoryFloor profileKey={factory.profileKey} dockState={dockState}/>
        <FactoryContext profileKey={factory.profileKey} facilityCode={factory.code}/>
        {factory.profileKey === "ASSEMBLY" && <AssemblySafetyPartitions/>}
        <SafetyZone alarmPosition={placements[alarmIndex]?.position}/>
        {factory.equipment.map((asset, index) => <MachineUnit key={asset.assetCode} asset={asset} {...placements[index]}
          selected={selectedAsset?.assetCode === asset.assetCode} onSelect={onSelectAsset}/>) }
        <ContactShadows position={[0, -.04, 0]} scale={38} opacity={.58} blur={2.5} far={15}/>
        <OrbitControls ref={controlsRef} makeDefault target={[0, 1.5, 0]} enableDamping dampingFactor={.1} minDistance={8} maxDistance={48} minPolarAngle={.45} maxPolarAngle={1.45}/>
      </Suspense>
    </Canvas>
    <div className="absolute left-4 top-4 rounded-xl border border-white/10 bg-[#07131e]/85 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[9px] font-black tracking-[.15em] text-cyan-300"><ScanLine size={13}/> EQUIPMENT TWIN</div>
      <p className="mt-1 text-[10px] text-slate-400">설비를 선택하면 부품 단위 진단 정보가 연동됩니다.</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="sim-badge inline-flex">VALIDATION MODE</span>
      </div>
    </div>
    <button onClick={resetCamera} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-[#07131e]/85 text-slate-300 backdrop-blur-xl hover:text-white" aria-label="3D 화면 초기화"><RotateCcw size={15}/></button>
    {factory.profileKey === "DOCK" && <div className={`absolute bottom-4 right-4 rounded-xl border px-3 py-2 text-[9px] font-black backdrop-blur-xl ${dockState === "FLOODING" ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-200" : "border-amber-300/25 bg-[#1a1710]/90 text-amber-200"}`}><span className="block text-[8px] tracking-[.14em] opacity-70">DOCK CONDITION</span>{dockState === "FLOODING" ? "FLOODING · 침수 진행" : "DRY BUILDING · 선박 건조 중"}</div>}
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

function SafetyPartition({ position, rotationY = 0, width }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    <mesh castShadow position={[0,.94,0]}>
      <boxGeometry args={[width,1.28,.06]}/>
      <meshStandardMaterial color="#202a30" metalness={.32} roughness={.58} transparent opacity={.76} side={THREE.DoubleSide}/>
    </mesh>
    {[-width/2,width/2].map((x) => <mesh key={x} castShadow position={[x,.92,0]}>
      <boxGeometry args={[.08,1.62,.09]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.62} roughness={.4}/>
    </mesh>)}
    <mesh position={[0,1.75,0]}><boxGeometry args={[width+.1,.08,.09]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.62} roughness={.4}/></mesh>
    <mesh position={[0,.1,0]}><boxGeometry args={[width+.14,.1,.2]}/><meshStandardMaterial color="#d6a52c" metalness={.3} roughness={.5}/></mesh>
  </group>;
}

function AssemblySafetyPartitions() {
  return <group>
    <SafetyPartition position={[-1.1,0,-2.55]} width={3}/>
    <SafetyPartition position={[-2.62,0,-2.05]} rotationY={Math.PI/2} width={1}/>
    <SafetyPartition position={[.42,0,-2.05]} rotationY={Math.PI/2} width={1}/>
  </group>;
}

// 레퍼런스 이미지의 체크무늬 스틸 바닥판(diamond plate)을 절차적으로 굽는다.
// 컬러맵 + (하이트맵에서 뽑아낸) 노멀맵을 같이 써서 조명이 닿을 때 실제 요철처럼 반응하게 만든다.
function useDiamondPlateTexture() {
  return useMemo(() => {
    const size = 512;
    const height = document.createElement("canvas");
    height.width = height.height = size;
    const hctx = height.getContext("2d");
    hctx.fillStyle = "#7d7d7d";
    hctx.fillRect(0, 0, size, size);
    const cell = 32;
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const cx = x + cell / 2, cy = y + cell / 2;
        const grad = hctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, cell * 0.46);
        grad.addColorStop(0, "#eeeeee");
        grad.addColorStop(0.55, "#8f8f8f");
        grad.addColorStop(1, "#5f5f5f");
        hctx.fillStyle = grad;
        hctx.beginPath();
        hctx.moveTo(cx, cy - cell * 0.42);
        hctx.lineTo(cx + cell * 0.42, cy);
        hctx.lineTo(cx, cy + cell * 0.42);
        hctx.lineTo(cx - cell * 0.42, cy);
        hctx.closePath();
        hctx.fill();
      }
    }
    const albedo = new THREE.CanvasTexture(height);
    albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
    albedo.repeat.set(14, 10);
    albedo.colorSpace = THREE.SRGBColorSpace;

    // 하이트맵 → 간단한 소벨로 노멀맵 근사
    const img = hctx.getImageData(0, 0, size, size).data;
    const at = (x, y) => {
      const xi = (x + size) % size, yi = (y + size) % size;
      return img[(yi * size + xi) * 4] / 255;
    };
    const nCanvas = document.createElement("canvas");
    nCanvas.width = nCanvas.height = size;
    const nctx = nCanvas.getContext("2d");
    const nImg = nctx.createImageData(size, size);
    const strength = 2.4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
        const nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const idx = (y * size + x) * 4;
        nImg.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
        nImg.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        nImg.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        nImg.data[idx + 3] = 255;
      }
    }
    nctx.putImageData(nImg, 0, 0);
    const normalMap = new THREE.CanvasTexture(nCanvas);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(14, 10);

    return { map: albedo, normalMap };
  }, []);
}

// 벽면용 파형 강판(corrugated metal siding) 텍스처 — 바닥과 같은 방식(하이트맵→노멀맵)으로 절차 생성.
function useWallTexture() {
  return useMemo(() => {
    const w = 512, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#cfd3d6";
    ctx.fillRect(0, 0, w, h);
    const ridge = 14;
    for (let x = 0; x < w; x += ridge) {
      const grad = ctx.createLinearGradient(x, 0, x + ridge, 0);
      grad.addColorStop(0, "#eef1f2");
      grad.addColorStop(0.5, "#aeb3b7");
      grad.addColorStop(1, "#eef1f2");
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, ridge, h);
    }
    ctx.strokeStyle = "rgba(55,60,64,0.25)";
    ctx.lineWidth = 3;
    for (let y = 0; y <= h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const albedo = new THREE.CanvasTexture(c);
    albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
    albedo.repeat.set(10, 2.4);
    albedo.colorSpace = THREE.SRGBColorSpace;

    const img = ctx.getImageData(0, 0, w, h).data;
    const at = (x, y) => { const xi = (x + w) % w, yi = (y + h) % h; return img[(yi * w + xi) * 4] / 255; };
    const nCanvas = document.createElement("canvas");
    nCanvas.width = w; nCanvas.height = h;
    const nctx = nCanvas.getContext("2d");
    const nImg = nctx.createImageData(w, h);
    const strength = 1.6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
        const nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const idx = (y * w + x) * 4;
        nImg.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
        nImg.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        nImg.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        nImg.data[idx + 3] = 255;
      }
    }
    nctx.putImageData(nImg, 0, 0);
    const normalMap = new THREE.CanvasTexture(nCanvas);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(10, 2.4);

    return { map: albedo, normalMap };
  }, []);
}

// 뒤쪽 + 양옆 3면 벽. 카메라를 마주보는 앞쪽은 뚫어둬서 항상 안이 보이게 한다.
// 위쪽엔 채광창 느낌의 밝은 띠, 바닥 쪽엔 어두운 걸레받이(kickplate)를 둬서 붕 뜬 느낌을 없앤다.
function FactoryWalls() {
  const { map, normalMap } = useWallTexture();
  const wallHeight = 8.6;
  const wallY = wallHeight / 2;
  const mat = <meshStandardMaterial map={map} normalMap={normalMap} normalScale={[.45, .45]} color="#e9ebec" metalness={.15} roughness={.78}/>;
  const kick = <meshStandardMaterial color="#3a4148" metalness={.35} roughness={.55}/>;
  return <group>
    <mesh receiveShadow position={[0, wallY, -11.4]}><boxGeometry args={[31, wallHeight, .3]}/>{mat}</mesh>
    <mesh receiveShadow position={[-15.4, wallY, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[23, wallHeight, .3]}/>{mat}</mesh>
    <mesh receiveShadow position={[15.4, wallY, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[23, wallHeight, .3]}/>{mat}</mesh>
    <mesh position={[0, wallHeight - .55, -11.36]}><boxGeometry args={[31, .9, .06]}/><meshStandardMaterial color="#dff1ff" emissive="#bfe6ff" emissiveIntensity={1.1}/></mesh>
    <mesh position={[-15.36, wallHeight - .55, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[23, .9, .06]}/><meshStandardMaterial color="#dff1ff" emissive="#bfe6ff" emissiveIntensity={1.1}/></mesh>
    <mesh position={[15.36, wallHeight - .55, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[23, .9, .06]}/><meshStandardMaterial color="#dff1ff" emissive="#bfe6ff" emissiveIntensity={1.1}/></mesh>
    <mesh position={[0, .35, -11.25]}><boxGeometry args={[31, .7, .1]}/>{kick}</mesh>
    <mesh position={[-15.25, .35, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[23, .7, .1]}/>{kick}</mesh>
    <mesh position={[15.25, .35, 0]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[23, .7, .1]}/>{kick}</mesh>
    {[-10.8, -3.6, 3.6, 10.8].map((x) => <mesh key={x} castShadow position={[x, wallHeight / 2, -11.2]}><boxGeometry args={[.4, wallHeight, .4]}/><meshStandardMaterial color="#b9bec2" metalness={.3} roughness={.5}/></mesh>)}
  </group>;
}

// 레퍼런스처럼 노란 안전 가드레일을 바닥 둘레에 둘러준다.
function SafetyRailing() {
  const yellow = "#f5b400";
  const railMat = <meshStandardMaterial color={yellow} metalness={.25} roughness={.4}/>;
  const runs = [
    [-14.6, -10, -14.6, 10],
    [14.6, -10, 14.6, 10],
  ];
  return <group>
    {runs.map(([x1, z1, x2, z2], i) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const angle = Math.atan2(z2 - z1, x2 - x1);
      return <group key={i}>
        <mesh castShadow position={[(x1 + x2) / 2, .85, (z1 + z2) / 2]} rotation={[0, -angle, 0]}><boxGeometry args={[len, .07, .07]}/>{railMat}</mesh>
        <mesh castShadow position={[(x1 + x2) / 2, .4, (z1 + z2) / 2]} rotation={[0, -angle, 0]}><boxGeometry args={[len, .07, .07]}/>{railMat}</mesh>
        {Array.from({ length: 7 }).map((_, j) => {
          const t = j / 6;
          return <mesh key={j} castShadow position={[x1 + (x2 - x1) * t, .5, z1 + (z2 - z1) * t]}><cylinderGeometry args={[.045, .045, 1, 10]}/>{railMat}</mesh>;
        })}
      </group>;
    })}
  </group>;
}

// 초기 카메라가 위에서 내려다보므로 천장판/수평 트러스는 그리지 않고 조명과 측면 기둥만 둔다.
// 수평 구조물을 보이게 만들면 설비보다 카메라에 먼저 걸려 현장 전체를 가리게 된다.
function OverheadStructure({ accent }) {
  return <group>
    {[-11, -6.6, -2.2, 2.2, 6.6, 11].map((x) => <group key={x}>
      <rectAreaLight width={2.4} height={.45} intensity={6} color="#fff8ec" position={[x, 6.55, 0]} rotation={[-Math.PI / 2, 0, 0]}/>
    </group>)}
    {[-13.5,13.5].map((x)=><group key={x}>{[-9,0,9].map((z)=><mesh key={z} castShadow position={[x,3.2,z]}><boxGeometry args={[.26,6.4,.26]}/><meshStandardMaterial color={accent} metalness={.3} roughness={.55}/></mesh>)}</group>)}
  </group>;
}

const CONTEXT_STEEL = "#66747a";
const CONTEXT_STEEL_DARK = "#3e4b51";
const CONTEXT_WOOD = "#7b6446";
const CONTEXT_YELLOW = "#b88924";

function PlateStack({ position, rotationY = 0, count = 5, width = 3.4, depth = 1.8 }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    <MaterialPallet width={width + .35} depth={depth + .3}/>
    {Array.from({length: count}).map((_, index) => <mesh key={index} castShadow position={[0, .28 + index * .075, 0]}>
      <boxGeometry args={[width, .055, depth]}/><meshStandardMaterial color={index % 2 ? CONTEXT_STEEL : "#7b888d"} metalness={.76} roughness={.42}/>
    </mesh>)}
    {[-width * .32, width * .32].map((x) => <mesh key={x} position={[x, .5, 0]}><boxGeometry args={[.055, .04, depth + .08]}/><meshStandardMaterial color="#b8732d" metalness={.45} roughness={.48}/></mesh>)}
  </group>;
}

function MaterialPallet({ position = [0, 0, 0], rotationY = 0, width = 2.4, depth = 1.45 }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    {[[-depth * .38], [0], [depth * .38]].map(([z], index) => <mesh key={index} castShadow position={[0, .08, z]}><boxGeometry args={[width, .14, .18]}/><meshStandardMaterial color={CONTEXT_WOOD} roughness={.78}/></mesh>)}
    {[-width * .38, 0, width * .38].map((x) => <mesh key={x} castShadow position={[x, .18, 0]}><boxGeometry args={[.18, .12, depth]}/><meshStandardMaterial color="#957951" roughness={.76}/></mesh>)}
  </group>;
}

function PartsBin({ position, rotationY = 0, color = "#54666f" }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    <mesh castShadow position={[0, .48, 0]}><boxGeometry args={[1.45, .9, 1.05]}/><meshStandardMaterial color={color} metalness={.52} roughness={.5}/></mesh>
    <mesh position={[0, .92, 0]}><boxGeometry args={[1.3, .08, .9]}/><meshStandardMaterial color="#263238" metalness={.62} roughness={.42}/></mesh>
    {[-.58, .58].flatMap((x) => [-.38, .38].map((z) => <mesh key={`${x}-${z}`} position={[x, .08, z]}><cylinderGeometry args={[.07, .07, .12, 10]}/><meshStandardMaterial color="#252b2d" roughness={.8}/></mesh>))}
  </group>;
}

function BlockSection({ position, rotationY = 0, scale = 1, painted = false }) {
  const shellColor = painted ? "#6e8792" : CONTEXT_STEEL_DARK;
  return <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
    <RoundedBox castShadow args={[4.4, 1.05, 2.6]} position={[0, .68, 0]} radius={.18} smoothness={3}><meshStandardMaterial color={shellColor} metalness={.68} roughness={painted ? .38 : .48}/></RoundedBox>
    <mesh castShadow position={[0, 1.45, 0]}><boxGeometry args={[3.65, .5, 2.05]}/><meshStandardMaterial color={painted ? "#869ca4" : "#77858a"} metalness={.62} roughness={.43}/></mesh>
    {[-1.3, 0, 1.3].map((x) => <mesh key={x} position={[x, 1.78, 0]}><boxGeometry args={[.11, .55, 2.12]}/><meshStandardMaterial color="#9d6b2f" metalness={.46} roughness={.48}/></mesh>)}
  </group>;
}

function PipeRack({ position, rotationY = 0 }) {
  const pipeColors = ["#6e7c82", "#7b898e", "#55656c"];
  return <group position={position} rotation={[0, rotationY, 0]}>
    {[-1.7, 1.7].map((x) => <group key={x}>{[-.68, .68].map((z) => <mesh key={z} position={[x, .72, z]}><boxGeometry args={[.14, 1.35, .14]}/><meshStandardMaterial color={CONTEXT_YELLOW} metalness={.4} roughness={.5}/></mesh>)}</group>)}
    {[.48, 1.02].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[3.65, .12, 1.65]}/><meshStandardMaterial color="#3f4b50" metalness={.58} roughness={.47}/></mesh>)}
    {pipeColors.flatMap((color, row) => [-.48, 0, .48].map((z, index) => <mesh key={`${row}-${index}`} castShadow position={[0, .62 + row * .28, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.11 + row * .025, .11 + row * .025, 3.35, 16]}/><meshStandardMaterial color={color} metalness={.72} roughness={.37}/></mesh>))}
  </group>;
}

function HoseReel({ position, rotationY = 0 }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    <mesh castShadow position={[0, .85, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.72, .72, .42, 24]}/><meshStandardMaterial color="#45545a" metalness={.58} roughness={.46}/></mesh>
    <mesh position={[0, .85, .24]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.48, .1, 10, 28]}/><meshStandardMaterial color="#b86f32" roughness={.55}/></mesh>
    {[-.52, .52].map((x) => <mesh key={x} position={[x, .45, 0]}><boxGeometry args={[.12, .9, .62]}/><meshStandardMaterial color={CONTEXT_YELLOW} metalness={.38} roughness={.5}/></mesh>)}
  </group>;
}

function ServicePlatform({ position, rotationY = 0 }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    {[-1.15, 1.15].flatMap((x) => [-.62, .62].map((z) => <mesh key={`${x}-${z}`} castShadow position={[x, .78, z]}><boxGeometry args={[.1, 1.55, .1]}/><meshStandardMaterial color={CONTEXT_YELLOW} metalness={.42} roughness={.48}/></mesh>))}
    <mesh castShadow position={[0, 1.48, 0]}><boxGeometry args={[2.55, .14, 1.45]}/><meshStandardMaterial color="#626d70" metalness={.62} roughness={.44}/></mesh>
    {[-1.15, 1.15].map((x) => <mesh key={x} position={[x, 1.98, 0]}><boxGeometry args={[.07, .95, 1.35]}/><meshStandardMaterial color={CONTEXT_YELLOW} metalness={.4} roughness={.48}/></mesh>)}
    {[-.58, .58].map((z) => <mesh key={z} position={[0, 2.42, z]}><boxGeometry args={[2.4, .07, .07]}/><meshStandardMaterial color={CONTEXT_YELLOW} metalness={.4} roughness={.48}/></mesh>)}
    {Array.from({length: 5}).map((_, index) => <mesh key={index} position={[-1.27, .28 + index * .28, 0]}><boxGeometry args={[.08, .06, 1.25]}/><meshStandardMaterial color="#4c585c" metalness={.55} roughness={.48}/></mesh>)}
  </group>;
}

function PipeSpoolCart({ position, rotationY = 0 }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    <RoundedBox castShadow args={[3.1, .24, 1.4]} position={[0, .38, 0]} radius={.07} smoothness={3}><meshStandardMaterial color="#4b5a60" metalness={.56} roughness={.5}/></RoundedBox>
    {[-1.15, 1.15].flatMap((x) => [-.55, .55].map((z) => <mesh key={`${x}-${z}`} position={[x, .16, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.16, .16, .12, 14]}/><meshStandardMaterial color="#252b2d" roughness={.78}/></mesh>))}
    <mesh castShadow position={[0, 1.02, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.18, .18, 2.55, 18]}/><meshStandardMaterial color="#74848a" metalness={.72} roughness={.36}/></mesh>
    {[-1.05, 1.05].map((x) => <mesh key={x} position={[x, 1.02, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.52, .12, 10, 26]}/><meshStandardMaterial color="#64747a" metalness={.68} roughness={.39}/></mesh>)}
  </group>;
}

function FabricationTrestles({ position, rotationY = 0 }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    {[-1.25, 1.25].map((z) => <group key={z} position={[0, 0, z]}>
      {[-1.55, 1.55].map((x) => <mesh key={x} castShadow position={[x, .48, 0]} rotation={[0, 0, x < 0 ? -.22 : .22]}><boxGeometry args={[.22, 1.05, .32]}/><meshStandardMaterial color="#77633f" metalness={.36} roughness={.58}/></mesh>)}
      <mesh castShadow position={[0, .92, 0]}><boxGeometry args={[3.45, .22, .48]}/><meshStandardMaterial color="#8c7449" metalness={.32} roughness={.6}/></mesh>
    </group>)}
  </group>;
}

function OutfittingExhaustDuct({ facilityCode }) {
  const ductMaterial = <meshStandardMaterial color="#9daeb4" metalness={.68} roughness={.34}/>;
  const hood = facilityCode === "TAG-25" ? { x: 4.2, z: -3.2 } : { x: 1.75, z: -2.45 };
  const wallX = 5.2;
  const zLength = Math.abs(-9.15 - hood.z);
  const xLength = Math.abs(wallX - hood.x);
  return <group>
    <mesh castShadow position={[wallX,3.15,-9.15]}><cylinderGeometry args={[.34,.34,3.9,18]}/>{ductMaterial}</mesh>
    <mesh castShadow position={[wallX,5.05,(-9.15 + hood.z) / 2]} rotation={[Math.PI / 2,0,0]}><cylinderGeometry args={[.34,.34,zLength,18]}/>{ductMaterial}</mesh>
    <mesh castShadow position={[(wallX + hood.x) / 2,5.05,hood.z]} rotation={[0,0,Math.PI / 2]}><cylinderGeometry args={[.34,.34,xLength,18]}/>{ductMaterial}</mesh>
    <mesh castShadow position={[hood.x,4.25,hood.z]}><cylinderGeometry args={[.32,.32,1.6,18]}/>{ductMaterial}</mesh>
    <mesh castShadow position={[hood.x,3.25,hood.z]} rotation={[0,0,Math.PI]}><coneGeometry args={[.72,.75,20,1,true]}/>{ductMaterial}</mesh>
  </group>;
}

function FactoryConveyorVariation({ profileKey, facilityCode }) {
  const factoryNumber = Number(String(facilityCode || "0").match(/\d+/)?.[0] || 0);
  if (profileKey === "ASSEMBLY") {
    const presets = [
      { position: [-6.25,0,-1.45], rotationY: Math.PI / 2, length: 4.1 },
      { position: [5.75,0,3.05], rotationY: Math.PI / 2, length: 4.35 },
      { position: [4.9,0,-2.15], rotationY: -Math.PI / 2, length: 5.15 },
    ];
    const presetIndex = { "TAG-1": 0, "TAG-2": 1, "TAG-4": 2 }[facilityCode] ?? factoryNumber % presets.length;
    const preset = presets[presetIndex];
    return <group position={preset.position} rotation={[0,preset.rotationY,0]}>
      <ConveyorMachine accent="#0091c2" alarm={false} warning={false} running seed={110 + factoryNumber} conveyorLength={preset.length} workpieceStyle="ASSEMBLY_BLOCK" workpieceCount={0}/>
    </group>;
  }
  if (profileKey === "PAINT") {
    const presets = [
      { position: [-7.8,0,6], rotationY: 0, length: 4.6 },
      { position: [0,0,2.75], rotationY: Math.PI / 2, length: 5.1 },
      { position: [7.8,0,6], rotationY: Math.PI, length: 4.6 },
    ];
    const presetIndex = { "TAG-20": 0, "TAG-21": 1, "TAG-24": 2 }[facilityCode] ?? factoryNumber % presets.length;
    const preset = presets[presetIndex];
    return <group position={preset.position} rotation={[0,preset.rotationY,0]}>
      <ConveyorMachine accent="#d97a1f" alarm={false} warning={false} running seed={140 + factoryNumber} conveyorLength={preset.length} workpieceStyle="STEEL_PLATE" workpieceCount={1}/>
    </group>;
  }
  return null;
}

function OffshoreMaterialBay({ facilityCode }) {
  const presetIndex = { "TAG-16": 0, "TAG-18": 1, "TAG-19": 2 }[facilityCode] ?? 0;
  const presets = [
    { stack: [8.4,0,8.25], stackRotation: 0, conveyor: [8.4,0,7.05], conveyorRotation: Math.PI / 2, conveyorLength: 2.4, bin: [11.55,0,5.75] },
    { stack: [11.65,0,5.7], stackRotation: Math.PI / 2, conveyor: [10.45,0,5.7], conveyorRotation: 0, conveyorLength: 2.4, bin: [11.45,0,8.15] },
    { stack: [8.4,0,2.25], stackRotation: 0, conveyor: [8.4,0,4.05], conveyorRotation: Math.PI / 2, conveyorLength: 2.5, bin: [11.45,0,2.9] },
  ];
  const preset = presets[presetIndex];
  return <group>
    <PlateStack position={preset.stack} rotationY={preset.stackRotation} count={6} width={4.35} depth={1.8}/>
    <group position={preset.conveyor} rotation={[0,preset.conveyorRotation,0]}><ConveyorMachine accent="#3a7d8c" alarm={false} warning={false} running seed={170 + presetIndex} conveyorLength={preset.conveyorLength} workpieceStyle="STEEL_PLATE" workpieceCount={1}/></group>
    <PartsBin position={preset.bin} rotationY={-.08} color="#59686d"/>
  </group>;
}

function FactoryContext({ profileKey, facilityCode }) {
  if (profileKey === "DOCK") return null;
  if (profileKey === "ASSEMBLY") return <group>
    <FactoryConveyorVariation profileKey={profileKey} facilityCode={facilityCode}/>
    <PlateStack position={[-10.2, 0, 6.6]} rotationY={.08} count={6}/>
    <MaterialPallet position={[10.5, 0, 6.6]} rotationY={-.12}/>
    <BlockSection position={[10.1, .25, -6.7]} rotationY={-.05} scale={.65}/>
  </group>;
  if (profileKey === "CUTTING") return <group>
    <PlateStack position={[9.6, 0, 5.8]} rotationY={-.08} count={8} width={4.1} depth={2.1}/>
    <PartsBin position={[10.3, 0, -5.7]} rotationY={.12}/><PartsBin position={[8.45, 0, -6]} rotationY={-.08} color="#665d4d"/>
  </group>;
  if (profileKey === "SMALLPART") return <group>
    <PartsBin position={[9.8, 0, 5.8]} rotationY={.12}/><PartsBin position={[8.05, 0, 6.15]} rotationY={-.08} color="#526d68"/>
    <MaterialPallet position={[10.2, 0, -6.2]} rotationY={-.16} width={2.1} depth={1.3}/>
  </group>;
  if (profileKey === "PAINT") return <group>
    <FactoryConveyorVariation profileKey={profileKey} facilityCode={facilityCode}/>
    <BlockSection position={[0, .1, 5.9]} rotationY={.03} scale={.82} painted/>
    <HoseReel position={[-10.2, 0, 5.8]} rotationY={.18}/><ServicePlatform position={[4, 0, 5.5]} rotationY={-.07}/><MaterialPallet position={[10.3, 0, -5.8]} rotationY={-.09}/>
  </group>;
  if (profileKey === "OUTFITTING") return <group>
    <OutfittingConveyorNetwork facilityCode={facilityCode}/>
    <OutfittingExhaustDuct facilityCode={facilityCode}/>
    <PipeRack position={[0, 0, 5.9]} rotationY={-.04}/>
    <PipeSpoolCart position={[0, 0, -5.7]} rotationY={.08}/><PartsBin position={[-10.2, 0, -5.8]} rotationY={.15} color="#4d666d"/><MaterialPallet position={[10.1, 0, 5.8]} rotationY={-.1}/>
  </group>;
  if (profileKey === "OFFSHORE") return <group>
    <FabricationTrestles position={[0, 0, 0]}/><BlockSection position={[0, .78, 0]} scale={1.18}/>
    <OffshoreMaterialBay facilityCode={facilityCode}/>
    <PlateStack position={[-10.4, 0, 7.4]} rotationY={.08} count={4}/>
  </group>;
  return null;
}

function KeelBlocks() {
  return <group>{[-5.2, -2.6, 0, 2.6, 5.2].flatMap((z) => [-1.35, 1.35].map((x) => <group key={`${x}-${z}`} position={[x, .16, z]}>
    <mesh castShadow><boxGeometry args={[.72, .32, .72]}/><meshStandardMaterial color="#a28455" roughness={.76}/></mesh>
    <mesh castShadow position={[0, .25, 0]} rotation={[0, 0, x < 0 ? -.12 : .12]}><boxGeometry args={[.58, .22, .66]}/><meshStandardMaterial color="#c3a06a" roughness={.7}/></mesh>
  </group>))}</group>;
}

function DockShip({ flooded }) {
  const hullColor = flooded ? "#496572" : "#59676d";
  return <group position={[0, flooded ? 1 : 1.25, .6]}>
    <mesh castShadow rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, .36]}><capsuleGeometry args={[2.05, 8.8, 8, 28]}/><meshStandardMaterial color={hullColor} metalness={.7} roughness={.38}/></mesh>
    <RoundedBox castShadow args={[3.55, .32, 8.4]} position={[0, .82, 0]} radius={.08} smoothness={3}><meshStandardMaterial color={flooded ? "#81959d" : "#76848a"} metalness={.6} roughness={.43}/></RoundedBox>
    {[-3.2, -1.6, 0, 1.6, 3.2].map((z) => <mesh key={z} position={[0, 1.14, z]}><boxGeometry args={[3.3, .08, .12]}/><meshStandardMaterial color="#b47832" metalness={.46} roughness={.48}/></mesh>)}
    <RoundedBox castShadow args={[2.25, .9, 1.5]} position={[0, 1.38, 2.2]} radius={.08} smoothness={3}><meshStandardMaterial color="#aab6ba" metalness={.4} roughness={.48}/></RoundedBox>
  </group>;
}

function DockEnvironment({ dockState }) {
  const flooded = dockState === "FLOODING";
  return <group>
    <mesh receiveShadow position={[0, -.2, 0]}><boxGeometry args={[30, .3, 22]}/><meshStandardMaterial color="#747c7f" metalness={.42} roughness={.68}/></mesh>
    <mesh receiveShadow position={[0, -.08, 0]}><boxGeometry args={[10.2, .12, 19.4]}/><meshStandardMaterial color="#27363c" metalness={.28} roughness={.72}/></mesh>
    {[-5.35, 5.35].map((x) => <mesh key={x} castShadow receiveShadow position={[x, .16, 0]}><boxGeometry args={[.5, .62, 20]}/><meshStandardMaterial color="#9ba0a0" metalness={.34} roughness={.7}/></mesh>)}
    {[-9.8, 9.8].map((z) => <mesh key={z} castShadow receiveShadow position={[0, .13, z]}><boxGeometry args={[10.7, .52, .48]}/><meshStandardMaterial color="#8b9294" metalness={.32} roughness={.7}/></mesh>)}
    {!flooded && <><KeelBlocks/><mesh position={[-2.7, .02, -6.6]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.7, .7, 1]}><circleGeometry args={[1, 32]}/><meshStandardMaterial color="#33484f" transparent opacity={.5} roughness={.18}/></mesh></>}
    {flooded && <mesh position={[0, .38, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[9.7, 18.9, 12, 20]}/><meshStandardMaterial color="#237d99" transparent opacity={.72} metalness={.12} roughness={.2}/></mesh>}
    <DockShip flooded={flooded}/>
    {[-8.7, 8.7].flatMap((x) => [-7, -2.4, 2.4, 7].map((z) => <group key={`${x}-${z}`} position={[x, .15, z]}>
      <mesh castShadow position={[0, .25, 0]}><cylinderGeometry args={[.18, .24, .5, 14]}/><meshStandardMaterial color="#c49b32" metalness={.42} roughness={.5}/></mesh>
      <mesh position={[0, .52, 0]}><torusGeometry args={[.2, .055, 8, 18]}/><meshStandardMaterial color="#3e4649" metalness={.55} roughness={.5}/></mesh>
    </group>))}
  </group>;
}

function FactoryFloor({ profileKey, dockState }) {
  const { map, normalMap } = useDiamondPlateTexture();
  if (profileKey === "DOCK") return <DockEnvironment dockState={dockState}/>;
  const accent = { ASSEMBLY: "#0091c2", CUTTING: "#1f9d76", PAINT: "#d97a1f", DOCK: "#8b5fc9", OUTFITTING: "#2fa3ad" }[profileKey] || "#3a7d8c";
  return <group>
    <mesh receiveShadow position={[0, -.15, 0]}>
      <boxGeometry args={[30, .25, 22]}/>
      <meshStandardMaterial map={map} normalMap={normalMap} normalScale={[.6, .6]} color="#dfe2e5" metalness={.65} roughness={.4}/>
    </mesh>
    <FactoryWalls/>
    <SafetyRailing/>
    <OverheadStructure accent={accent}/>
  </group>;
}

// 정상/경고/고장 3단계에 걸쳐 속도·흔들림을 이 훅 하나로 통일한다.
// alarm일 때는 부드러운 사인파 대신 여러 고주파를 섞은 jitter를 더해 "삐걱거리는" 느낌을 낸다.
// (Math.random 대신 시간 기반 합성이라 리렌더돼도 흔들림이 튀지 않고, seed로 설비마다 위상이 달라진다)
function faultJitter(t, seed = 0) {
  return (Math.sin(t * 27 + seed) + Math.sin(t * 41 + seed * 1.7) + Math.sin(t * 63 + seed * 2.3)) / 3;
}
function speedMultiplier(alarm, warning) { return alarm ? 2.4 : warning ? 1.4 : 1; }
const ASSEMBLY_TRAVEL_SPAN = 13.8;
function assemblyBlockX(t) {
  return ((t * .38) % ASSEMBLY_TRAVEL_SPAN) - ASSEMBLY_TRAVEL_SPAN / 2;
}
function assemblyStationActivity(t, stationX, radius = 1.6) {
  return THREE.MathUtils.smoothstep(radius - Math.abs(assemblyBlockX(t) - stationX), 0, radius);
}
const SMALLPART_TRAVEL_SPAN = 12.8;
function smallPartWorkpieceX(t, offset = 0) {
  return ((t * .72 + offset) % SMALLPART_TRAVEL_SPAN) - SMALLPART_TRAVEL_SPAN / 2;
}
function smallPartStationActivity(t, stationX, radius = 1.45) {
  return [0, SMALLPART_TRAVEL_SPAN / 2].reduce((activity, offset) => {
    const proximity = THREE.MathUtils.smoothstep(radius - Math.abs(smallPartWorkpieceX(t, offset) - stationX), 0, radius);
    return Math.max(activity, proximity);
  }, 0);
}

function MachineUnit({ asset, position, rotationY = 0, selected, onSelect }) {
  const alarm = Boolean(asset.fault);
  const warning = !alarm && asset.status === "WARNING";
  const running = asset.operatingState === "RUNNING";
  const seed = asset.assetCode.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 100;
  const accent = alarm ? "#ff3b4f" : selected ? "#ff9d38" : warning ? "#ffb23e" : "#23c8ee";
  const issuePositions = { ROBOT:[0,2.3,0], INSPECTOR:[0,2.45,0], POSITIONER:[0,1.1,.4], BENDER:[0,2.15,0], CONVEYOR:[2.5,.55,0], TRANSPORTER:[1.7,.5,1], CUTTER:[0,2.3,0], FAN:[0,1.65,.55], PUMP:[.7,.8,0], CRANE:[0,3.8,0], BLOCK_CRANE:[0,6.75,0], GOLIATH:[0,6.75,0] };

  const motion = {
    accent,
    alarm,
    warning,
    running,
    seed,
    utilization: asset.utilization,
    conveyorLength: asset.conveyorLength,
    workpieceStyle: asset.workpieceStyle,
    lineSync: asset.lineSync,
    lineStationX: asset.lineStationX,
    toolType: asset.toolType,
    liveCondition: asset.liveCondition,
  };
  const fallback = <KindFallback kind={asset.kind} motion={motion}/>;
  const labelPosition = asset.labelPosition || LABEL_POSITION_BY_KIND[asset.kind] || [0, 3.5, 0];
  const ringScale = asset.selectionRingScale || SELECTION_RING_SCALE_BY_KIND[asset.kind] || [1, 1, 1];

  return <group position={position} rotation={[0, rotationY, 0]} onClick={(event)=>{event.stopPropagation();onSelect(asset);}} onPointerOver={()=>{document.body.style.cursor="pointer";}} onPointerOut={()=>{document.body.style.cursor="default";}}>
    {fallback}
    {alarm && <pointLight position={[0, ["GOLIATH", "BLOCK_CRANE"].includes(asset.kind) ? 6.6 : 1.21, 0]} intensity={10} distance={4} color="#ff2f48"/>}
    <mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]} scale={ringScale}><ringGeometry args={[1.2,1.28,48]}/><meshBasicMaterial color={accent}/></mesh>
    {alarm && <FaultMarker position={issuePositions[asset.kind]} part={asset.fault.part} seed={seed}/>}
    <Html center position={labelPosition}><button onClick={()=>onSelect(asset)} className={`min-w-[118px] rounded-lg border px-2.5 py-2 text-left shadow-xl backdrop-blur-md ${alarm?"border-red-400/60 bg-[#230b12]/95":"border-cyan-400/35 bg-[#07151f]/95"}`}><span className={`block text-[8px] font-black tracking-wider ${alarm?"text-red-300":"text-cyan-300"}`}>{asset.assetCode}</span><b className="mt-0.5 block whitespace-nowrap text-[10px] text-white">{asset.name}</b><small className={`mt-0.5 block text-[8px] ${alarm?"text-red-300":"text-slate-500"}`}>{alarm?asset.fault.symptom:`${asset.operatingState} · 운전 부하 ${asset.utilization}%`}</small></button></Html>
  </group>;
}

function KindFallback({ kind, motion }) {
  switch (kind) {
    case "ROBOT": return <RobotMachine {...motion}/>;
    case "INSPECTOR": return <InspectorMachine {...motion}/>;
    case "POSITIONER": return <PositionerMachine {...motion}/>;
    case "BENDER": return <PipeBenderMachine {...motion}/>;
    case "CONVEYOR": return <ConveyorMachine {...motion}/>;
    case "TRANSPORTER": return <TransporterMachine {...motion}/>;
    case "CUTTER": return <CutterMachine {...motion}/>;
    case "FAN": return <FanMachine {...motion}/>;
    case "PUMP": return <PumpMachine {...motion}/>;
    case "CRANE": return <CraneMachine {...motion}/>;
    case "BLOCK_CRANE": return <GoliathCraneMachine {...motion}/>;
    case "GOLIATH": return <GoliathCraneMachine {...motion}/>;
    default: return null;
  }
}

function RobotCadHead() {
  const [head, setHead] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadRobotHeadGroup()
      .then((loaded) => { if (!cancelled) setHead(loaded.clone(true)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return head
    ? <primitive object={head}/>
    : <mesh><cylinderGeometry args={[.12,.07,.55,14]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.6} roughness={.38}/></mesh>;
}

function RobotMachine({accent,alarm,warning,running,seed,utilization=0,lineSync,lineStationX=0,toolType="WELDER",liveCondition}) {
  const waist = useRef();
  const shoulder = useRef();
  const elbow = useRef();
  const wrist = useRef();
  const weldingArc = useRef();
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const utilizationRate = THREE.MathUtils.clamp(utilization / 100, 0, 1);
    const speed = liveCondition
      ? THREE.MathUtils.lerp(.82, 1.06, utilizationRate)
      : speedMultiplier(alarm, warning);
    const cycleSpeed = THREE.MathUtils.lerp(.48, .92, utilizationRate) * speed;
    const phase = t * cycleSpeed + seed;
    const stationActivity = liveCondition
      ? (liveCondition.workpieceAtRobot ? 1 : 0)
      : lineSync === "SMALLPART"
        ? smallPartStationActivity(t, lineStationX)
        : lineSync === "ASSEMBLY" ? assemblyStationActivity(t, lineStationX) : 1;
    const wave = running ? Math.sin(phase) * stationActivity : 0;
    const instability = liveCondition?.movementInstability || 0;
    const jitterAmplitude = liveCondition
      ? (running ? instability * .025 : 0)
      : alarm ? .09 : 0;
    const jitter = faultJitter(t, seed) * jitterAmplitude;
    if (waist.current) waist.current.rotation.y = (running ? Math.sin(phase * .55) * THREE.MathUtils.lerp(.08, .18, utilizationRate) * stationActivity : 0) + jitter * .22;
    if (shoulder.current) shoulder.current.rotation.z = -.9 + wave * THREE.MathUtils.lerp(.05, .11, utilizationRate) + jitter;
    if (elbow.current) elbow.current.rotation.z = -1.1 + (running ? Math.sin(phase + .85) * THREE.MathUtils.lerp(.08, .15, utilizationRate) * stationActivity : 0) + jitter * 1.4;
    if (wrist.current) wrist.current.rotation.z = 1.08 + (running ? Math.sin(phase * 1.35 + 1.4) * .08 * stationActivity : 0) + jitter * .8;
    if (weldingArc.current) {
      const materialInRange = !lineSync || stationActivity > .18;
      const arcInstability = liveCondition?.arcInstability || 0;
      const arcSignal = Math.sin(t * (10 + arcInstability * 22) + seed);
      const stableArc = liveCondition ? arcSignal > (-.9 + arcInstability * 1.15) : Math.sin(phase * 2.2) > -.35;
      const toolActive = running && materialInRange && (toolType !== "WELDER" || stableArc);
      weldingArc.current.visible = toolActive;
      const pulse = .8 + Math.abs(Math.sin(t * (24 + arcInstability * 20) + seed)) * (.45 + arcInstability * .3);
      weldingArc.current.scale.setScalar(pulse);
    }
  });
  return <group>
    <RoundedBox castShadow args={[1.45,.22,1.25]} position={[0,.13,0]} radius={.08} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.34} roughness={.5}/></RoundedBox>
    <group ref={waist} position={[0,.25,0]}>
      <mesh castShadow position={[0,.35,0]}><cylinderGeometry args={[.58,.7,.7,28]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.5}/></mesh>
      <mesh castShadow position={[0,.82,0]}><cylinderGeometry args={[.4,.5,.35,28]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.25} roughness={.47}/></mesh>
      <mesh position={[0,.84,.43]}><sphereGeometry args={[.09,14,14]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh>
      <group ref={shoulder} position={[0,1.05,0]}>
        <Arm length={1.55}/>
        <group ref={elbow} position={[0,1.42,0]}>
          <Arm length={1.22}/>
          <group ref={wrist} position={[0,1.13,0]}>
            <mesh castShadow position={[0,.16,0]}><cylinderGeometry args={[.13,.17,.32,16]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.56} roughness={.4}/></mesh>
            <group position={[0,.42,0]} rotation={[0,0,Math.PI]}><RobotCadHead/></group>
            <mesh castShadow position={[0,-.18,0]} rotation={[0,0,.18]}><cylinderGeometry args={[.08,.11,.42,14]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.68} roughness={.34}/></mesh>
            <mesh castShadow position={[-.04,-.47,0]} rotation={[0,0,.18]}><coneGeometry args={[.055,.24,14]}/><meshStandardMaterial color="#30383b" metalness={.72} roughness={.3}/></mesh>
            <group ref={weldingArc} visible={false} position={[-.08,-.62,0]}>
              {toolType === "WELDER" && <><mesh><sphereGeometry args={[.11,12,12]}/><meshBasicMaterial color="#b9f4ff" toneMapped={false}/></mesh>
              <pointLight color="#65dcff" intensity={7} distance={2.6}/></>}
              {toolType === "WELDER" && [
                [-.22,-.14,.04], [.18,-.11,-.05], [-.13,-.25,-.12],
                [.26,-.22,.1], [.06,-.3,.16], [-.28,-.31,.08],
              ].map((position,index) => <mesh key={index} position={position}>
                <sphereGeometry args={[.025,8,8]}/><meshBasicMaterial color={index%2 ? "#ffb44d" : "#d8f8ff"} toneMapped={false}/>
              </mesh>)}
              {toolType === "PAINTER" && <group position={[0,-.28,0]} rotation={[0,0,Math.PI]}>
                <mesh><coneGeometry args={[.24,.7,16,1,true]}/><meshBasicMaterial color="#67d1db" transparent opacity={.28} depthWrite={false} toneMapped={false}/></mesh>
                {[[-.13,.42,.05],[.12,.5,-.06],[-.2,.6,-.08],[.19,.66,.09],[0,.74,.02]].map((position,index) => <mesh key={index} position={position}>
                  <sphereGeometry args={[.035 + index * .004,8,8]}/><meshBasicMaterial color="#9ee7e8" transparent opacity={.56} depthWrite={false} toneMapped={false}/>
                </mesh>)}
              </group>}
              {toolType === "MARKER" && <mesh position={[0,-.16,0]}>
                <cylinderGeometry args={[.012,.012,.32,8]}/><meshBasicMaterial color={accent} transparent opacity={.9} toneMapped={false}/>
              </mesh>}
            </group>
          </group>
        </group>
      </group>
    </group>
  </group>;
}
function Arm({length}) { return <group><mesh castShadow position={[0,length/2,0]}><capsuleGeometry args={[.2,length-.3,8,16]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.48}/></mesh><mesh position={[0,length,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.28,.28,.36,20]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.3} roughness={.42}/></mesh><mesh position={[.19,length*.55,.03]}><torusGeometry args={[.13,.025,8,18]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.55} roughness={.4}/></mesh></group>; }

function InspectorMachine({accent,alarm,warning,running,seed,liveCondition}) {
  const scanner = useRef();
  const scanBeam = useRef();
  useFrame(({clock}) => {
    if (!scanner.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .025 : 0;
    const inspectionActive = liveCondition ? liveCondition.workpieceAtInspection : running;
    scanner.current.position.x = (inspectionActive ? Math.sin(t * .55 * speed + seed) * .62 : 0) + jitter;
    if (scanBeam.current) scanBeam.current.visible = inspectionActive;
  });
  return <group>
    {[-1.05,1.05].map((x) => <group key={x}>
      <mesh castShadow position={[x,1.5,0]}><boxGeometry args={[.18,2.55,.18]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh>
      <RoundedBox castShadow args={[.52,.12,.52]} position={[x,.08,0]} radius={.035} smoothness={2}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.34} roughness={.5}/></RoundedBox>
    </group>)}
    <mesh castShadow position={[0,2.73,0]}><boxGeometry args={[2.45,.24,.3]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.48}/></mesh>
    <mesh castShadow position={[0,2.98,0]}><boxGeometry args={[1.1,.28,.62]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.28} roughness={.46}/></mesh>
    {[-.92,.92].map((x) => <mesh key={`brace-${x}`} position={[x,2.38,0]} rotation={[0,0,x < 0 ? -.42 : .42]}>
      <boxGeometry args={[.08,.72,.1]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.32} roughness={.46}/>
    </mesh>)}
    <group ref={scanner} position={[0,2.48,0]}>
      <RoundedBox castShadow args={[.58,.42,.58]} radius={.06} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.24} roughness={.45}/></RoundedBox>
      <mesh position={[0,-.43,0]}><cylinderGeometry args={[.07,.04,.48,12]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.55}/></mesh>
      <mesh ref={scanBeam} visible={!liveCondition} position={[0,-1.04,0]}><cylinderGeometry args={[.018,.018,.82,8]}/><meshBasicMaterial color={accent} transparent opacity={.8} toneMapped={false}/></mesh>
    </group>
  </group>;
}

function PositionerMachine({accent,alarm,warning,running,seed,lineSync}) {
  const table = useRef();
  useFrame(({clock}) => {
    if (!table.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .04 : 0;
    const rotation = (running ? t * .6 * speed : 0) + jitter;
    if (lineSync === "OFFSHORE") table.current.rotation.x = rotation;
    else table.current.rotation.y = rotation;
  });
  return <group><RoundedBox castShadow args={[2.5,.75,1.9]} position={[0,.42,0]} radius={.15}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.28} roughness={.54}/></RoundedBox><group ref={table} position={[0,1.05,0]}><mesh castShadow rotation={lineSync === "OFFSHORE" ? [0,0,Math.PI/2] : [0,0,0]}><cylinderGeometry args={[.85,.85,.3,32]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.48}/></mesh><mesh position={[.6,.02,0]}><boxGeometry args={[.18,.1,.18]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh>{lineSync === "OFFSHORE" && <group><mesh castShadow position={[-1.35,0,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.18,.18,2.1,18]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.66} roughness={.36}/></mesh><mesh castShadow position={[-2.35,0,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.72,.72,.22,24]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.36} roughness={.44}/></mesh></group>}</group>{lineSync !== "OFFSHORE" && <mesh position={[0,1.5,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.13,.13,2.3,16]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.3} roughness={.45}/></mesh>}</group>; }

function PipeBenderMachine({accent,alarm,warning,running,seed}) {
  const press = useRef();
  useFrame(({clock}) => {
    if (!press.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const stroke = running ? (Math.sin(t * .7 * speed + seed) + 1) * .11 : 0;
    const jitter = alarm ? faultJitter(t, seed) * .02 : 0;
    press.current.position.y = 2.12 - stroke + jitter;
  });
  return <group>
    <RoundedBox castShadow args={[3.8,.46,2.05]} position={[0,.3,0]} radius={.1} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.54}/></RoundedBox>
    {[-1.45,1.45].map((x) => <mesh key={x} castShadow position={[x,1.45,0]}><boxGeometry args={[.28,2.35,.34]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.25} roughness={.5}/></mesh>)}
    <mesh castShadow position={[0,2.55,0]}><boxGeometry args={[3.2,.28,.42]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.25} roughness={.48}/></mesh>
    {[-.65,.65].map((x) => <mesh key={x} position={[x,1.05,.18]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.38,.38,.42,20]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.52} roughness={.42}/></mesh>)}
    <group ref={press} position={[0,2.12,.18]}><mesh><cylinderGeometry args={[.16,.16,1.15,16]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.35} roughness={.42}/></mesh><mesh position={[0,-.62,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.32,.32,.42,20]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?1.7:.45}/></mesh></group>
    <mesh position={[0,.92,.2]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.12,.12,3.25,18]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.42} roughness={.38}/></mesh>
  </group>;
}

const CONVEYOR_LENGTH = 5.3;
const CONVEYOR_STRIP_COUNT = 4;

function OutfittingConveyorNetwork({ facilityCode }) {
  const accent = "#21b8c7";
  const secondary = facilityCode === "TAG-25";
  const mainZ = secondary ? -1.2 : 0;
  const mainLength = secondary ? 10.8 : 12.5;
  const branches = secondary ? [
    { x: -5, z: -2.15, length: 1.9 },
    { x: 0, z: .8, length: 4 },
    { x: 4.2, z: -2.2, length: 2 },
  ] : [
    { x: -5.2, z: -1.25, length: 2.5 },
    { x: -1.75, z: 1.25, length: 2.5 },
    { x: 1.75, z: -1.25, length: 2.5 },
  ];
  return <group>
    <group position={[0,0,mainZ]}><ConveyorMachine accent={accent} alarm={false} warning={false} running seed={73} conveyorLength={mainLength} workpieceStyle="PIPE_SPOOL" workpieceCount={3}/></group>
    {branches.map(({x, z, length}, index) => <group key={`${x}-${z}`} position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <ConveyorMachine accent={accent} alarm={false} warning={false} running seed={81 + index} conveyorLength={length} workpieceStyle="PIPE_SPOOL" workpieceCount={0}/>
    </group>)}
    {secondary && <group position={[-5,0,.9]} rotation={[0,Math.PI / 2,0]}><ConveyorMachine accent={accent} alarm={false} warning={false} running seed={96} conveyorLength={4.2} workpieceStyle="PIPE_SPOOL" workpieceCount={1}/></group>}
  </group>;
}

function ConveyorMachine({accent,alarm,warning,running,seed,conveyorLength=CONVEYOR_LENGTH,lineSync,workpieceStyle="GENERIC",workpieceCount:workpieceCountOverride,liveCondition}) {
  const body = useRef();
  const strips = useRef([]);
  const workpieces = useRef([]);
  const lastWorkpieceId = useRef(liveCondition?.workpieceId);
  const rollerCount = Math.max(9, Math.round(conveyorLength / .58));
  const workpieceCount = Number.isInteger(workpieceCountOverride)
    ? Math.max(0, workpieceCountOverride)
    : workpieceStyle === "ASSEMBLY_BLOCK" ? 1 : 2;
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) : 0;

    if (body.current) {
      body.current.position.y = alarm ? jitter * .025 : 0;
      body.current.rotation.z = alarm ? jitter * .012 : 0;
    }

    workpieces.current.forEach((workpiece, index) => {
      if (!workpiece) return;
      if (lineSync === "ASSEMBLY" && liveCondition) {
        if (lastWorkpieceId.current !== liveCondition.workpieceId) {
          workpiece.position.x = -conveyorLength / 2 + 1.2;
          lastWorkpieceId.current = liveCondition.workpieceId;
        }
        workpiece.position.x = THREE.MathUtils.lerp(workpiece.position.x, liveCondition.workpieceX, .055);
        return;
      }
      if (!running) return;
      if (lineSync === "SMALLPART") {
        workpiece.position.x = smallPartWorkpieceX(t, index * SMALLPART_TRAVEL_SPAN / 2);
        return;
      }
      if (lineSync === "ASSEMBLY") {
        workpiece.position.x = assemblyBlockX(t);
        return;
      }
      const margin = workpieceStyle === "ASSEMBLY_BLOCK" ? 2.2 : 1.5;
      const travelSpan = Math.max(2, conveyorLength - margin);
      const travelSpeed = workpieceStyle === "ASSEMBLY_BLOCK" ? .38 : .58;
      workpiece.position.x = ((t * travelSpeed + index * travelSpan / workpieceCount) % travelSpan) - travelSpan / 2;
    });

    if (!running) return;
    const spacing = conveyorLength / CONVEYOR_STRIP_COUNT;
    strips.current.forEach((strip, index) => {
      if (!strip) return;
      const travelled = (t * .9 * speed + index * spacing) % conveyorLength;
      const x = travelled - conveyorLength / 2;
      strip.position.x = x + jitter * .025;
      const distanceToEdge = conveyorLength / 2 - Math.abs(x);
      strip.material.opacity = Math.min(1, Math.max(0, distanceToEdge / .4));
    });
  });
  const rollerSpacing = (conveyorLength - .6) / (rollerCount - 1);
  return <group ref={body}>
    <RoundedBox castShadow receiveShadow args={[conveyorLength+.2,.42,1.6]} position={[0,.55,0]} radius={.12}><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.52}/></RoundedBox>
    {Array.from({length:rollerCount}).map((_,index)=><mesh key={index} position={[-conveyorLength/2+.3+index*rollerSpacing,.82,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.1,.1,1.35,12]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.48} roughness={.46}/></mesh>)}
    {Array.from({length:Math.max(3,Math.floor(conveyorLength/2.6))}).map((_,index) => {
      const x = -conveyorLength/2+1.2+index*((conveyorLength-2.4)/Math.max(1,Math.floor(conveyorLength/2.6)-1));
      return <group key={`support-${index}`}>{[-.62,.62].map((z) => <mesh key={z} position={[x,.22,z]}><boxGeometry args={[.16,.48,.16]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.5} roughness={.48}/></mesh>)}</group>;
    })}
    {running && Array.from({length:CONVEYOR_STRIP_COUNT}).map((_,index)=><mesh key={index} ref={(node)=>{strips.current[index]=node;}} position={[-conveyorLength/2,.86,0]}><boxGeometry args={[.25,.04,1.3]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} transparent opacity={0} depthWrite={false}/></mesh>)}
    {Array.from({length:workpieceCount}).map((_,index) =>
      <group key={index} ref={(node)=>{workpieces.current[index]=node;}} position={[
        lineSync === "SMALLPART"
          ? smallPartWorkpieceX(0,index*SMALLPART_TRAVEL_SPAN/2)
          : -conveyorLength/2 + 1.5 + index * Math.max(1,conveyorLength-3) / workpieceCount,
        1.08,
        0,
      ]}>
        <ConveyorWorkpiece accent={liveCondition?.qualityFinalized ? (liveCondition.result === "PASS" ? "#34d399" : liveCondition.result === "RECHECK" ? "#fbbf24" : liveCondition.result === "REWORK" ? "#fb4b5f" : "#94a3b8") : accent} style={workpieceStyle}/>
      </group>
    )}
    <mesh position={[conveyorLength/2-.2,.45,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.38,.38,.9,18]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.52}/></mesh>
    <mesh position={[conveyorLength/2-.18,.83,.48]}><sphereGeometry args={[.1,14,14]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh>
  </group>; }

function ConveyorWorkpiece({accent,style}) {
  if (style === "ASSEMBLY_BLOCK") return <group>
    <RoundedBox castShadow args={[2.25,.42,1.22]} radius={.06} smoothness={3}><meshStandardMaterial color="#607681" metalness={.7} roughness={.34}/></RoundedBox>
    <mesh position={[0,.32,0]}><boxGeometry args={[1.88,.22,.94]}/><meshStandardMaterial color="#aebbc0" metalness={.62} roughness={.35}/></mesh>
    {[-.72,0,.72].map((x)=><mesh key={x} position={[x,.6,0]}><boxGeometry args={[.1,.58,1.02]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.4} roughness={.42}/></mesh>)}
    <mesh position={[.92,.63,.48]}><sphereGeometry args={[.06,10,10]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.7}/></mesh>
  </group>;
  if (style === "STEEL_PLATE") return <group>
    <RoundedBox castShadow args={[2.35,.14,1.26]} radius={.035} smoothness={2}><meshStandardMaterial color="#4f5b61" metalness={.82} roughness={.3}/></RoundedBox>
    <mesh position={[0,.09,0]}><boxGeometry args={[2.12,.035,1.05]}/><meshStandardMaterial color="#829097" metalness={.74} roughness={.28}/></mesh>
    {[-.7,0,.7].map((x)=><mesh key={x} position={[x,.12,0]}><boxGeometry args={[.025,.018,1]}/><meshBasicMaterial color="#d08b38" toneMapped={false}/></mesh>)}
    <mesh position={[1.03,.17,.48]}><sphereGeometry args={[.05,10,10]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6}/></mesh>
  </group>;
  if (style === "SMALL_PART") return <group>
    <RoundedBox castShadow args={[1.25,.3,.92]} radius={.04} smoothness={2}><meshStandardMaterial color="#405e70" metalness={.72} roughness={.34}/></RoundedBox>
    <mesh position={[0,.22,0]}><boxGeometry args={[.92,.12,.62]}/><meshStandardMaterial color="#b8c4c8" metalness={.68} roughness={.32}/></mesh>
    {[-.36,.36].map((x)=><mesh key={x} position={[x,.32,0]}><boxGeometry args={[.08,.28,.68]}/><meshStandardMaterial color="#d6a52c" metalness={.42} roughness={.4}/></mesh>)}
    <mesh position={[.5,.32,.34]}><sphereGeometry args={[.055,10,10]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6}/></mesh>
  </group>;
  if (style === "PIPE_SPOOL") return <group>
    <mesh castShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.15,.15,1.22,16]}/><meshStandardMaterial color="#758890" metalness={.76} roughness={.3}/></mesh>
    {[-.52,.52].map((x) => <mesh key={x} castShadow position={[x,0,0]} rotation={[0,Math.PI / 2,0]}><torusGeometry args={[.24,.065,10,22]}/><meshStandardMaterial color="#aab8bd" metalness={.7} roughness={.31}/></mesh>)}
    <mesh position={[0,.18,0]}><boxGeometry args={[.42,.12,.18]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.15}/></mesh>
  </group>;
  return <RoundedBox castShadow args={[1.25,.24,.9]} radius={.04} smoothness={2}><meshStandardMaterial color="#59646a" metalness={.72} roughness={.36}/></RoundedBox>;
}

const TRANSPORTER_WHEEL_X = [-1.75, -1.05, -.35, .35, 1.05, 1.75];

function TransporterMachine({accent,alarm,warning,running,seed}) {
  const body = useRef();
  const wheels = useRef([]);
  useFrame(({clock}) => {
    if (!body.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const travel = running ? Math.sin(t * .62 * speed + seed) * .22 : 0;
    const jitter = alarm ? faultJitter(t, seed) : 0;
    body.current.position.x = travel + jitter * .025;
    body.current.position.y = alarm ? jitter * .018 : 0;
    body.current.rotation.z = alarm ? jitter * .008 : 0;
    wheels.current.forEach((wheel) => {
      if (wheel) wheel.rotation.z = -travel / .27 + jitter * .04;
    });
  });

  return <group ref={body}>
    <RoundedBox castShadow receiveShadow args={[4.7,.32,2.35]} position={[0,.7,0]} radius={.14} smoothness={4}>
      <meshStandardMaterial color={EQUIPMENT_IVORY} roughness={.5} metalness={.24}/>
    </RoundedBox>
    <RoundedBox castShadow args={[4.15,.3,1.9]} position={[0,.46,0]} radius={.08} smoothness={3}>
      <meshStandardMaterial color={EQUIPMENT_MECHANICAL} roughness={.62} metalness={.45}/>
    </RoundedBox>
    <RoundedBox castShadow args={[3.5,.22,1.45]} position={[0,.96,0]} radius={.06} smoothness={3}>
      <meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} roughness={.56} metalness={.18}/>
    </RoundedBox>
    {TRANSPORTER_WHEEL_X.flatMap((x, axle) => [-1,1].map((side) => {
      const wheelIndex = axle * 2 + (side === 1 ? 1 : 0);
      return <mesh key={`${x}-${side}`} ref={(node)=>{wheels.current[wheelIndex]=node;}} castShadow position={[x,.32,side*1.02]} rotation={[Math.PI/2,0,0]}>
        <cylinderGeometry args={[.27,.27,.24,16]}/>
        <meshStandardMaterial color={EQUIPMENT_WHEEL} roughness={.78} metalness={.18}/>
      </mesh>;
    }))}
    {[-1,1].flatMap((x) => [-1,1].map((z) => <mesh key={`${x}-${z}`} position={[x*2.12,.84,z*.94]}>
      <boxGeometry args={[.18,.11,.3]}/>
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={running || alarm || warning ? 2.1 : .8}/>
    </mesh>))}
    <mesh position={[0,1.09,0]}>
      <boxGeometry args={[2.1,.035,.08]}/>
      <meshBasicMaterial color={accent} toneMapped={false}/>
    </mesh>
  </group>;
}

function CutterMachine({accent,alarm,warning,running,seed,lineSync,lineStationX=0}) {
  const torch = useRef(); const tip = useRef();
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const stationActivity = lineSync === "SMALLPART" ? smallPartStationActivity(t, lineStationX, 1.2) : 1;
    if (torch.current) {
      torch.current.position.y = lineSync === "SMALLPART"
        ? 2.22 - stationActivity * .58
        : 2.05 + (running ? Math.sin(t * 2.2 * speed + seed) * .18 : 0);
    }
    if (tip.current) tip.current.emissiveIntensity = alarm
      ? 1.6 + Math.abs(faultJitter(t, seed)) * 1.8
      : running ? .25 + stationActivity * 2.2 : .12;
  });
  return <group><RoundedBox castShadow args={[4.8,.45,2.4]} position={[0,.38,0]} radius={.12}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.54}/></RoundedBox>{[-2,2].map(x=><mesh key={x} position={[x,1.55,0]}><boxGeometry args={[.18,2.5,.18]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh>)}<mesh position={[0,2.72,0]}><boxGeometry args={[4.3,.22,.22]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh><mesh ref={torch} position={[0,2.05,0]}><cylinderGeometry args={[.16,.1,1.2,18]}/><meshStandardMaterial ref={tip} color={EQUIPMENT_IVORY_LIGHT} emissive={accent} emissiveIntensity={alarm?1.6:.18}/></mesh></group>; }

function FanMachine({accent,alarm,warning,running,seed,lineSync,lineStationX=0}) {
  const rotor = useRef();
  useFrame(({clock}) => {
    if (!rotor.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .3 : 0;
    const extractionBoost = lineSync === "SMALLPART"
      ? 1 + smallPartStationActivity(t, lineStationX, 1.8) * .55
      : 1;
    rotor.current.rotation.z = (running ? t * 2.4 * speed * extractionBoost : 0) + jitter;
  });

  return <group>
    <RoundedBox castShadow args={[2.65,.28,1.62]} position={[0,.18,0]} radius={.08} smoothness={3}>
      <meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.55}/>
    </RoundedBox>
    {[-.82,.82].map((x) => <mesh key={x} castShadow position={[x,.72,0]}>
      <boxGeometry args={[.24,.95,.72]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.28} roughness={.52}/>
    </mesh>)}
    <mesh castShadow position={[0,1.72,-.1]} rotation={[Math.PI/2,0,0]}>
      <cylinderGeometry args={[1.38,1.38,.82,40]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.25} roughness={.48}/>
    </mesh>
    <mesh position={[0,1.72,.34]} rotation={[Math.PI/2,0,0]}>
      <cylinderGeometry args={[1.12,1.12,.08,40]}/><meshStandardMaterial color="#303638" metalness={.35} roughness={.64}/>
    </mesh>
    <group ref={rotor} position={[0,1.72,.43]}>
      {[0,1,2,3,4,5].map((index) => <mesh key={index} rotation={[0,0,index*Math.PI/3]} position={[0,.53,0]}>
        <capsuleGeometry args={[.16,.72,6,12]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.34} roughness={.44}/>
      </mesh>)}
      <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.3,.3,.32,20]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.6} roughness={.38}/></mesh>
    </group>
    {[.44,.76,1.08].map((radius) => <mesh key={radius} position={[0,1.72,.62]}><torusGeometry args={[radius,.025,8,36]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.58} roughness={.42}/></mesh>)}
    {[0,Math.PI/2].map((angle) => <mesh key={angle} position={[0,1.72,.62]} rotation={[0,0,angle]}><boxGeometry args={[2.15,.035,.04]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.58}/></mesh>)}
    <mesh position={[0,1.72,.66]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.13,.13,.1,16]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.65}/></mesh>
    <RoundedBox castShadow args={[.78,.72,.7]} position={[0,1.72,-.76]} radius={.1} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.5}/></RoundedBox>
  </group>;
}

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
  return <group ref={body}>
    <RoundedBox castShadow args={[3.8,.24,1.8]} position={[0,.16,0]} radius={.07} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.34} roughness={.55}/></RoundedBox>
    {[-.64,.64].map((z) => <mesh key={z} position={[0,.04,z]}><boxGeometry args={[3.55,.16,.2]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.48} roughness={.52}/></mesh>)}
    <mesh castShadow position={[-.82,.78,0]} rotation={[0,0,Math.PI/2]}>
      <cylinderGeometry args={[.55,.55,1.55,28]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.28} roughness={.48}/>
    </mesh>
    {[-1.38,-1.13,-.88,-.63,-.38].map((x) => <mesh key={x} position={[x,.78,0]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.57,.035,8,24]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.34} roughness={.45}/></mesh>)}
    <mesh position={[-1.66,.78,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.4,.5,.18,24]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.32} roughness={.5}/></mesh>
    <RoundedBox castShadow args={[.62,.68,.74]} position={[.08,.72,0]} radius={.12} smoothness={3}><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.38} roughness={.5}/></RoundedBox>
    <mesh castShadow position={[.9,.82,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.72,.72,.68,32]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.26} roughness={.46}/></mesh>
    <mesh position={[.9,.82,.38]}><torusGeometry args={[.48,.11,12,30]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.32} roughness={.45}/></mesh>
    <mesh position={[1.55,.82,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.22,.22,.9,18]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.34} roughness={.42}/></mesh>
    <mesh position={[1.96,.82,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.36,.36,.12,20]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.4} roughness={.4}/></mesh>
    <mesh position={[.9,1.52,0]}><cylinderGeometry args={[.2,.2,.88,18]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.34} roughness={.42}/></mesh>
    <mesh position={[.9,1.94,0]}><cylinderGeometry args={[.34,.34,.12,20]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.4} roughness={.4}/></mesh>
    <group position={[1.35,1.65,.22]} rotation={[0,-.12,0]}>
      <mesh><torusGeometry args={[.25,.055,10,24]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.55} roughness={.4}/></mesh>
      <mesh><circleGeometry args={[.2,24]}/><meshStandardMaterial color="#dce4df" metalness={.1} roughness={.5}/></mesh>
      <mesh position={[0,0,.015]} rotation={[0,0,-.65]}><boxGeometry args={[.025,.17,.018]}/><meshBasicMaterial color="#df3648" toneMapped={false}/></mesh>
    </group>
    <mesh position={[.9,1.16,.39]}><sphereGeometry args={[.1,14,14]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh>
  </group>;
}

function GoliathCraneMachine({accent,alarm,warning,running,seed,utilization=0}) {
  const trolley = useRef();
  const hook = useRef();
  const trolleyVelocity = useRef(0);
  useFrame(({clock}, delta) => {
    const t = clock.elapsedTime;
    const utilizationRate = THREE.MathUtils.clamp(utilization / 100, 0, 1);
    const cycleSpeed = THREE.MathUtils.lerp(.035, .065, utilizationRate);
    const statusFactor = alarm ? 1.12 : warning ? 1.05 : 1;
    // 양쪽 다리와 충돌하지 않도록 트롤리 레일의 안쪽 구간만 사용한다.
    // 탭이 멈췄다가 복귀할 때 큰 delta가 들어와도 한 프레임에 경계를 넘지 않게 제한한다.
    const travelLimit = 7.4;
    const safeDelta = Math.min(delta, .05);
    const targetX = running ? Math.sin(t * cycleSpeed * statusFactor) * travelLimit : trolley.current?.position.x || 0;
    const maxSpeed = THREE.MathUtils.lerp(.24, .5, utilizationRate) * statusFactor;
    const jitter = alarm ? faultJitter(t, seed) : 0;
    if (trolley.current) {
      const positionError = targetX - trolley.current.position.x;
      const desiredVelocity = running ? THREE.MathUtils.clamp(positionError * .32, -maxSpeed, maxSpeed) : 0;
      trolleyVelocity.current = THREE.MathUtils.damp(trolleyVelocity.current, desiredVelocity, 1.25, safeDelta);
      const nextX = trolley.current.position.x + trolleyVelocity.current * safeDelta;
      trolley.current.position.x = THREE.MathUtils.clamp(nextX, -travelLimit, travelLimit);
      if (nextX !== trolley.current.position.x) trolleyVelocity.current = 0;
      trolley.current.position.y = 6.28 + jitter * .008;
    }
    if (hook.current) {
      const targetSway = running ? THREE.MathUtils.clamp(-trolleyVelocity.current * .055, -.026, .026) : 0;
      hook.current.rotation.z = THREE.MathUtils.damp(hook.current.rotation.z, targetSway + jitter * .006, 1.8, delta);
    }
  });

  return <group>
    {[-12.6,12.6].map((x) => <group key={x}>
      {[-.72,.72].map((z) => <mesh key={z} castShadow position={[x,3.45,z]} rotation={[0,0,x < 0 ? -.045 : .045]}>
        <boxGeometry args={[.48,6.55,.48]}/>
        <meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.25} roughness={.5}/>
      </mesh>)}
      <RoundedBox castShadow args={[1.25,.36,2.15]} position={[x,.22,0]} radius={.08} smoothness={3}>
        <meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.32} roughness={.5}/>
      </RoundedBox>
      {[-.72,.72].map((z) => <mesh key={`wheel-${z}`} position={[x,.16,z]} rotation={[Math.PI/2,0,0]}>
        <cylinderGeometry args={[.2,.2,.28,14]}/>
        <meshStandardMaterial color={EQUIPMENT_WHEEL} metalness={.2} roughness={.75}/>
      </mesh>)}
      {[2.15,4.05].map((y) => <mesh key={y} position={[x,y,0]}>
        <boxGeometry args={[.66,.22,1.65]}/>
        <meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.25} roughness={.52}/>
      </mesh>)}
    </group>)}
    <RoundedBox castShadow receiveShadow args={[27.2,.82,1.55]} position={[0,6.9,0]} radius={.1} smoothness={4}>
      <meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.27} roughness={.48}/>
    </RoundedBox>
    <mesh position={[0,7.42,-.62]}><boxGeometry args={[26.8,.08,.08]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.28}/></mesh>
    <mesh position={[0,7.42,.62]}><boxGeometry args={[26.8,.08,.08]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.28}/></mesh>
    {[-7.8,7.8].map((x) => <mesh key={`trolley-stop-${x}`} position={[x,6.3,0]}>
      <boxGeometry args={[.18,.42,1.42]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.55} roughness={.42}/>
    </mesh>)}
    {Array.from({length: 14}, (_, index) => -12.5 + index * (25 / 13)).map((x) => <mesh key={x} position={[x,7.68,0]}>
      <boxGeometry args={[.07,.52,1.28]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE}/>
    </mesh>)}
    <group ref={trolley} position={[0,6.28,0]}>
      <RoundedBox castShadow args={[1.3,.52,1.32]} radius={.08} smoothness={3}>
        <meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.28} roughness={.46}/>
      </RoundedBox>
      <mesh position={[0,.02,.7]}><sphereGeometry args={[.11,14,14]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2.2:.7}/></mesh>
      <group ref={hook} position={[0,-.3,0]}>
        <mesh position={[0,-1.95,0]}><cylinderGeometry args={[.035,.035,3.9,8]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.72} roughness={.38}/></mesh>
        <mesh position={[0,-3.9,0]}><torusGeometry args={[.25,.065,10,24]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.68} roughness={.4}/></mesh>
      </group>
    </group>
  </group>;
}

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
  return <group>{[-2.2,2.2].map(x=><mesh key={x} position={[x,2,0]}><boxGeometry args={[.25,4,.25]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh>)}<mesh position={[0,4,0]}><boxGeometry args={[5,.3,.35]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh><RoundedBox args={[1.1,.65,.8]} position={[0,3.65,0]} radius={.1}><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.22} roughness={.48}/></RoundedBox><mesh position={[0,3.62,.43]}><sphereGeometry args={[.1,14,14]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh><group ref={hook} position={[0,2.5,0]}><mesh position={[0,-.85,0]}><cylinderGeometry args={[.035,.035,2.2,8]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.7} roughness={.4}/></mesh><mesh position={[0,-1.65,0]}><torusGeometry args={[.22,.06,10,22]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.65} roughness={.42}/></mesh></group></group>; }

function FaultMarker({position,part,seed=0}) {
  const ring = useRef();
  useFrame(({clock}) => { if (ring.current) { const s = 1 + Math.abs(faultJitter(clock.elapsedTime, seed)) * .3; ring.current.scale.setScalar(s); } });
  return <group position={position}><mesh ref={ring}><sphereGeometry args={[.16,18,18]}/><meshBasicMaterial color="#ff2f48"/></mesh><pointLight intensity={12} distance={3.2} color="#ff2f48"/><mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.32,.035,10,28]}/><meshBasicMaterial color="#ff5368"/></mesh><Html center position={[0,.6,0]} distanceFactor={9}><div className="whitespace-nowrap rounded-lg border border-red-400/60 bg-[#260810]/95 px-2 py-1 text-[9px] font-black text-red-200 shadow-[0_0_18px_rgba(255,47,72,.5)]">이상 부품 · {part}</div></Html></group>; }

export default EquipmentTwinScene;
