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
    { position: [-4.8, 0, -2.1], rotationY: 0 },
    { position: [3.9, 0, 2.8], rotationY: Math.PI / 2 },
    { position: [5.8, 0, -3.8], rotationY: 0 },
    { position: [-5.8, 0, 3.5], rotationY: 0 },
  ],
  SMALLPART: [
    { position: [-5.2, 0, -2.5], rotationY: 0 },
    { position: [5.3, 0, -3.1], rotationY: -.35 },
    { position: [3.2, 0, 3.5], rotationY: 0 },
    { position: [-5.6, 0, 3.7], rotationY: 0 },
  ],
  PAINT: [
    { position: [-6.1, 0, 3], rotationY: 0 },
    { position: [-3.3, 0, -3.6], rotationY: 0 },
    { position: [3.3, 0, -3.6], rotationY: 0 },
    { position: [6.1, 0, 3], rotationY: Math.PI },
  ],
  DOCK: [
    { position: [0, 0, -4.5], rotationY: 0 },
    { position: [-6, 0, 3.1], rotationY: 0 },
    { position: [4.8, 0, 2.7], rotationY: Math.PI / 2 },
  ],
  OUTFITTING: [
    { position: [-4.8, 0, -1.8], rotationY: 0 },
    { position: [-6, 0, 3.5], rotationY: 0 },
    { position: [5, 0, -2.8], rotationY: -.35 },
    { position: [5.8, 0, 3.4], rotationY: 0 },
  ],
  OFFSHORE: [
    { position: [-5.3, 0, -3.5], rotationY: 0 },
    { position: [5.8, 0, -3], rotationY: -.35 },
    { position: [-5, 0, 3.4], rotationY: 0 },
    { position: [4.3, 0, 3.2], rotationY: 0 },
  ],
};

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
  BLOCK_CRANE: [0, 6.45, 0],
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
  BLOCK_CRANE: [4.2, 1.2, 1],
  GOLIATH: [10.5, 1.5, 1],
};

// ---------------------------------------------------------------------------
// REAL CAD (GrabCAD STEP) 연동
// ---------------------------------------------------------------------------
// STEP 파일은 브라우저에서 occt-import-js(WASM, OpenCascade 빌드)로 직접 파싱합니다.
// 별도 변환 서버 없이 클라이언트에서만 동작합니다.
//
// 1) 아래 5개 STEP 파일을 프로젝트의 정적 파일 경로(보통 public/cad)에 넣어주세요.
//    robot-arm.step, jib-crane.step, welding-station.step, spray-robot.step, gantry-crane.step
// 2) CAD_BASE_PATH 가 실제 배포 시 그 폴더를 가리키도록 맞춰주세요.
//    (Vite/CRA 기준 public/cad 에 두면 기본값 "/cad" 그대로 동작합니다)
// 3) 용량이 큰 파일(welding-station 39MB, spray-robot 70MB, gantry-crane 63MB)은
//    첫 파싱에 시간이 걸릴 수 있습니다. 로딩 중에는 기존 프로시저럴 모델이 그대로 보이다가
//    준비되면 실제 CAD로 자동 교체됩니다.
const CAD_BASE_PATH = "/cad";
const OCCT_SRC = "https://unpkg.com/occt-import-js@0.0.23/dist/occt-import-js.js";

// asset.kind → 기본 CAD 매핑. 특정 설비 하나만 다른 CAD를 쓰고 싶으면
// factoryEquipmentCatalog 쪽 데이터에 asset.cadModel / asset.cadTargetHeight 를
// 추가하면 kind 매핑보다 우선 적용됩니다. 예)
//   { assetCode: "ASS-04-03", kind: "ROBOT", cadModel: "welding-station.step", cadTargetHeight: 2.3, ... }
const KIND_TO_CAD = {
  // 관절 애니메이션이 필요한 로봇은 정적 CAD 대신 아래의 관절형 모델을 사용한다.
};

