import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers3, Minus, Plus, RotateCcw } from "lucide-react";
import realFacilityTags from "./geojeShipyardTags.json";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY;
const YARD_CENTER = { lat: 34.87078258, lng: 128.70518285 };

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

const defaultFacilities = realFacilityTags
  .filter((t) => t.status === "confirmed")
  .map((t) => ({
    code: `TAG-${t.id}`,
    detailCode: t.id === 17 ? "T-BAR-SHOP" : null,
    name: t.name,
    type: classifyType(t.name),
    lat: t.lat,
    lng: t.lng,
    ring: t.geojson?.geometry?.coordinates?.[0]?.map(([lng, lat]) => ({ lat, lng })) || null,
  }));

const defaultWorkers = [];

function offsetCoordinate(origin, eastMeters, northMeters) {
  const latRadians = origin.lat * Math.PI / 180;
  return {
    lat: origin.lat + northMeters / 111320,
    lng: origin.lng + eastMeters / (111320 * Math.cos(latRadians)),
  };
}

function KakaoYardMap({ facilities = defaultFacilities, workers = defaultWorkers, cameraAlerts = [], cameraConnected = false, cameraStatusText, riskSimulation, overlayPanel, alertBanner, onOpenShop, onUnavailable, fillViewport = true }) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [center] = useState(YARD_CENTER);

  const containerRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const polygonsRef = useRef([]);
  const labelsRef = useRef([]);
  const workerOverlaysRef = useRef([]);
  const dangerPolygonsRef = useRef([]);
  const simulationOverlaysRef = useRef([]);

  const activeCameraAlerts = useMemo(
    () => cameraAlerts.filter((alert) => alert.active),
    [cameraAlerts],
  );
  const cameraAlertByFacility = useMemo(
    () => new Map(activeCameraAlerts.map((alert) => [alert.facilityCode, alert])),
    [activeCameraAlerts],
  );
  const activeAlertFacilityCode = activeCameraAlerts[0]?.facilityCode;

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
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => setSdkReady(true));
    script.onerror = () => setSdkError("카카오맵 SDK 로드에 실패했습니다.");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!sdkReady || !center || !mapDivRef.current || mapRef.current) return;
    const kakao = window.kakao;
    const map = new kakao.maps.Map(mapDivRef.current, {
      center: new kakao.maps.LatLng(center.lat, center.lng),
      level: 4,
    });
    map.setMapTypeId(kakao.maps.MapTypeId.SKYVIEW);
    map.setZoomable(false);
    mapRef.current = map;

    const relayout = () => {
      map.relayout();
      map.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
    };
    const resizeObserver = new ResizeObserver(() => relayout());
    resizeObserver.observe(mapDivRef.current);
    window.addEventListener("resize", relayout);
    const initialTimer = setTimeout(relayout, 100);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", relayout);
      clearTimeout(initialTimer);
    };
  }, [sdkReady, center]);

  useEffect(() => {
    if (!sdkReady || !center || !mapRef.current) return;
    const kakao = window.kakao;

    polygonsRef.current.forEach((p) => p.setMap(null));
    labelsRef.current.forEach((l) => l.setMap(null));
    polygonsRef.current = [];
    labelsRef.current = [];
    dangerPolygonsRef.current = [];

    facilities.forEach((f) => {
      const show = filter === "ALL" || f.type === filter;
      if (!show) return;

      const color = typeColors[f.type] || typeColors.ASSEMBLY;
      const isSelected = selected?.code === f.code;
      const cameraAlert = cameraAlertByFacility.get(f.code);
      const isCameraDanger = Boolean(cameraAlert);
      const strokeColor = isCameraDanger ? "#ff2448" : color;
      const fillColor = isCameraDanger ? "#ff2448" : color;

      if (f.ring && f.ring.length > 2) {
        const path = f.ring.map((pt) => new kakao.maps.LatLng(pt.lat, pt.lng));
        const polygon = new kakao.maps.Polygon({
          path,
          strokeWeight: isCameraDanger ? 5 : isSelected ? 3 : 1.6,
          strokeColor,
          strokeOpacity: 0.95,
          fillColor,
          fillOpacity: isCameraDanger ? 0.4 : isSelected ? 0.42 : 0.24,
        });
        kakao.maps.event.addListener(polygon, "click", () => { setSelected(f); });
        kakao.maps.event.addListener(polygon, "mouseover", () => polygon.setOptions({ fillOpacity: isCameraDanger ? 0.62 : 0.5 }));
        kakao.maps.event.addListener(polygon, "mouseout", () => polygon.setOptions({ fillOpacity: isCameraDanger ? 0.4 : isSelected ? 0.42 : 0.24 }));
        polygon.setMap(mapRef.current);
        polygonsRef.current.push(polygon);
        if (isCameraDanger) dangerPolygonsRef.current.push(polygon);
      }

      const el = document.createElement("div");
      el.style.cssText = `
        padding: 3px 8px; border-radius: 5px; background: rgba(0,0,0,.65);
        border: ${isCameraDanger ? "2px solid #ff2448" : `1px solid ${isSelected ? "#4de0f5" : "rgba(255,255,255,.25)"}`};
        box-shadow: ${isCameraDanger ? "0 0 18px rgba(255,36,72,.95)" : "none"};
        font: 700 10px Inter, sans-serif; color: #fff; white-space: nowrap;
        text-shadow: 0 1px 3px rgba(0,0,0,.8); cursor: pointer; pointer-events: auto;
        display: flex; align-items: center; gap: 4px;
      `;
      el.textContent = isCameraDanger ? `⚠ ${f.name}` : f.name;
      el.addEventListener("click", () => setSelected(f));

      const label = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(f.lat, f.lng),
        content: el,
        yAnchor: 0.5,
      });
      label.setMap(mapRef.current);
      labelsRef.current.push(label);
    });
  }, [sdkReady, center, facilities, selected, filter, cameraAlertByFacility]);

  useEffect(() => {
    if (!dangerPolygonsRef.current.length) return undefined;
    let emphasized = true;
    const timer = window.setInterval(() => {
      emphasized = !emphasized;
      dangerPolygonsRef.current.forEach((polygon) => polygon.setOptions({
        strokeWeight: emphasized ? 6 : 3,
        strokeOpacity: emphasized ? 1 : 0.5,
        fillOpacity: emphasized ? 0.46 : 0.24,
      }));
    }, 650);
    return () => window.clearInterval(timer);
  }, [cameraAlertByFacility, filter, sdkReady, center]);

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

  useEffect(() => {
    simulationOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    simulationOverlaysRef.current = [];
    if (!sdkReady || !center || !mapRef.current || !riskSimulation?.active) return;

    const kakao = window.kakao;
    const { center: origin, radiusMeters, windDegrees = 45, routes = [], safePoint, color = "#ff3b30" } = riskSimulation;
    const bearing = windDegrees * Math.PI / 180;
    const shiftedCenter = offsetCoordinate(origin, radiusMeters * 0.24 * Math.sin(bearing), radiusMeters * 0.24 * Math.cos(bearing));

    [1, 0.68, 0.38].forEach((scale, index) => {
      const major = radiusMeters * scale;
      const minor = radiusMeters * (0.48 + index * 0.05) * scale;
      const path = Array.from({ length: 48 }, (_, pointIndex) => {
        const angle = pointIndex / 48 * Math.PI * 2;
        const alongWind = major * Math.cos(angle);
        const acrossWind = minor * Math.sin(angle);
        const east = alongWind * Math.sin(bearing) + acrossWind * Math.cos(bearing);
        const north = alongWind * Math.cos(bearing) - acrossWind * Math.sin(bearing);
        const point = offsetCoordinate(shiftedCenter, east, north);
        return new kakao.maps.LatLng(point.lat, point.lng);
      });
      const polygon = new kakao.maps.Polygon({
        path,
        strokeWeight: index === 0 ? 3 : 1,
        strokeColor: color,
        strokeOpacity: 0.9 - index * 0.15,
        fillColor: color,
        fillOpacity: index === 0 ? 0.12 : 0.08 + index * 0.035,
      });
      polygon.setMap(mapRef.current);
      simulationOverlaysRef.current.push(polygon);
    });

    routes.forEach((route) => {
      const line = new kakao.maps.Polyline({
        path: route.map((point) => new kakao.maps.LatLng(point.lat, point.lng)),
        strokeWeight: 4,
        strokeColor: "#39e6ff",
        strokeOpacity: 0.95,
        strokeStyle: "shortdash",
      });
      line.setMap(mapRef.current);
      simulationOverlaysRef.current.push(line);
    });

    if (safePoint) {
      const safeLabel = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(safePoint.lat, safePoint.lng),
        yAnchor: 0.5,
        content: `<div style="padding:7px 10px;border-radius:10px;background:rgba(4,25,28,.92);border:1px solid #35e0ad;color:#7fffd4;font:800 11px Inter,sans-serif;box-shadow:0 0 18px rgba(53,224,173,.35);">✓ AI 안전 집결지</div>`,
      });
      safeLabel.setMap(mapRef.current);
      simulationOverlaysRef.current.push(safeLabel);
    }

    return () => {
      simulationOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      simulationOverlaysRef.current = [];
    };
  }, [center, riskSimulation, sdkReady]);

  useEffect(() => {
    if (!sdkReady || !center || !mapRef.current) return;
    const target = facilities.find((facility) => facility.code === activeAlertFacilityCode);
    if (target) {
      mapRef.current.setCenter(new window.kakao.maps.LatLng(target.lat, target.lng));
      mapRef.current.setLevel(3);
      return;
    }
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
    mapRef.current.setLevel(4);
  }, [activeAlertFacilityCode, center, facilities, sdkReady]);

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

  return <section className={`twin-preserve-dark bg-panel border-b border-edge overflow-hidden ${fillViewport ? "" : "h-full"}`}>
    <style>{`
      @keyframes toastIn { 0% { transform: translateY(24px) scale(.96); opacity: 0; } 60% { transform: translateY(-4px) scale(1.01); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
      .animate-toast-in { animation: toastIn .35s cubic-bezier(.34,1.56,.64,1); }
    `}</style>
    <div ref={containerRef} className="relative h-full" style={fillViewport ? { height: "calc(100dvh - 46px)" } : undefined}>
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
            <div className="text-[10px] font-bold text-slate-200 mb-1.5">지도 조작</div>
            <div className="flex gap-1.5">
              <button onClick={zoomOut} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><Minus size={11}/></button>
              <button onClick={zoomIn} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><Plus size={11}/></button>
              <button onClick={resetView} className="flex-1 h-7 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"><RotateCcw size={11}/></button>
            </div>
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
        <div className={`px-2.5 py-1.5 backdrop-blur-md rounded text-[11px] font-bold flex items-center gap-1.5 ${
          activeCameraAlerts.length
            ? "bg-danger/80 border border-danger text-white"
            : cameraConnected
              ? "bg-ink/60 border border-white/10 text-slate-200"
              : "bg-slate-900/75 border border-slate-600 text-slate-400"
        }`}>
          <i className={`fa-solid fa-camera text-[10px] ${activeCameraAlerts.length ? "text-white" : cameraConnected ? "text-cyan" : "text-slate-500"}`}/>
          {cameraStatusText || (activeCameraAlerts.length
            ? `${activeCameraAlerts[0].cameraId}: ${activeCameraAlerts[0].message}`
            : cameraConnected ? "CAM-01: 실시간 분석 중" : "CAM-01: 연결 끊김")}
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
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cameraAlertByFacility.has(selected.code) ? "#ff2448" : typeColors[selected.type] }}/>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{selected.name}</p>
          <p className="text-[10px] font-mono text-slate-400">{typeLabels[selected.type]} · {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</p>
          {cameraAlertByFacility.has(selected.code) && <p className="text-[11px] font-bold text-danger mt-1">
            {cameraAlertByFacility.get(selected.code).cameraId} · {cameraAlertByFacility.get(selected.code).message}
          </p>}
        </div>
        <button className="ml-auto text-xs font-semibold text-cyan border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10 shrink-0"
          onClick={() => onOpenShop?.(selected.code)}>
          설비 상세 보기
        </button>
        <button className="text-slate-400 hover:text-white text-lg leading-none shrink-0" onClick={() => setSelected(null)}>×</button>
      </div>}
    </div>
  </section>;
}

export default KakaoYardMap;
