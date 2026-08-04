import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Layers3 } from "lucide-react";

// ⚠ 실시간 데이터 연동이나 정밀 CAD 도면 기반이 아닙니다. 팀 문서에서 제외한
// "실시간 텔레메트리·로봇팔 애니메이션"과는 다른, 정적인 3D 야드 조감도(장식용)입니다.
// 건물 타입별로 지붕 실루엣을 다르게 하고, 도크엔 정박한 배 모형, 조립구역엔 크레인을
// 추가해서 한눈에 "가공/조립/도장/도크"가 구분되도록 만들었습니다.

const riskColors = { low: 0x35e0ad, medium: 0xff9d38, high: 0xff5169, critical: 0xff2448 };

const defaultFacilities = [
  { code: "DOCK-01", name: "제1도크", type: "DOCK", risk: "low", prog: 82, x: 80, z: 40, w: 150, d: 60, h: 8 },
  { code: "DOCK-02", name: "제2도크", type: "DOCK", risk: "low", prog: 76, x: 280, z: 40, w: 150, d: 60, h: 8 },
  { code: "FDOCK-03", name: "부유식도크 RD-3", type: "DOCK", risk: "low", prog: 91, x: 480, z: 40, w: 150, d: 60, h: 8 },
  { code: "FDOCK-04", name: "부유식도크 RD-4", type: "DOCK", risk: "medium", prog: 58, x: 680, z: 40, w: 150, d: 60, h: 8 },
  { code: "FDOCK-05", name: "부유식도크 RD-5", type: "DOCK", risk: "low", prog: 69, x: 880, z: 40, w: 150, d: 60, h: 8 },
  { code: "ASSEMBLY-01", name: "블록 조립 1공장", type: "ASSEMBLY", risk: "low", prog: 88, x: 160, z: 220, w: 170, d: 90, h: 46 },
  { code: "ASSEMBLY-02", name: "블록 조립 2공장", type: "ASSEMBLY", risk: "low", prog: 49, x: 380, z: 220, w: 170, d: 90, h: 46 },
  { code: "SPECIAL-SHOP", name: "특수선 건조공장", type: "ASSEMBLY", risk: "low", prog: 55, x: 600, z: 220, w: 170, d: 90, h: 46 },
  { code: "OFFSHORE-SHOP", name: "해양플랜트 공장", type: "ASSEMBLY", risk: "medium", prog: 41, x: 820, z: 220, w: 170, d: 90, h: 46 },
  { code: "CUTTING-SHOP", name: "강재 절단공장", type: "FABRICATION", risk: "low", prog: 74, x: 90, z: 400, w: 140, d: 80, h: 28 },
  { code: "CURVED-BLOCK", name: "곡블록 가공공장", type: "FABRICATION", risk: "low", prog: 64, x: 290, z: 400, w: 140, d: 80, h: 28 },
  { code: "T-BAR-SHOP", name: "T-BAR 자동용접 SHOP", type: "FABRICATION", risk: "critical", prog: 63, x: 490, z: 400, w: 140, d: 80, h: 28, danger: true },
  { code: "PAINT-01", name: "도장 1공장", type: "PAINTING", risk: "low", prog: 69, x: 690, z: 400, w: 140, d: 80, h: 24 },
  { code: "PAINT-02", name: "도장 2공장", type: "PAINTING", risk: "medium", prog: 43, x: 160, z: 500, w: 140, d: 80, h: 24 },
  { code: "OUTFIT-SHOP", name: "의장 공장", type: "OUTFITTING", risk: "low", prog: 76, x: 380, z: 500, w: 140, d: 80, h: 22 },
  { code: "QUAY-01", name: "안벽 1구역", type: "QUAY", risk: "low", prog: 94, x: 600, z: 500, w: 140, d: 40, h: 5 },
];

// 배 선체(위에서 본 오각형: 사각형 + 뾰족한 뱃머리)를 수직으로 압출해서 만듦
function shipHullGeometry(length, width, height) {
  const w = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, -w);
  shape.lineTo(length / 2 - width * 0.7, -w);
  shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2 - width * 0.7, w);
  shape.lineTo(-length / 2, w);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  return geo;
}

function addShip(scene, x, z, length, width, hullColor = 0xc9d3d8) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    shipHullGeometry(length, width, 6),
    new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.6 })
  );
  hull.position.set(0, 3, 0);
  group.add(hull);

  const deckhouse = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.5, 10, width * 0.6),
    new THREE.MeshStandardMaterial({ color: 0x33586c, roughness: 0.7 })
  );
  deckhouse.position.set(-length * 0.28, 6 + 5, 0);
  group.add(deckhouse);

  group.position.set(x, 0, z);
  scene.add(group);
}

function addCrane(scene, x, z, height = 70, span = 90, color = 0xffb300) {
  const group = new THREE.Group();
  const legMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const legGeo = new THREE.BoxGeometry(4, height, 4);
  const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-span / 2, height / 2, 0);
  const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(span / 2, height / 2, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 8, 4, 4), legMat);
  beam.position.set(0, height, 0);
  group.add(legL, legR, beam);
  group.position.set(x, 0, z);
  scene.add(group);
}

