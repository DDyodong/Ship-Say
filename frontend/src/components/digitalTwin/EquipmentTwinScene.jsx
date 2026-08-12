import React, { Suspense, useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Box, RotateCcw, ScanLine } from "lucide-react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

// 오버헤드 스튜디오 조명(RectAreaLight)을 쓰려면 한 번 초기화가 필요하다.
if (typeof window !== "undefined") RectAreaLightUniformsLib.init();

const POSITIONS = [[-5, 0, -3.2], [2.2, 0, -3.2], [-4.3, 0, 3.4], [3.3, 0, 3.1], [0, 0, 0]];

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
  ROBOT: { file: "robot-arm.step", targetHeight: 2.4 },
  CRANE: { file: "gantry-crane.step", targetHeight: 4.2 },
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

function loadCadGroup(file, targetHeight) {
  const cacheKey = `${file}:${targetHeight}`;
  if (cadModelCache.has(cacheKey)) return cadModelCache.get(cacheKey);

  const promise = (async () => {
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
      const color = m.color && m.color.length === 3
        ? new THREE.Color(m.color[0], m.color[1], m.color[2])
        : new THREE.Color("#9fb6bc");
      // 도장된 산업용 금속 느낌 — 살짝 광택(clearcoat) 있는 물리 재질
      const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
        color, roughness: 0.35, metalness: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.25,
      }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // STEP 원점/스케일이 제각각이라, 바닥에 붙이고 높이를 targetHeight에 맞춰 정규화한다.
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = targetHeight / Math.max(size.y, 1e-6);
    group.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);
    group.position.x -= center.x;
    group.position.z -= center.z;
    group.position.y -= scaledBox.min.y;

    return group;
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
function CadModel({ file, targetHeight, fallback, scanActive, scanColor }) {
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
  return <>
    <primitive object={group} />
    {scanActive && <ScanOverlay group={group} color={scanColor}/>}
  </>;
}

// 레퍼런스 사진처럼 배경을 채우는 장식용 로봇 라인 — 실제 설비 데이터와 무관.
// 클릭도 안 되고 진단 정보도 없는 순수 비주얼 요소라, 실제 자산 목록(사이드 패널)에는 나타나지 않는다.
// 전부 같은 targetHeight를 써서 캐시를 공유하므로 STEP은 한 번만 파싱된다.
const DECORATIVE_ROBOT_LINE = [-11.5, -8.3, -5.1, -1.9, 1.9, 5.1, 8.3, 11.5].map((x, i) => ({
  x, z: -9.4 + (i % 2 === 0 ? 0 : 0.35), rotY: (i % 2 === 0 ? 1 : -1) * 0.3 + 0.15,
}));

function DecorativeRobot({ x, z, rotY }) {
  const [group, setGroup] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadCadGroup("robot-arm.step", KIND_TO_CAD.ROBOT.targetHeight)
      .then((loaded) => { if (!cancelled) setGroup(loaded.clone(true)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
    {group ? <primitive object={group}/> : <RobotMachine accent="#23c8ee" alarm={false}/>}
  </group>;
}

function DecorativeRobotLine() {
  return <group>{DECORATIVE_ROBOT_LINE.map((r, i) => <DecorativeRobot key={i} {...r}/>)}</group>;
}

// 작업자는 3D로 표현하지 않는다 — 실제 GPS/UWB 위치 연동 전까지는 좌표를 지어낼 수밖에 없고,
// 그건 "진짜 위치"처럼 보여서 오해를 준다. 작업자 목록·위험도는 FactoryDetailTwin 사이드
// 패널(목록 클릭 → chooseWorker)에서만 보여준다.
function EquipmentTwinScene({ factory, selectedAsset, onSelectAsset }) {
  const controlsRef = useRef();
  const alarmIndex = factory.equipment.findIndex((asset) => asset.fault);
  const hasRealCad = factory.equipment.some((asset) => asset.cadModel || KIND_TO_CAD[asset.kind]);
  const resetCamera = () => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(18, 12, 22);
    controlsRef.current.target.set(0, 1.5, 0);
    controlsRef.current.update();
  };
  return <div className="twin-preserve-dark relative h-[610px] overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#06111a]">
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: [18, 12, 22], fov: 40, near: .1, far: 140 }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#06111a"]}/><fog attach="fog" args={["#06111a", 30, 70]}/>
        <Environment preset="studio" environmentIntensity={0.7}/>
        <hemisphereLight intensity={0.55} color="#f4f7f9" groundColor="#171c21"/>
        <directionalLight castShadow position={[10, 15, 10]} intensity={2.3} color="#fff6e6" shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0015}/>
        <pointLight position={[0, 7, 0]} intensity={5} color="#ffffff" distance={30} decay={2}/>
        <FactoryFloor profileKey={factory.profileKey}/>
        <DecorativeRobotLine/>
        <SafetyZone alarmPosition={POSITIONS[alarmIndex]}/>
        {factory.equipment.map((asset, index) => <MachineUnit key={asset.assetCode} asset={asset} position={POSITIONS[index] || [index * 2 - 4, 0, 0]}
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

// 밝은 회백색 천장 트러스 + 오버헤드 스튜디오 조명 패널 (레퍼런스의 균일하고 밝은 하이라이트용)
function OverheadStructure({ accent }) {
  return <group>
    <mesh position={[0, 6.9, 0]}><boxGeometry args={[29, .3, 21]}/><meshStandardMaterial color="#e9ebee" metalness={.15} roughness={.65}/></mesh>
    {[-11, -6.6, -2.2, 2.2, 6.6, 11].map((x) => <group key={x}>
      <rectAreaLight width={2.4} height={.45} intensity={6} color="#fff8ec" position={[x, 6.55, 0]} rotation={[-Math.PI / 2, 0, 0]}/>
      <mesh position={[x, 6.6, 0]}><boxGeometry args={[2.4, .06, .45]}/><meshStandardMaterial color="#fff8ec" emissive="#fff8ec" emissiveIntensity={1.4}/></mesh>
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

function MachineUnit({ asset, position, selected, onSelect }) {
  const alarm = Boolean(asset.fault);
  const warning = !alarm && asset.status === "WARNING";
  const running = asset.operatingState === "RUNNING";
  const seed = asset.assetCode.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 100;
  const accent = alarm ? "#ff3b4f" : selected ? "#ff9d38" : warning ? "#ffb23e" : "#23c8ee";
  const issuePositions = { ROBOT:[0,2.3,0], POSITIONER:[0,1.1,.4], CONVEYOR:[2.5,.55,0], CUTTER:[0,2.3,0], FAN:[0,1.65,.55], PUMP:[.7,.8,0], CRANE:[0,3.8,0] };

  const motion = { accent, alarm, warning, running, seed };
  const cad = asset.cadModel
    ? { file: asset.cadModel, targetHeight: asset.cadTargetHeight || 2.2 }
    : KIND_TO_CAD[asset.kind];
  const fallback = <KindFallback kind={asset.kind} motion={motion}/>;

  return <group position={position} onClick={(event)=>{event.stopPropagation();onSelect(asset);}} onPointerOver={()=>{document.body.style.cursor="pointer";}} onPointerOut={()=>{document.body.style.cursor="default";}}>
    {cad ? <CadModel file={cad.file} targetHeight={cad.targetHeight} fallback={fallback} scanActive={alarm || selected} scanColor={accent}/> : fallback}
    {alarm && <pointLight position={[0, (cad?.targetHeight || 2.2) * 0.55, 0]} intensity={10} distance={4} color="#ff2f48"/>}
    <mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.2,1.28,48]}/><meshBasicMaterial color={accent}/></mesh>
    {alarm && <FaultMarker position={issuePositions[asset.kind]} part={asset.fault.part} seed={seed}/>}
    <Html center position={[0,4.9,0]} distanceFactor={10}><button onClick={()=>onSelect(asset)} className={`min-w-[118px] rounded-lg border px-2.5 py-2 text-left shadow-xl backdrop-blur-md ${alarm?"border-red-400/60 bg-[#230b12]/90":"border-cyan-400/25 bg-[#07151f]/88"}`}><span className={`block text-[8px] font-black tracking-wider ${alarm?"text-red-300":"text-cyan-300"}`}>{asset.assetCode}</span><b className="mt-0.5 block whitespace-nowrap text-[10px] text-white">{asset.name}</b><small className={`mt-0.5 block text-[8px] ${alarm?"text-red-300":"text-slate-500"}`}>{alarm?asset.fault.symptom:`${asset.operatingState} · ${asset.utilization}%`}</small></button></Html>
  </group>;
}

function KindFallback({ kind, motion }) {
  switch (kind) {
    case "ROBOT": return <RobotMachine {...motion}/>;
    case "POSITIONER": return <PositionerMachine {...motion}/>;
    case "CONVEYOR": return <ConveyorMachine {...motion}/>;
    case "CUTTER": return <CutterMachine {...motion}/>;
    case "FAN": return <FanMachine {...motion}/>;
    case "PUMP": return <PumpMachine {...motion}/>;
    case "CRANE": return <CraneMachine {...motion}/>;
    default: return null;
  }
}

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

const CONVEYOR_LENGTH = 5.3;
const CONVEYOR_STRIP_COUNT = 4;

function ConveyorMachine({accent,alarm,warning,running,seed}) {
  const body = useRef();
  const strips = useRef([]);
  useFrame(({clock}) => {
    const t = clock.elapsedTime;
    const speed = speedMultiplier(alarm, warning);
    const jitter = alarm ? faultJitter(t, seed) : 0;

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
      const distanceToEdge = CONVEYOR_LENGTH / 2 - Math.abs(x);
      strip.material.opacity = Math.min(1, Math.max(0, distanceToEdge / .4));
    });
  });
  return <group ref={body}><RoundedBox castShadow receiveShadow args={[5.5,.42,1.6]} position={[0,.55,0]} radius={.12}><meshStandardMaterial color="#203c46" metalness={.58}/></RoundedBox>{Array.from({length:9}).map((_,i)=><mesh key={i} position={[-2.35+i*.59,.82,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.1,.1,1.35,12]}/><meshStandardMaterial color="#8ea7ad" metalness={.8}/></mesh>)}{running && Array.from({length:CONVEYOR_STRIP_COUNT}).map((_,index)=><mesh key={index} ref={(node)=>{strips.current[index]=node;}} position={[-CONVEYOR_LENGTH/2,.79,0]}><boxGeometry args={[.25,.05,1.3]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} transparent opacity={0} depthWrite={false}/></mesh>)}<mesh position={[2.55,.45,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.38,.38,.9,18]}/><meshStandardMaterial color={accent} emissive={alarm?accent:"#000"} emissiveIntensity={alarm?1.3:0}/></mesh></group>; }

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

function FaultMarker({position,part,seed=0}) {
  const ring = useRef();
  useFrame(({clock}) => { if (ring.current) { const s = 1 + Math.abs(faultJitter(clock.elapsedTime, seed)) * .3; ring.current.scale.setScalar(s); } });
  return <group position={position}><mesh ref={ring}><sphereGeometry args={[.16,18,18]}/><meshBasicMaterial color="#ff2f48"/></mesh><pointLight intensity={12} distance={3.2} color="#ff2f48"/><mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.32,.035,10,28]}/><meshBasicMaterial color="#ff5368"/></mesh><Html center position={[0,.6,0]} distanceFactor={9}><div className="whitespace-nowrap rounded-lg border border-red-400/60 bg-[#260810]/95 px-2 py-1 text-[9px] font-black text-red-200 shadow-[0_0_18px_rgba(255,47,72,.5)]">이상 부품 · {part}</div></Html></group>; }

export default EquipmentTwinScene;