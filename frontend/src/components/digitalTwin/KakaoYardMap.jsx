import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Layers3, Minus, Plus, RotateCcw } from "lucide-react";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY;
const YARD_ADDRESS = "경상남도 거제시 거제대로 3370";
const STORAGE_KEY = "yardFacilityPositions.v1"; // 이 브라우저에만 저장됨 — 팀 전체 공유는 별도 백엔드 저장이 필요

const categories = [
  ["ALL", "전체 야드"], ["FABRICATION", "가공"], ["ASSEMBLY", "조립"],
  ["PAINTING", "도장"], ["OUTFITTING", "의장"], ["DOCK", "도크"],
];

const riskColors = { low: "#35e0ad", medium: "#ff9d38", high: "#ff5169", critical: "#ff2448" };

const DEG_PER_PX_LNG = 0.0000197;
const DEG_PER_PX_LAT = 0.0000144;
function gridToLatLng(center, x, y) {
  return {
    lat: center.lat + (280 - y) * DEG_PER_PX_LAT,
    lng: center.lng + (x - 500) * DEG_PER_PX_LNG,
  };
}

const defaultFacilities = [
  { code: "DOCK-01", name: "제1도크", type: "DOCK", risk: "low", prog: 82, x: 80, y: 40 },
  { code: "DOCK-02", name: "제2도크", type: "DOCK", risk: "low", prog: 76, x: 280, y: 40 },
  { code: "FDOCK-03", name: "부유식도크 RD-3", type: "DOCK", risk: "low", prog: 91, x: 480, y: 40 },
  { code: "FDOCK-04", name: "부유식도크 RD-4", type: "DOCK", risk: "medium", prog: 58, x: 680, y: 40 },
  { code: "FDOCK-05", name: "부유식도크 RD-5", type: "DOCK", risk: "low", prog: 69, x: 880, y: 40 },
  { code: "ASSEMBLY-01", name: "블록 조립 1공장", type: "ASSEMBLY", risk: "low", prog: 88, x: 160, y: 220 },
  { code: "ASSEMBLY-02", name: "블록 조립 2공장", type: "ASSEMBLY", risk: "low", prog: 49, x: 380, y: 220 },
  { code: "SPECIAL-SHOP", name: "특수선 건조공장", type: "ASSEMBLY", risk: "low", prog: 55, x: 600, y: 220 },
  { code: "OFFSHORE-SHOP", name: "해양플랜트 공장", type: "ASSEMBLY", risk: "medium", prog: 41, x: 820, y: 220 },
  { code: "CUTTING-SHOP", name: "강재 절단공장", type: "FABRICATION", risk: "low", prog: 74, x: 90, y: 400 },
  { code: "CURVED-BLOCK", name: "곡블록 가공공장", type: "FABRICATION", risk: "low", prog: 64, x: 290, y: 400 },
  { code: "T-BAR-SHOP", name: "T-BAR 자동용접 SHOP", type: "FABRICATION", risk: "critical", prog: 63, x: 490, y: 400, danger: true },
  { code: "PAINT-01", name: "도장 1공장", type: "PAINTING", risk: "low", prog: 69, x: 690, y: 400 },
  { code: "PAINT-02", name: "도장 2공장", type: "PAINTING", risk: "medium", prog: 43, x: 160, y: 500 },
  { code: "OUTFIT-SHOP", name: "의장 공장", type: "OUTFITTING", risk: "low", prog: 76, x: 380, y: 500 },
  { code: "QUAY-01", name: "안벽 1구역", type: "QUAY", risk: "low", prog: 94, x: 600, y: 500 },
];