// 건물 타입별로 지붕 실루엣을 다르게 만듦
function buildFacilityGroup(f) {
  const group = new THREE.Group();
  const wallColor = 0x1c3d4d;
  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8 });

  if (f.type === "DOCK" || f.type === "QUAY") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), wallMat);
    base.position.y = f.h / 2;
    group.add(base);
  } else if (f.type === "ASSEMBLY") {
    const wallH = f.h * 0.7;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(f.w, wallH, f.d), wallMat);
    wall.position.y = wallH / 2;
    group.add(wall);

    const roofR = f.d / 2;
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(roofR, roofR, f.w, 20, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2a5468, roughness: 0.6 })
    );
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = wallH;
    group.add(roof);
  } else {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), wallMat);
    wall.position.y = f.h / 2;
    group.add(wall);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(f.w * 1.02, 2, f.d * 1.02),
      new THREE.MeshStandardMaterial({ color: 0x274b5c, roughness: 0.7 })
    );
    roof.position.y = f.h + 1;
    group.add(roof);

    const ventMat = new THREE.MeshStandardMaterial({ color: 0x3a6478, roughness: 0.6 });
    const ventCount = 2 + (f.w % 3);
    for (let i = 0; i < ventCount; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), ventMat);
      vent.position.set(
        (i - (ventCount - 1) / 2) * (f.w / (ventCount + 1)),
        f.h + 4.5,
        (i % 2 === 0 ? -1 : 1) * f.d * 0.15
      );
      group.add(vent);
    }
  }

  group.position.set(f.x, 0, f.z);
  group.userData = f;
  return group;
}

function YardTwin3D({ facilities = defaultFacilities, onOpenShop, onUnavailable }) {
  const mountRef = useRef(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth, height = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081722);
    scene.fog = new THREE.Fog(0x081722, 900, 2200);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(-200, 620, 950);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(480, 0, 280);
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 200;
    controls.maxDistance = 1800;
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(-400, 800, 300);
    scene.add(sun);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ color: 0x0a2c40, roughness: 0.3, metalness: 0.1 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(480, -1, -180);
    scene.add(water);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1300, 700),
      new THREE.MeshStandardMaterial({ color: 0x16303e, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(480, 0, 280);
    scene.add(ground);

    const grid = new THREE.GridHelper(1300, 26, 0x24506a, 0x1a3a4c);
    grid.position.set(480, 0.5, 280);
    scene.add(grid);

    const buildingMeshes = [];
    facilities.forEach((f) => {
      const group = buildFacilityGroup(f);
      scene.add(group);

      const color = riskColors[f.risk] ?? riskColors.low;
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(f.w, f.h, f.d)),
        new THREE.LineBasicMaterial({ color })
      );
      outline.position.set(f.x, f.h / 2, f.z);
      scene.add(outline);

      if (f.danger) {
        const halo = new THREE.Mesh(
          new THREE.BoxGeometry(f.w * 1.1, f.h * 1.1, f.d * 1.1),
          new THREE.MeshBasicMaterial({ color: 0xff2448, transparent: true, opacity: 0.12 })
        );
        halo.position.set(f.x, f.h / 2, f.z);
        scene.add(halo);
      }

      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(f.w, Math.max(f.h, 46), f.d),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.set(f.x, Math.max(f.h, 46) / 2, f.z);
      hitbox.userData = f;
      scene.add(hitbox);
      buildingMeshes.push(hitbox);
    });

    facilities.filter((f) => f.type === "DOCK").forEach((f) => {
      addShip(scene, f.x, f.z - f.d * 0.05, f.w * 0.72, f.d * 0.55);
    });

    addCrane(scene, 160, 165, 80, 130);
    addCrane(scene, 600, 165, 90, 150, 0xff9d38);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(buildingMeshes)[0];
      if (hit) {
        const f = hit.object.userData;
        setSelected(f);
        if (f.code === "T-BAR-SHOP") onOpenShop?.(f.code);
      }
    };
    renderer.domElement.addEventListener("click", onClick);

    let raf;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities]);

  return <section className="bg-panel border-b border-edge overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-edge text-[11px] text-slate-300">
      <Layers3 size={14} className="text-cyan"/> 3D 야드 조감도 (데모용 · 마우스 드래그 회전 / 스크롤 줌)
    </div>
    <div className="relative" style={{ height: 620 }}>
      <div ref={mountRef} className="absolute inset-0"/>

      {selected && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(90%,520px)] rounded-xl bg-ink/80 backdrop-blur-xl border border-white/10 px-4 py-3 flex items-center gap-4">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: `#${(riskColors[selected.risk] ?? riskColors.low).toString(16).padStart(6, "0")}` }}/>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{selected.name}{selected.danger ? " ⚠" : ""}</p>
          <p className="text-[10px] font-mono text-slate-400">{selected.code} · {selected.prog}%</p>
        </div>
        <button className="ml-auto text-xs font-semibold text-cyan border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10 shrink-0"
          onClick={() => onUnavailable?.(selected.name)}>상세 설비 연동 예정</button>
        <button className="text-slate-400 hover:text-white text-lg leading-none shrink-0" onClick={() => setSelected(null)}>×</button>
      </div>}
    </div>
  </section>;
}

export default YardTwin3D;