let occtEnginePromise = null;
function loadOcctEngine() {
  if (occtEnginePromise) return occtEnginePromise;
  occtEnginePromise = new Promise((resolve, reject) => {
    if (window.occtimportjs) {
      window.occtimportjs().then(resolve).catch(reject);
      return;
    }
    const existing = document.querySelector(`script[src="${OCCT_SRC}"]`);
    const onReady = () => window.occtimportjs().then(resolve).catch(reject);
    if (existing) {
      existing.addEventListener("load", onReady);
      existing.addEventListener("error", () => reject(new Error("occt-import-js 로드 실패")));
      return;
    }
    const script = document.createElement("script");
    script.src = OCCT_SRC;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("occt-import-js 로드 실패"));
    document.head.appendChild(script);
  });
  return occtEnginePromise;
}

// 같은 STEP 파일을 여러 설비/여러 공장에서 재사용해도 한 번만 파싱하도록 캐시.
const cadModelCache = new Map();
const gltfLoader = new GLTFLoader();

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

function loadCadGroup(file, targetHeight) {
  const cacheKey = `${file}:${targetHeight}`;
  if (cadModelCache.has(cacheKey)) return cadModelCache.get(cacheKey);

  const promise = (async () => {
    if (file.toLowerCase().endsWith(".glb")) {
      const gltf = await gltfLoader.loadAsync(`${CAD_BASE_PATH}/${file}`);
      const group = gltf.scene;
      group.traverse((child) => {
        if (!child.isMesh) return;
        child.material = CAD_IVORY_MATERIAL;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      return normalizeCadGroup(group, targetHeight);
    }

    const occt = await loadOcctEngine();
    const res = await fetch(`${CAD_BASE_PATH}/${file}`);
    if (!res.ok) throw new Error(`CAD 파일 로드 실패 (${res.status}): ${file}`);
    const buffer = new Uint8Array(await res.arrayBuffer());
    const result = occt.ReadStepFile(buffer, {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.01,
      angularDeflection: 0.4,
    });
    if (!result.success || !result.meshes.length) throw new Error(`STEP 파싱 실패: ${file}`);

    const group = new THREE.Group();
    for (const m of result.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) {
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      }
      geometry.setIndex(Array.from(m.index.array));
      if (!m.attributes.normal) geometry.computeVertexNormals();
      // 도장된 산업용 금속 느낌 — 살짝 광택(clearcoat) 있는 물리 재질
      const mesh = new THREE.Mesh(geometry, CAD_IVORY_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // STEP 원점/스케일이 제각각이라, 바닥에 붙이고 높이를 targetHeight에 맞춰 정규화한다.
    return normalizeCadGroup(group, targetHeight);
  })();

  cadModelCache.set(cacheKey, promise);
  return promise;
}

// 레퍼런스 이미지의 "파란 스캔 오버레이"(디지털 트윈 홀로그램) 효과.
// 프레넬 림 글로우 + 위아래로 흐르는 스캔 밴드를 셰이더로 그려서 선택/알람 설비 위에 덧씌운다.
const SCAN_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    vWorldY = (modelMatrix * vec4(position, 1.0)).y;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const SCAN_FRAG = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uBaseHeight;
  uniform float uHeight;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vWorldY;
  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.2);
    float h = clamp((vWorldY - uBaseHeight) / uHeight, 0.0, 1.0);
    float band = pow(max(sin(h * 20.0 - uTime * 2.0) * 0.5 + 0.5, 0.0), 8.0);
    float glow = fresnel * 0.65 + band * 0.55;
    gl_FragColor = vec4(uColor, clamp(glow, 0.0, 1.0));
  }
`;

function ScanOverlay({ group, color }) {
  const meshes = useMemo(() => {
    const list = [];
    group.traverse((child) => { if (child.isMesh) list.push(child); });
    return list;
  }, [group]);
  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(group);
    return { min: box.min.y, height: Math.max(box.max.y - box.min.y, 1e-3) };
  }, [group]);
  const uniformsRef = useRef(
    meshes.map(() => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBaseHeight: { value: bounds.min },
      uHeight: { value: bounds.height },
    }))
  );
  useEffect(() => {
    uniformsRef.current.forEach((u) => u.uColor.value.set(color));
  }, [color]);
  useFrame(({ clock }) => {
    uniformsRef.current.forEach((u) => { u.uTime.value = clock.elapsedTime; });
  });
  const scale = [group.scale.x * 1.015, group.scale.y * 1.015, group.scale.z * 1.015];
  return <group position={group.position} scale={scale}>
    {meshes.map((mesh, i) => <mesh key={i} geometry={mesh.geometry}>
      <shaderMaterial
        transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.FrontSide}
        uniforms={uniformsRef.current[i]} vertexShader={SCAN_VERT} fragmentShader={SCAN_FRAG}
      />
    </mesh>)}
  </group>;
}

// 실제 STEP CAD를 로드해서 보여준다. 로딩 중이거나 실패하면 기존 프로시저럴 모델(fallback)을 그대로 쓴다.
// scanActive가 true면(선택됨/알람) 위 홀로그램 스캔 오버레이를 겹쳐 그린다.
function CadModel({ file, targetHeight, modelScale = [1, 1, 1], fallback, scanActive, scanColor }) {
  const [group, setGroup] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGroup(null);
    setFailed(false);
    loadCadGroup(file, targetHeight)
      .then((loaded) => { if (!cancelled) setGroup(loaded.clone(true)); })
      .catch((err) => {
        console.error("[EquipmentTwinScene] CAD load failed:", file, err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [file, targetHeight]);

  if (!group || failed) return fallback;
  return <group scale={modelScale}>
    <primitive object={group} />
    {scanActive && <ScanOverlay group={group} color={scanColor}/>}
  </group>;
}

// 작업자는 3D로 표현하지 않는다 — 실제 GPS/UWB 위치 연동 전까지는 좌표를 지어낼 수밖에 없고,
// 그건 "진짜 위치"처럼 보여서 오해를 준다. 작업자 목록·위험도는 FactoryDetailTwin 사이드
// 패널(목록 클릭 → chooseWorker)에서만 보여준다.
function EquipmentTwinScene({ factory, selectedAsset, onSelectAsset }) {
  const controlsRef = useRef();
  const cameraPosition = factory.profileKey === "DOCK" ? [18, 12, 22] : [13.5, 8.5, 16];
  const alarmIndex = factory.equipment.findIndex((asset) => asset.fault);
  const hasRealCad = factory.equipment.some((asset) => asset.cadModel || KIND_TO_CAD[asset.kind]);
  const layout = EQUIPMENT_LAYOUTS[factory.profileKey] || DEFAULT_LAYOUT;
  const placements = factory.equipment.map((_, index) => layout[index] || DEFAULT_LAYOUT[index] || {
    position: [index * 3 - 4.5, 0, 0],
    rotationY: 0,
  });
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
        <FactoryFloor profileKey={factory.profileKey}/>
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
        <span className="sim-badge inline-flex">SIMULATION</span>
        {hasRealCad && <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">REAL CAD</span>}
      </div>
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

function FactoryFloor({ profileKey }) {
  const accent = { ASSEMBLY: "#0091c2", CUTTING: "#1f9d76", PAINT: "#d97a1f", DOCK: "#8b5fc9", OUTFITTING: "#2fa3ad" }[profileKey] || "#3a7d8c";
  const { map, normalMap } = useDiamondPlateTexture();
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

function MachineUnit({ asset, position, rotationY = 0, selected, onSelect }) {
  const alarm = Boolean(asset.fault);
  const warning = !alarm && asset.status === "WARNING";
  const running = asset.operatingState === "RUNNING";
  const seed = asset.assetCode.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 100;
  const accent = alarm ? "#ff3b4f" : selected ? "#ff9d38" : warning ? "#ffb23e" : "#23c8ee";
  const issuePositions = { ROBOT:[0,2.3,0], INSPECTOR:[0,2.45,0], POSITIONER:[0,1.1,.4], BENDER:[0,2.15,0], CONVEYOR:[2.5,.55,0], TRANSPORTER:[1.7,.5,1], CUTTER:[0,2.3,0], FAN:[0,1.65,.55], PUMP:[.7,.8,0], CRANE:[0,3.8,0], BLOCK_CRANE:[0,4.9,0], GOLIATH:[0,6.75,0] };

  const motion = { accent, alarm, warning, running, seed, utilization: asset.utilization, conveyorLength: asset.conveyorLength };
  const cad = asset.cadModel
    ? { file: asset.cadModel, targetHeight: asset.cadTargetHeight || 2.2, modelScale: asset.cadScale || [1, 1, 1] }
    : KIND_TO_CAD[asset.kind];
  const fallback = <KindFallback kind={asset.kind} motion={motion}/>;
  const labelPosition = asset.labelPosition || LABEL_POSITION_BY_KIND[asset.kind] || [0, 3.5, 0];
  const ringScale = asset.selectionRingScale || SELECTION_RING_SCALE_BY_KIND[asset.kind] || [1, 1, 1];

  return <group position={position} rotation={[0, rotationY, 0]} onClick={(event)=>{event.stopPropagation();onSelect(asset);}} onPointerOver={()=>{document.body.style.cursor="pointer";}} onPointerOut={()=>{document.body.style.cursor="default";}}>
    {cad ? <CadModel file={cad.file} targetHeight={cad.targetHeight} modelScale={cad.modelScale} fallback={fallback} scanActive={alarm || selected} scanColor={accent}/> : fallback}
    {alarm && <pointLight position={[0, asset.kind === "GOLIATH" ? 6.6 : (cad?.targetHeight || 2.2) * 0.55, 0]} intensity={10} distance={4} color="#ff2f48"/>}
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
    case "BLOCK_CRANE": return <BlockCraneMachine {...motion}/>;
    case "GOLIATH": return <GoliathCraneMachine {...motion}/>;
    default: return null;
  }
}

function RobotCadHead() {
  const [head, setHead] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadCadGroup("robot-head.glb", .72)
      .then((loaded) => { if (!cancelled) setHead(loaded.clone(true)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return head
    ? <primitive object={head}/>
    : <mesh><cylinderGeometry args={[.12,.07,.55,14]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.6} roughness={.38}/></mesh>;
}

function RobotMachine({accent,alarm,warning,running,seed,utilization=0}) {
  const waist = useRef();
  const shoulder = useRef();
  const elbow = useRef();
  const wrist = useRef();
  const weldingArc = useRef();
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const utilizationRate = THREE.MathUtils.clamp(utilization / 100, 0, 1);
    const speed = speedMultiplier(alarm, warning);
    const cycleSpeed = THREE.MathUtils.lerp(.48, .92, utilizationRate) * speed;
    const phase = t * cycleSpeed + seed;
    const wave = running ? Math.sin(phase) : 0;
    const jitter = alarm ? faultJitter(t, seed) * .09 : 0;
    if (waist.current) waist.current.rotation.y = (running ? Math.sin(phase * .55) * THREE.MathUtils.lerp(.08, .18, utilizationRate) : 0) + jitter * .22;
    if (shoulder.current) shoulder.current.rotation.z = -.9 + wave * THREE.MathUtils.lerp(.05, .11, utilizationRate) + jitter;
    if (elbow.current) elbow.current.rotation.z = -1.1 + (running ? Math.sin(phase + .85) * THREE.MathUtils.lerp(.08, .15, utilizationRate) : 0) + jitter * 1.4;
    if (wrist.current) wrist.current.rotation.z = 1.08 + (running ? Math.sin(phase * 1.35 + 1.4) * .08 : 0) + jitter * .8;
    if (weldingArc.current) {
      const welding = running && Math.sin(phase * 2.2) > -.35;
      weldingArc.current.visible = welding;
      const pulse = .8 + Math.abs(Math.sin(t * 24 + seed)) * .45;
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
            <group ref={weldingArc} position={[-.08,-.62,0]}>
              <mesh><sphereGeometry args={[.11,12,12]}/><meshBasicMaterial color="#b9f4ff" toneMapped={false}/></mesh>
              <pointLight color="#65dcff" intensity={7} distance={2.6}/>
              {[
                [-.22,-.14,.04], [.18,-.11,-.05], [-.13,-.25,-.12],
                [.26,-.22,.1], [.06,-.3,.16], [-.28,-.31,.08],
              ].map((position,index) => <mesh key={index} position={position}>
                <sphereGeometry args={[.025,8,8]}/><meshBasicMaterial color={index%2 ? "#ffb44d" : "#d8f8ff"} toneMapped={false}/>
              </mesh>)}
            </group>
          </group>
        </group>
      </group>
    </group>
  </group>;
}
function Arm({length}) { return <group><mesh castShadow position={[0,length/2,0]}><capsuleGeometry args={[.2,length-.3,8,16]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.48}/></mesh><mesh position={[0,length,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.28,.28,.36,20]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.3} roughness={.42}/></mesh><mesh position={[.19,length*.55,.03]}><torusGeometry args={[.13,.025,8,18]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.55} roughness={.4}/></mesh></group>; }

function InspectorMachine({accent,alarm,warning,running,seed}) {
  const scanner = useRef();
  useFrame(({clock}) => {
    if (!scanner.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .025 : 0;
    scanner.current.position.x = (running ? Math.sin(t * .55 * speed + seed) * .62 : 0) + jitter;
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
      <mesh position={[0,-1.04,0]}><cylinderGeometry args={[.018,.018,.82,8]}/><meshBasicMaterial color={accent} transparent opacity={.8} toneMapped={false}/></mesh>
    </group>
  </group>;
}

function PositionerMachine({accent,alarm,warning,running,seed}) {
  const table = useRef();
  useFrame(({clock}) => {
    if (!table.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .04 : 0;
    table.current.rotation.y = (running ? t * .6 * speed : 0) + jitter;
  });
  return <group><RoundedBox castShadow args={[2.5,.75,1.9]} position={[0,.42,0]} radius={.15}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.28} roughness={.54}/></RoundedBox><group ref={table} position={[0,1.05,0]}><mesh castShadow><cylinderGeometry args={[.85,.85,.3,32]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.48}/></mesh><mesh position={[.6,.02,0]}><boxGeometry args={[.18,.1,.18]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh></group><mesh position={[0,1.5,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.13,.13,2.3,16]}/><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.3} roughness={.45}/></mesh></group>; }

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

function ConveyorMachine({accent,alarm,warning,running,seed,conveyorLength=CONVEYOR_LENGTH}) {
  const body = useRef();
  const strips = useRef([]);
  const workpiece = useRef();
  const rollerCount = Math.max(9, Math.round(conveyorLength / .58));
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) : 0;

    if (body.current) {
      body.current.position.y = alarm ? jitter * .025 : 0;
      body.current.rotation.z = alarm ? jitter * .012 : 0;
    }

    if (workpiece.current) workpiece.current.position.x = -1.1 + (running ? Math.sin(t * .22) * .55 : 0);

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
    {conveyorLength > CONVEYOR_LENGTH && <group ref={workpiece} position={[-1.1,1.03,0]}>
      <RoundedBox castShadow args={[1.45,.2,1]} radius={.04} smoothness={2}><meshStandardMaterial color="#59646a" metalness={.72} roughness={.36}/></RoundedBox>
      <mesh position={[0,.13,0]}><boxGeometry args={[1.12,.08,.68]}/><meshStandardMaterial color="#879196" metalness={.68} roughness={.34}/></mesh>
      <mesh position={[.58,.2,.38]}><sphereGeometry args={[.055,10,10]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6}/></mesh>
    </group>}
    <mesh position={[conveyorLength/2-.2,.45,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.38,.38,.9,18]}/><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.52}/></mesh>
    <mesh position={[conveyorLength/2-.18,.83,.48]}><sphereGeometry args={[.1,14,14]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh>
  </group>; }

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

function CutterMachine({accent,alarm,warning,running,seed}) {
  const torch = useRef(); const tip = useRef();
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    if (torch.current) torch.current.position.y = 2.05 + (running ? Math.sin(t * 2.2 * speed + seed) * .18 : 0);
    if (tip.current) tip.current.emissiveIntensity = alarm ? 1.6 + Math.abs(faultJitter(t, seed)) * 1.8 : 1;
  });
  return <group><RoundedBox castShadow args={[4.8,.45,2.4]} position={[0,.38,0]} radius={.12}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.3} roughness={.54}/></RoundedBox>{[-2,2].map(x=><mesh key={x} position={[x,1.55,0]}><boxGeometry args={[.18,2.5,.18]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh>)}<mesh position={[0,2.72,0]}><boxGeometry args={[4.3,.22,.22]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.24} roughness={.5}/></mesh><mesh ref={torch} position={[0,2.05,0]}><cylinderGeometry args={[.16,.1,1.2,18]}/><meshStandardMaterial ref={tip} color={EQUIPMENT_IVORY_LIGHT} emissive={accent} emissiveIntensity={alarm?1.6:.18}/></mesh></group>; }

function FanMachine({accent,alarm,warning,running,seed}) {
  const rotor = useRef();
  useFrame(({clock}) => {
    if (!rotor.current) return;
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) * .3 : 0;
    rotor.current.rotation.z = (running ? t * 2.4 * speed : 0) + jitter;
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

function BlockCraneMachine({accent,alarm,warning,running,seed,utilization=0}) {
  const trolley = useRef();
  const hook = useRef();
  const velocity = useRef(0);
  useFrame(({clock}, delta) => {
    if (!trolley.current) return;
    const t = clock.elapsedTime;
    const utilizationRate = THREE.MathUtils.clamp(utilization / 100, 0, 1);
    const travelLimit = 3.55;
    const safeDelta = Math.min(delta, .05);
    const targetX = running ? Math.sin(t * THREE.MathUtils.lerp(.05, .085, utilizationRate)) * travelLimit : trolley.current.position.x;
    const desiredVelocity = running ? THREE.MathUtils.clamp((targetX - trolley.current.position.x) * .4, -.42, .42) : 0;
    velocity.current = THREE.MathUtils.damp(velocity.current, desiredVelocity, 1.4, safeDelta);
    const nextX = trolley.current.position.x + velocity.current * safeDelta;
    trolley.current.position.x = THREE.MathUtils.clamp(nextX, -travelLimit, travelLimit);
    if (nextX !== trolley.current.position.x) velocity.current = 0;
    const jitter = alarm ? faultJitter(t, seed) : 0;
    trolley.current.position.y = 4.86 + jitter * .006;
    if (hook.current) hook.current.rotation.z = THREE.MathUtils.damp(hook.current.rotation.z, -velocity.current * .06 + jitter * .005, 1.8, safeDelta);
  });

  return <group>
    {[-5.05,5.05].map((x) => <group key={x}>
      {[-.55,.55].map((z) => <mesh key={z} castShadow position={[x,2.65,z]} rotation={[0,0,x < 0 ? -.055 : .055]}><boxGeometry args={[.38,5.05,.38]}/><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.26} roughness={.5}/></mesh>)}
      <RoundedBox castShadow args={[1.05,.34,1.75]} position={[x,.22,0]} radius={.07} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_SHADE} metalness={.32} roughness={.5}/></RoundedBox>
    </group>)}
    <RoundedBox castShadow args={[11.2,.66,1.2]} position={[0,5.25,0]} radius={.08} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY} metalness={.27} roughness={.48}/></RoundedBox>
    {[-3.85,3.85].map((x) => <mesh key={`block-stop-${x}`} position={[x,4.88,0]}><boxGeometry args={[.16,.36,1.12]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.55} roughness={.42}/></mesh>)}
    <group ref={trolley} position={[0,4.86,0]}>
      <RoundedBox castShadow args={[1.12,.44,1.04]} radius={.07} smoothness={3}><meshStandardMaterial color={EQUIPMENT_IVORY_LIGHT} metalness={.3} roughness={.44}/></RoundedBox>
      <mesh position={[0,.02,.56]}><sphereGeometry args={[.09,12,12]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={alarm||warning||running?2:.7}/></mesh>
      <group ref={hook} position={[0,-.25,0]}>
        <mesh position={[0,-1.4,0]}><cylinderGeometry args={[.03,.03,2.8,8]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.7} roughness={.4}/></mesh>
        <mesh position={[0,-2.78,0]}><torusGeometry args={[.2,.055,10,22]}/><meshStandardMaterial color={EQUIPMENT_MECHANICAL} metalness={.66} roughness={.42}/></mesh>
      </group>
    </group>
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