const defaultWorkers = [
  { id: "088", x: 350, y: 460, danger: false, label: "ID:088" },
  { id: "000", x: 490, y: 440, danger: true, label: "ID:000 ⚠" },
];

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function KakaoYardMap({ facilities = defaultFacilities, workers = defaultWorkers, overlayPanel, alertBanner, onOpenShop, onUnavailable }) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [center, setCenter] = useState(null);
  const [overrides, setOverrides] = useState(loadOverrides);
  const [editMode, setEditMode] = useState(false);
  const [placing, setPlacing] = useState(null);

  const containerRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const tagsRef = useRef([]);
  const workerOverlaysRef = useRef([]);
  const mapClickListenerRef = useRef(null);

  const counts = useMemo(() => ({
    low: facilities.filter((f) => f.risk === "low").length,
    medium: facilities.filter((f) => f.risk === "medium").length,
    danger: facilities.filter((f) => ["high", "critical"].includes(f.risk)).length,
  }), [facilities]);

  useEffect(() => {
    if (window.kakao && window.kakao.maps) { setSdkReady(true); return; }
    if (!KAKAO_JS_KEY) { setSdkError("VITE_KAKAO_JS_KEY가 설정되지 않았습니다."); return; }
    const existing = document.querySelector("script[data-kakao-maps-sdk]");
    if (existing) { existing.addEventListener("load", () => window.kakao.maps.load(() => setSdkReady(true))); return; }
    const script = document.createElement("script");
    script.setAttribute("data-kakao-maps-sdk", "true");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;
    script.onload = () => window.kakao.maps.load(() => setSdkReady(true));
    script.onerror = () => setSdkError("카카오맵 SDK 로드에 실패했습니다.");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!sdkReady) return;
    const kakao = window.kakao;
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(YARD_ADDRESS, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result[0]) {
        setCenter({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
      } else {
        setSdkError(`"${YARD_ADDRESS}" 주소를 좌표로 변환하지 못했습니다.`);
      }
    });
  }, [sdkReady]);

  useEffect(() => {
    if (!sdkReady || !center || !mapDivRef.current || mapRef.current) return;
    const kakao = window.kakao;
    const map = new kakao.maps.Map(mapDivRef.current, {
      center: new kakao.maps.LatLng(center.lat, center.lng),
      level: 4,
    });
    map.setMapTypeId(kakao.maps.MapTypeId.HYBRID);
    map.setZoomable(false); // 휠 스크롤로 지도가 확대되며 페이지 스크롤을 가로채는 것 방지 (드래그 이동은 그대로 유지, +/- 버튼도 별개로 동작)
    mapRef.current = map;
  }, [sdkReady, center]);

  useEffect(() => {
    const kakao = window.kakao;
    if (!kakao || !mapRef.current) return;
    if (mapClickListenerRef.current) {
      kakao.maps.event.removeListener(mapRef.current, "click", mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }
    if (!editMode) return;

    const handler = (mouseEvent) => {
      if (!placing) return;
      const latlng = mouseEvent.latLng;
      setOverrides((prev) => {
        const next = { ...prev, [placing]: { lat: latlng.getLat(), lng: latlng.getLng() } };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setPlacing(null);
    };
    mapClickListenerRef.current = handler;
    kakao.maps.event.addListener(mapRef.current, "click", handler);
    return () => {
      if (mapClickListenerRef.current) kakao.maps.event.removeListener(mapRef.current, "click", mapClickListenerRef.current);
    };
  }, [editMode, placing]);

  useEffect(() => {
    if (!sdkReady || !center || !mapRef.current) return;
    const kakao = window.kakao;

    tagsRef.current.forEach((o) => o.setMap(null));
    tagsRef.current = [];

    facilities.forEach((f) => {
      const color = riskColors[f.risk] || riskColors.low;
      const isSelected = selected?.code === f.code;
      const isDanger = !!f.danger;
      const isPlacing = placing === f.code;
      const show = filter === "ALL" || f.type === filter || (filter === "DOCK" && f.type === "QUAY");
      if (!show) return;

      const override = overrides[f.code];
      const p = override || gridToLatLng(center, f.x, f.y);

      const el = document.createElement("div");
      el.style.cssText = `
        position:relative; width:100px; display:flex; flex-direction:column; align-items:center;
        cursor:pointer; font-family:Inter,sans-serif;
      `;
      el.innerHTML = `
        <div style="background:rgba(0,0,0,.62); padding:2px 7px; border-radius:4px; font-size:8px;
          color:${override ? "#d6f3f7" : "#ffb35c"}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          max-width:100px; margin-bottom:4px; box-shadow:0 2px 8px rgba(0,0,0,.4);">
          ${f.name}${!override ? " ·미보정" : ""}
        </div>
        <div style="position:relative;">
          <div style="width:34px;height:34px;border-radius:50%;
            border:3px solid ${isPlacing ? "#ffd23f" : isSelected ? "#4de0f5" : color};
            background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center;
            box-shadow:0 0 10px ${isPlacing ? "rgba(255,210,63,.6)" : isDanger ? "rgba(255,36,72,.55)" : color + "88"};">
            <span style="font-size:11px;font-weight:800;color:#fff;">${f.prog}</span>
          </div>
          ${isDanger ? `<div style="position:absolute;bottom:-3px;right:-3px;width:13px;height:13px;
            background:#ff2448;border:1.5px solid #fff;transform:rotate(45deg);"></div>` : ""}
        </div>
        <div style="width:28px;height:3px;border-radius:2px;background:rgba(255,255,255,.2);margin-top:5px;overflow:hidden;">
          <div style="height:100%;width:${f.prog}%;background:${color};"></div>
        </div>
      `;
      el.addEventListener("click", (evt) => {
        if (editMode) {
          evt.stopPropagation?.();
          setPlacing(f.code);
          return;
        }
        setSelected(f);
        if (f.code === "T-BAR-SHOP") onOpenShop?.(f.code);
      });

      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        content: el,
        yAnchor: 1,
      });
      overlay.setMap(mapRef.current);
      tagsRef.current.push(overlay);
    });
  }, [sdkReady, center, facilities, selected, filter, overrides, editMode, placing, onOpenShop]);

  useEffect(() => {
    if (!sdkReady || !center || !mapRef.current) return;
    const kakao = window.kakao;
    workerOverlaysRef.current.forEach((o) => o.setMap(null));
    workerOverlaysRef.current = workers.map((w) => {
      const p = gridToLatLng(center, w.x, w.y);
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        yAnchor: 0.5,
        content: `<div style="display:flex;align-items:center;gap:5px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${w.danger ? "#ff2448" : "#00d2ff"};box-shadow:0 0 8px ${w.danger ? "#ff2448" : "#00d2ff"};display:inline-block;"></span>
          <span style="font:800 11px 'JetBrains Mono',monospace;color:${w.danger ? "#ff2448" : "#00d2ff"};text-shadow:0 1px 4px rgba(0,0,0,.9);">${w.label}</span>
        </div>`,
      });
      overlay.setMap(mapRef.current);
      return overlay;
    });
  }, [sdkReady, center, workers]);

  const zoomIn = () => mapRef.current?.setLevel(mapRef.current.getLevel() - 1);
  const zoomOut = () => mapRef.current?.setLevel(mapRef.current.getLevel() + 1);
  const resetView = () => {
    if (!mapRef.current || !center) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
    mapRef.current.setLevel(4);
  };
  const clearOverrides = () => {
    if (!window.confirm("보정한 모든 위치를 초기화할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setOverrides({});
  };

  if (sdkError) {
    return <section className="rounded-xl bg-panel border border-edge p-6 text-sm text-slate-300">
      <p className="font-bold text-danger mb-2">카카오맵을 불러올 수 없습니다</p>
      <p>{sdkError}</p>
    </section>;
  }

  const uncalibratedCount = facilities.filter((f) => !overrides[f.code]).length;

  return <section className="bg-panel border-b border-edge overflow-hidden">
    <style>{`
      @keyframes toastIn { 0% { transform: translateY(24px) scale(.96); opacity: 0; } 60% { transform: translateY(-4px) scale(1.01); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
      .animate-toast-in { animation: toastIn .35s cubic-bezier(.34,1.56,.64,1); }
    `}</style>
    <div ref={containerRef} className="relative" style={{ height: 640 }}>
      <div ref={mapDivRef} className="absolute inset-0"/>
      {(!sdkReady || !center) && <div className="absolute inset-0 flex items-center justify-center bg-ink/70 text-slate-300 text-sm z-20">
        {!sdkReady ? "카카오맵 SDK 불러오는 중..." : "주소 좌표 확인 중..."}
      </div>}

      <div className="absolute top-4 left-4 z-10 w-52 rounded-2xl border border-cyan/15 bg-ink/55 backdrop-blur-xl shadow-xl overflow-hidden">
        <div className="p-3 flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-200 mb-2"><Layers3 size={13} className="text-cyan"/> 구역 필터</div>
            <div className="flex flex-col gap-1">
              {categories.map(([value, label]) => <button key={value}
                onClick={() => setFilter(value)}
                className={`text-left px-2 py-1.5 rounded-md text-[11px] font-mono transition-all ${filter === value
                  ? "bg-cyan/15 text-cyan border border-cyan/30" : "text-slate-300/80 hover:text-white border border-transparent"}`}>
                {label}
              </button>)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-200 mb-1.5">지도 조작</div>
            <div className="flex gap-1.5">
              <button onClick={zoomOut} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><Minus size={11}/></button>
              <button onClick={zoomIn} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><Plus size={11}/></button>
              <button onClick={resetView} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><RotateCcw size={11}/></button>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-200 mb-1.5"><Crosshair size={12} className="text-amber"/> 위치 보정</div>
            <button onClick={() => { setEditMode((v) => !v); setPlacing(null); }}
              className={`w-full h-7 rounded-md text-[11px] font-bold transition-colors ${
                editMode ? "bg-amber/20 border border-amber/40 text-amber" : "bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10"}`}>
              {editMode ? "편집 모드 끄기" : "편집 모드 켜기"}
            </button>
            {editMode && <p className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">
              {placing ? "지도를 클릭해 위치를 지정하세요" : "옮길 태그를 먼저 클릭하세요"}
            </p>}
            {uncalibratedCount > 0 && <p className="text-[9px] text-amber mt-1.5">미보정 {uncalibratedCount}개 (주황 테두리)</p>}
            {editMode && <button onClick={clearOverrides} className="w-full mt-1.5 h-6 rounded text-[9px] text-slate-400 hover:text-danger border border-white/10">전체 초기화</button>}
          </div>

          <div>
            <div className="text-[10px] font-bold text-slate-200 mb-1.5">시설 현황</div>
            <div className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                <span className="flex items-center gap-1.5 text-slate-200"><span className="w-1.5 h-1.5 rounded-full" style={{ background: riskColors.low }}/>정상</span>
                <span className="font-bold" style={{ color: riskColors.low }}>{counts.low}</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                <span className="flex items-center gap-1.5 text-slate-200"><span className="w-1.5 h-1.5 rounded-full" style={{ background: riskColors.medium }}/>주의</span>
                <span className="font-bold" style={{ color: riskColors.medium }}>{counts.medium}</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                <span className="flex items-center gap-1.5 text-slate-200"><span className="w-1.5 h-1.5 rounded-full" style={{ background: riskColors.critical }}/>위험</span>
                <span className="font-bold" style={{ color: riskColors.critical }}>{counts.danger}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-4 z-10 flex flex-col gap-2" style={{ right: overlayPanel ? 340 : 16 }}>
        <div className="px-2.5 py-1.5 bg-ink/60 backdrop-blur-md border border-white/10 rounded text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
          <i className="fa-solid fa-camera text-cyan text-[10px]"/> CAM-01: 실시간 분석 중
        </div>
        {counts.danger > 0 && <div className="px-2.5 py-1.5 bg-danger/20 backdrop-blur-md border border-danger/40 rounded text-[11px] font-bold text-danger flex items-center gap-1.5 blink">
          <i className="fa-solid fa-triangle-exclamation text-[10px]"/> 위험 시나리오 감지
        </div>}
      </div>

      {alertBanner && <>
        {/* 화면 테두리 플래시 — 긴급함 강조 */}
        <div className="absolute inset-0 border-4 border-danger/50 pointer-events-none z-30 blink"/>
        <div className="absolute z-40 left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: 24, width: "min(92%, 440px)" }}>
          <div className="pointer-events-auto animate-toast-in">
            {alertBanner}
          </div>
        </div>
      </>}

      {overlayPanel && <div style={{ position: "absolute", right: 16, top: 16, width: 320, zIndex: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {overlayPanel}
      </div>}

      <div className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-lg bg-ink/55 backdrop-blur-md border border-white/10 text-[11px] text-slate-300">
        시설 {facilities.length}개 · 한화오션 거제사업장
      </div>

      {selected && selected.code !== "T-BAR-SHOP" && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(90%,520px)] rounded-xl bg-ink/70 backdrop-blur-xl border border-white/10 px-4 py-3 flex items-center gap-4">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: riskColors[selected.risk] }}/>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{selected.name}</p>
          <p className="text-[10px] font-mono text-slate-400">{selected.code} · {selected.prog}%</p>
        </div>
        <button className="ml-auto text-xs font-semibold text-cyan border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10 shrink-0"
          onClick={() => onUnavailable?.(selected.name)}>상세 설비 연동 예정</button>
        <button className="text-slate-400 hover:text-white text-lg leading-none shrink-0" onClick={() => setSelected(null)}>×</button>
      </div>}
    </div>
  </section>;
}

export default KakaoYardMap;