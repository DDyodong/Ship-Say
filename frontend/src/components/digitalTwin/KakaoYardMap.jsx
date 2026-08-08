import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers3, Minus, Plus, RotateCcw } from "lucide-react";
import realFacilityTags from "./geojeShipyardTags.json";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY;
const YARD_ADDRESS = "경상남도 거제시 거제대로 3370";

// 실제 서베이된 이름 기준으로 대략적인 공정 분류를 추정 (원본 데이터의 category 필드는
// 전부 "조립/블록공장"으로 통일되어 있어서 필터용으로 쓰기엔 부정확함 — 이름으로 재분류)
function classifyType(name) {
  if (name.includes("도크") || name.includes("골리앗")) return "DOCK";
  if (name.includes("도장")) return "PAINTING";
  if (name.includes("의장")) return "OUTFITTING";
  if (name.includes("절단")) return "FABRICATION";
  return "ASSEMBLY";
}

const typeColors = {
  DOCK: "#4de0f5", PAINTING: "#ff9d38", OUTFITTING: "#c084fc",
  FABRICATION: "#35e0ad", ASSEMBLY: "#00d2ff",
};
const typeLabels = { DOCK: "도크·크레인", PAINTING: "도장", OUTFITTING: "의장", FABRICATION: "가공", ASSEMBLY: "조립·블록" };

// 업로드된 실측 데이터(위경도 + 실제 건물 외곽선 GeoJSON)를 그대로 사용
const defaultFacilities = realFacilityTags
  .filter((t) => t.status === "confirmed")
  .map((t) => ({
    code: `TAG-${t.id}`,
    name: t.name,
    type: classifyType(t.name),
    lat: t.lat,
    lng: t.lng,
    ring: t.geojson?.geometry?.coordinates?.[0]?.map(([lng, lat]) => ({ lat, lng })) || null,
  }));

const defaultWorkers = [];

function KakaoYardMap({ facilities = defaultFacilities, workers = defaultWorkers, overlayPanel, alertBanner, cameraFacilityCode, cameraDanger, onOpenShop, onUnavailable }) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [center, setCenter] = useState(null);

  const containerRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const polygonsRef = useRef([]);
  const labelsRef = useRef([]);
  const workerOverlaysRef = useRef([]);
  const blinkIntervalsRef = useRef([]);

  const typesPresent = useMemo(() => {
    const set = new Set(facilities.map((f) => f.type));
    return ["ALL", ...Array.from(set)];
  }, [facilities]);

  const counts = useMemo(() => {
    const result = {};
    facilities.forEach((f) => { result[f.type] = (result[f.type] || 0) + 1; });
    return result;
  }, [facilities]);

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
    // 위성영상만 표시하고 HYBRID의 도로명·지명 레이어는 제외한다.
    map.setMapTypeId(kakao.maps.MapTypeId.SKYVIEW);
    map.setZoomable(true); // 페이지가 지도 하나뿐이라 스크롤 충돌 걱정 없음 — 휠로 확대/축소 가능
    mapRef.current = map;

    // 컨테이너 크기가 바뀔 때(사이드바 유무 전환, 창 크기 변경 등) 지도가 처음 그려진 크기로
    // 굳어버리는 걸 방지 — 카카오맵은 리사이즈를 자동 감지 못 하는 경우가 있어서 명시적으로 알려줘야 함
    const relayout = () => {
      map.relayout();
      map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
    };
    const resizeObserver = new ResizeObserver(() => relayout());
    resizeObserver.observe(mapDivRef.current);
    window.addEventListener("resize", relayout);
    const initialTimer = setTimeout(relayout, 100); // 초기 레이아웃이 다 자리잡은 직후 한 번 더 보정

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", relayout);
      clearTimeout(initialTimer);
    };
  }, [sdkReady, center]);

  // 실제 건물 외곽선(폴리곤) + 이름 라벨 그리기
  useEffect(() => {
    if (!sdkReady || !center || !mapRef.current) return;
    const kakao = window.kakao;

    blinkIntervalsRef.current.forEach((id) => clearInterval(id));
    blinkIntervalsRef.current = [];
    polygonsRef.current.forEach((p) => p.setMap(null));
    labelsRef.current.forEach((l) => l.setMap(null));
    polygonsRef.current = [];
    labelsRef.current = [];

    facilities.forEach((f) => {
      const show = filter === "ALL" || f.type === filter;
      if (!show) return;

      const isCameraZone = cameraFacilityCode && f.code === cameraFacilityCode;
      const isDanger = isCameraZone && cameraDanger;
      const color = isDanger ? "#ff2448" : isCameraZone ? "#00d2ff" : (typeColors[f.type] || typeColors.ASSEMBLY);
      const isSelected = selected?.code === f.code;

      if (f.ring && f.ring.length > 2) {
        const path = f.ring.map((pt) => new kakao.maps.LatLng(pt.lat, pt.lng));
        const polygon = new kakao.maps.Polygon({
          path,
          strokeWeight: isDanger ? 4 : isSelected || isCameraZone ? 3 : 1.6,
          strokeColor: color,
          strokeOpacity: 0.95,
          fillColor: color,
          fillOpacity: isSelected || isCameraZone ? 0.42 : 0.24,
        });
        kakao.maps.event.addListener(polygon, "click", () => {
          setSelected(f);
          onOpenShop?.(f.code);
        });
        kakao.maps.event.addListener(polygon, "mouseover", () => polygon.setOptions({ fillOpacity: 0.5 }));
        kakao.maps.event.addListener(polygon, "mouseout", () => polygon.setOptions({ fillOpacity: isSelected || isCameraZone ? 0.42 : 0.24 }));
        polygon.setMap(mapRef.current);
        polygonsRef.current.push(polygon);

        // 위험 감지 중이면 테두리를 깜빡여서 시선을 끔
        if (isDanger) {
          let on = true;
          const blinkId = setInterval(() => {
            on = !on;
            polygon.setOptions({ fillOpacity: on ? 0.5 : 0.2, strokeOpacity: on ? 1 : 0.4 });
          }, 550);
          blinkIntervalsRef.current.push(blinkId);
        }
      }

      const el = document.createElement("div");
      el.style.cssText = `
        padding: 3px 8px; border-radius: 5px; background: ${isDanger ? "rgba(255,36,72,.85)" : "rgba(0,0,0,.65)"};
        border: 1px solid ${isDanger ? "#ff2448" : isCameraZone ? "#00d2ff" : isSelected ? "#4de0f5" : "rgba(255,255,255,.25)"};
        font: 700 10px Inter, sans-serif; color: #fff; white-space: nowrap;
        text-shadow: 0 1px 3px rgba(0,0,0,.8); cursor: pointer; pointer-events: auto;
        display: flex; align-items: center; gap: 4px;
      `;
      el.innerHTML = `${isCameraZone ? `<span style="font-size:8px;opacity:.9;">📹</span>` : ""}${f.name}${isDanger ? ` <span style="font-size:8px;font-weight:800;">⚠ 위험감지</span>` : ""}`;
      el.addEventListener("click", () => { setSelected(f); onOpenShop?.(f.code); });

      const label = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(f.lat, f.lng),
        content: el,
        yAnchor: 0.5,
      });
      label.setMap(mapRef.current);
      labelsRef.current.push(label);
    });
    return () => blinkIntervalsRef.current.forEach((id) => clearInterval(id));
  }, [sdkReady, center, facilities, selected, filter, cameraFacilityCode, cameraDanger, onOpenShop]);

  useEffect(() => {
    if (!sdkReady || !center || !mapRef.current) return;
    const kakao = window.kakao;
    workerOverlaysRef.current.forEach((o) => o.setMap(null));
    workerOverlaysRef.current = workers
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => {
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(w.lat, w.lng),
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

  if (sdkError) {
    return <section className="rounded-xl bg-panel border border-edge p-6 text-sm text-slate-300">
      <p className="font-bold text-danger mb-2">카카오맵을 불러올 수 없습니다</p>
      <p>{sdkError}</p>
    </section>;
  }

  return <section className="bg-panel border-b border-edge overflow-hidden">
    <style>{`
      @keyframes toastIn { 0% { transform: translateY(24px) scale(.96); opacity: 0; } 60% { transform: translateY(-4px) scale(1.01); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
      .animate-toast-in { animation: toastIn .35s cubic-bezier(.34,1.56,.64,1); }
    `}</style>
    <div ref={containerRef} className="relative" style={{ height: "calc(100dvh - 46px)" }}>
      <div ref={mapDivRef} className="absolute inset-0"/>
      {(!sdkReady || !center) && <div className="absolute inset-0 flex items-center justify-center bg-ink/70 text-slate-300 text-sm z-20">
        {!sdkReady ? "카카오맵 SDK 불러오는 중..." : "주소 좌표 확인 중..."}
      </div>}

      <div className="absolute top-4 left-4 z-10 w-52 rounded-2xl border border-cyan/15 bg-ink/55 backdrop-blur-xl shadow-xl overflow-hidden">
        <div className="p-3 flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-200 mb-2"><Layers3 size={13} className="text-cyan"/> 구역 필터</div>
            <div className="flex flex-col gap-1">
              {typesPresent.map((value) => <button key={value}
                onClick={() => setFilter(value)}
                className={`text-left px-2 py-1.5 rounded-md text-[11px] font-mono transition-all ${filter === value
                  ? "bg-cyan/15 text-cyan border border-cyan/30" : "text-slate-300/80 hover:text-white border border-transparent"}`}>
                {value === "ALL" ? "전체 야드" : typeLabels[value] || value}
              </button>)}
            </div>
          </div>
          <div>
            {/* <div className="text-[10px] font-bold text-slate-200 mb-1.5">지도 조작</div>
            <div className="flex gap-1.5">
              <button onClick={zoomOut} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><Minus size={11}/></button>
              <button onClick={zoomIn} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><Plus size={11}/></button>
              <button onClick={resetView} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><RotateCcw size={11}/></button>
            </div> */}
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-200 mb-1.5">시설 현황</div>
            <div className="flex flex-col gap-1 text-[11px]">
              {Object.entries(counts).map(([type, n]) => <div key={type} className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                <span className="flex items-center gap-1.5 text-slate-200"><span className="w-1.5 h-1.5 rounded-full" style={{ background: typeColors[type] }}/>{typeLabels[type] || type}</span>
                <span className="font-bold" style={{ color: typeColors[type] }}>{n}</span>
              </div>)}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-4 z-10 flex flex-col gap-2" style={{ right: overlayPanel ? 340 : 16 }}>
        <div className="px-2.5 py-1.5 bg-ink/60 backdrop-blur-md border border-white/10 rounded text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
          <i className="fa-solid fa-camera text-cyan text-[10px]"/> CAM-01: 실시간 분석 중
        </div>
      </div>

      {alertBanner && <>
        <div className="absolute inset-0 border-4 border-danger/50 pointer-events-none z-30 blink"/>
        <div className="absolute z-40 left-1/2 -translate-x-1/2 pointer-events-none" style={{ bottom: 24, width: "min(92%, 440px)" }}>
          <div className="pointer-events-auto animate-toast-in">
            {alertBanner}
          </div>
        </div>
      </>}

      {overlayPanel && <div style={{ position: "absolute", right: 16, top: 16, width: 230, zIndex: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {overlayPanel}
      </div>}

      <div className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-lg bg-ink/55 backdrop-blur-md border border-white/10 text-[11px] text-slate-300">
        시설 {facilities.length}개 · 한화오션 거제사업장 (실측 좌표)
      </div>

      {selected && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(90%,520px)] rounded-xl bg-ink/70 backdrop-blur-xl border border-white/10 px-4 py-3 flex items-center gap-4">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: typeColors[selected.type] }}/>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{selected.name}</p>
          <p className="text-[10px] font-mono text-slate-400">{typeLabels[selected.type]} · {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</p>
        </div>
        <button className="ml-auto text-xs font-semibold text-cyan border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10 shrink-0"
          onClick={() => onUnavailable?.(selected.name)}>상세 설비 연동 예정</button>
        <button className="text-slate-400 hover:text-white text-lg leading-none shrink-0" onClick={() => setSelected(null)}>×</button>
      </div>}
    </div>
  </section>;
}

export default KakaoYardMap;