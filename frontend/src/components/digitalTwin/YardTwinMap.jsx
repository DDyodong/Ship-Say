import React, { useMemo, useRef, useState } from "react";
import { GripVertical, Layers3, Minus, Plus, RotateCcw } from "lucide-react";

const categories = [
  ["ALL", "전체 야드"], ["FABRICATION", "가공"], ["ASSEMBLY", "조립"],
  ["PAINTING", "도장"], ["OUTFITTING", "의장"], ["DOCK", "도크"],
];

const riskColors = { low: "#35e0ad", medium: "#ff9d38", high: "#ff5169", critical: "#ff2448" };

// 한화오션 거제사업장 실제 설비 구성 기반 데모 데이터
// (육상 도크 2기 + 부유식 도크 3기 RD-3/4/5, 특수선·해양플랜트 건조 라인 등)
// 실제로는 백엔드 스냅샷 API에서 받아온 snapshot.facilities가 이 자리를 채웁니다.
//
// 배치 원칙: 왼쪽→오른쪽으로 실제 조선 공정 흐름을 따라감
//   강재 절단·가공 → 블록 조립(특수선·해양플랜트 포함) → 도장·의장 → 바다쪽 도크/안벽
// 각 열은 서로 다른 x범위를 쓰기 때문에 구조적으로 겹칠 수 없음.
const defaultFacilities = [
  // 1열: 가공 (강재 절단 → 곡블록 → T-BAR 용접)
  { code: "CUTTING-SHOP", name: "강재 절단공장", type: "FABRICATION", risk: "low", prog: 74, x: 40, y: 30, w: 190, h: 138 },
  { code: "CURVED-BLOCK", name: "곡블록 가공공장", type: "FABRICATION", risk: "low", prog: 64, x: 40, y: 182, w: 190, h: 138 },
  { code: "T-BAR-SHOP", name: "T-BAR 자동용접 SHOP", type: "FABRICATION", risk: "critical", prog: 63, x: 40, y: 334, w: 190, h: 138, danger: true, tag: "⚠ 위험구역 진입 예측됨" },

  // 2열: 조립 (일반 상선 + 특수선 + 해양플랜트)
  { code: "ASSEMBLY-01", name: "블록 조립 1공장", type: "ASSEMBLY", risk: "low", prog: 88, x: 260, y: 30, w: 190, h: 96 },
  { code: "ASSEMBLY-02", name: "블록 조립 2공장", type: "ASSEMBLY", risk: "low", prog: 49, x: 260, y: 140, w: 190, h: 96 },
  { code: "SPECIAL-SHOP", name: "특수선 건조공장", type: "ASSEMBLY", risk: "low", prog: 55, x: 260, y: 250, w: 190, h: 96 },
  { code: "OFFSHORE-SHOP", name: "해양플랜트 공장", type: "ASSEMBLY", risk: "medium", prog: 41, x: 260, y: 360, w: 190, h: 96 },

  // 3열: 도장 · 의장
  { code: "PAINT-01", name: "도장 1공장", type: "PAINTING", risk: "low", prog: 69, x: 480, y: 30, w: 190, h: 138 },
  { code: "PAINT-02", name: "도장 2공장", type: "PAINTING", risk: "medium", prog: 43, x: 480, y: 182, w: 190, h: 138 },
  { code: "OUTFIT-SHOP", name: "의장 공장", type: "OUTFITTING", risk: "low", prog: 76, x: 480, y: 334, w: 190, h: 138 },

  // 4열: 바다와 맞닿은 도크·안벽 (육상도크 2기 + 부유식도크 3기 + 안벽)
  { code: "DOCK-01", name: "제1도크", type: "DOCK", risk: "low", prog: 82, x: 700, y: 30, w: 170, h: 64 },
  { code: "DOCK-02", name: "제2도크", type: "DOCK", risk: "low", prog: 76, x: 700, y: 104, w: 170, h: 64 },
  { code: "FDOCK-03", name: "부유식도크 RD-3", type: "DOCK", risk: "low", prog: 91, x: 700, y: 178, w: 170, h: 64 },
  { code: "FDOCK-04", name: "부유식도크 RD-4", type: "DOCK", risk: "medium", prog: 58, x: 700, y: 252, w: 170, h: 64 },
  { code: "FDOCK-05", name: "부유식도크 RD-5", type: "DOCK", risk: "low", prog: 69, x: 700, y: 326, w: 170, h: 64 },
  { code: "QUAY-01", name: "안벽 1구역", type: "QUAY", risk: "low", prog: 94, x: 700, y: 400, w: 170, h: 64 },
];

// 위험구역 진입 예측 시나리오(MVP 대표 기능) 표현용 작업자 마커 — T-BAR 자동용접 SHOP 주변
const defaultWorkers = [
  { id: "088", x: 300, y: 430, predictedX: 200, predictedY: 430, danger: false, label: "ID:088" },
  { id: "000", x: 110, y: 440, danger: true, label: "ID:000 ⚠" },
];

function YardTwinMap({ facilities = defaultFacilities, workers = defaultWorkers, overlayPanel, onOpenShop, onUnavailable }) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [panelPos, setPanelPos] = useState({ left: 20, top: 20 });
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  const startDrag = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origLeft: panelPos.left, origTop: panelPos.top };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
  };
  const onDrag = (e) => {
    if (!dragRef.current || !canvasRef.current) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const maxLeft = Math.max(0, bounds.width - 320);
    const maxTop = Math.max(0, bounds.height - 40);
    setPanelPos({
      left: Math.min(maxLeft, Math.max(0, dragRef.current.origLeft + dx)),
      top: Math.min(maxTop, Math.max(0, dragRef.current.origTop + dy)),
    });
  };
  const stopDrag = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);
  };

  const visibleFacilities = useMemo(() => facilities.filter((f) => filter === "ALL"
    || f.type === filter
    || (filter === "DOCK" && f.type === "QUAY")), [facilities, filter]);

  const counts = useMemo(() => ({
    low: facilities.filter((f) => f.risk === "low").length,
    medium: facilities.filter((f) => f.risk === "medium").length,
    danger: facilities.filter((f) => ["high", "critical"].includes(f.risk)).length,
  }), [facilities]);

  const selectFacility = (facility) => {
    setSelected(facility);
    if (facility.code === "T-BAR-SHOP") onOpenShop?.(facility.code);
  };

  return <section className="bg-panel border-b border-edge overflow-hidden flex flex-col">
    {/* 필터바 */}
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge shrink-0 flex-wrap gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        <Layers3 size={16} className="text-cyan mr-1"/>
        {categories.map(([value, label]) => <button key={value}
          onClick={() => setFilter(value)}
          className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${filter === value
            ? "bg-cyan/10 text-cyan border border-cyan/30" : "text-slate-400 hover:text-white"}`}>
          {label}
        </button>)}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
        <span className="hidden sm:inline">줌:</span>
        <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))}
          className="w-7 h-7 rounded bg-edge hover:bg-edgeLight border border-edge text-slate-300 flex items-center justify-center"><Minus size={12}/></button>
        <span className="w-9 text-center text-cyan font-bold">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(2)))}
          className="w-7 h-7 rounded bg-edge hover:bg-edgeLight border border-edge text-slate-300 flex items-center justify-center"><Plus size={12}/></button>
        <button onClick={() => setZoom(1)}
          className="w-7 h-7 rounded bg-edge hover:bg-edgeLight border border-edge text-slate-300 flex items-center justify-center"><RotateCcw size={12}/></button>
      </div>
    </div>

    {/* SVG 캔버스 */}
    <div ref={canvasRef} className="relative flex-1 overflow-hidden" style={{ background: "#06141d", minHeight: 520 }}>
      <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform .25s ease" }}
        className="absolute inset-0 w-full h-full">

        <rect width="1000" height="560" fill="#06141d"/>

        {/* 공정 흐름 열 구분선 (가공 | 조립 | 도장·의장 | 도크) */}
        {[245, 465, 685].map((x) => <line key={x} x1={x} y1="15" x2={x} y2="545" stroke="#1c333c" strokeWidth="1.5" strokeDasharray="2 6"/>)}

        {/* 바다 */}
        <rect x="885" y="12" width="115" height="536" fill="#082334"/>
        <rect x="885" y="12" width="115" height="536" fill="url(#waterGradient)"/>
        {[70, 170, 270, 370, 470].map((y) => <path key={y} d={`M885 ${y} q15 8 30 0 t30 0 t30 0 t30 0`} stroke="#1c5a78" strokeWidth="1.2" fill="none" opacity=".5"/>)}
        <text x="942" y="545" textAnchor="middle" fill="#2c6f8f" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono" letterSpacing="2">SEA</text>

        {/* 정박 중인 선박 실루엣 (장식) */}
        <g opacity=".85">
          <rect x="895" y="46" width="95" height="26" rx="4" fill="#25414f" stroke="#3a6f88" strokeWidth="1"/>
          <rect x="960" y="40" width="18" height="14" rx="2" fill="#3a6f88"/>
        </g>
        <g opacity=".85">
          <rect x="895" y="218" width="95" height="26" rx="4" fill="#25414f" stroke="#3a6f88" strokeWidth="1"/>
          <rect x="960" y="212" width="18" height="14" rx="2" fill="#3a6f88"/>
        </g>

        <defs>
          <linearGradient id="waterGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0a3a52" stopOpacity=".6"/>
            <stop offset="100%" stopColor="#05202e" stopOpacity=".9"/>
          </linearGradient>
        </defs>

        {visibleFacilities.map((f) => {
          const color = riskColors[f.risk] || riskColors.low;
          const isDock = f.type === "DOCK" || f.type === "QUAY";
          const pulse = ["medium", "high", "critical"].includes(f.risk);
          const progW = Math.max(0, (f.w - 8) * (f.prog / 100));

          return <g key={f.code} style={{ cursor: "pointer" }} onClick={() => selectFacility(f)}>
            {f.danger && <rect x={f.x - 5} y={f.y - 2} width={f.w + 10} height={f.h + 10} rx="16"
              fill="rgba(255,36,72,0.07)">
              <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite"/>
            </rect>}
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={isDock ? 5 : 12}
              fill={f.danger || selected?.code === f.code ? "#17657c" : (isDock ? "#112638" : "#1b3641")}
              stroke={color} strokeWidth={f.danger ? 2.5 : (selected?.code === f.code ? 3 : 1.4)}
              strokeDasharray={f.danger ? "6 3" : undefined}/>
            <rect x={f.x + 4} y={f.y + f.h - 10} width={progW} height="5" rx="2.5" fill={color}/>
            <circle cx={f.x + f.w - 16} cy={f.y + 16} r={f.danger ? 8 : 7} fill={color}>
              {pulse && <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite"/>}
            </circle>
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 - (f.danger ? 10 : 6)} textAnchor="middle" fill="#ffffff"
              fontSize="16" fontWeight="700">{f.name}</text>
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 + (f.danger ? 12 : 16)} textAnchor="middle" fill="#bfe6ef"
              fontSize="13" fontWeight="500">{f.code} · {f.prog}%</text>
            {f.danger && f.tag && <>
              <rect x={f.x + f.w / 2 - 66} y={f.y + f.h - 28} width="132" height="18" rx="4" fill="rgba(255,36,72,0.2)"/>
              <text x={f.x + f.w / 2} y={f.y + f.h - 15} textAnchor="middle" fill="#ff2448" fontSize="11"
                fontWeight="800" fontFamily="JetBrains Mono">{f.tag}</text>
            </>}
          </g>;
        })}

        {/* 작업자 마커 — 위험구역 진입 예측 시나리오 표현 */}
        {workers.map((w) => <g key={w.id}>
          {w.predictedX && <line x1={w.x} y1={w.y} x2={w.predictedX} y2={w.predictedY}
            stroke="#00d2ff" strokeWidth="1" strokeDasharray="4 3" opacity="0.5"/>}
          <circle cx={w.x} cy={w.y} r={w.danger ? 6 : 5} fill={w.danger ? "#ff2448" : "#00d2ff"}>
            {!w.danger && <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite"/>}
          </circle>
          <text x={w.x + 12} y={w.y - 4} fill={w.danger ? "#ff2448" : "#00d2ff"} fontSize="12"
            fontWeight="800">{w.label}</text>
        </g>)}

        <text x="20" y="498" fill="#9fd4e0" fontSize="13" fontWeight="700" fontFamily="JetBrains Mono" opacity=".8">SMART YARD DIGITAL TWIN</text>
        <text x="20" y="514" fill="#7fb4c4" fontSize="11" fontFamily="JetBrains Mono">2D GEO-REFERENCED OPERATIONS VIEW</text>

        <circle cx="948" cy="500" r="18" fill="#0a1e28" stroke="#1c333c" strokeWidth="1.5"/>
        <text x="948" y="495" textAnchor="middle" fill="#00d2ff" fontSize="13" fontWeight="800">N</text>
        <line x1="948" y1="486" x2="948" y2="499" stroke="#00d2ff" strokeWidth="2"/>
        <line x1="948" y1="499" x2="948" y2="513" stroke="#5a8a9a" strokeWidth="2"/>

        <rect x="20" y="524" width="64" height="20" rx="4" fill="rgba(53,224,173,0.12)"/>
        <circle cx="33" cy="534" r="4.5" fill="#35e0ad"/>
        <text x="42" y="538" fill="#35e0ad" fontSize="12" fontWeight="700">정상 {counts.low}</text>
        <rect x="92" y="524" width="64" height="20" rx="4" fill="rgba(255,157,56,0.12)"/>
        <circle cx="105" cy="534" r="4.5" fill="#ff9d38"/>
        <text x="114" y="538" fill="#ff9d38" fontSize="12" fontWeight="700">주의 {counts.medium}</text>
        <rect x="164" y="524" width="64" height="20" rx="4" fill="rgba(255,36,72,0.12)"/>
        <circle cx="177" cy="534" r="4.5" fill="#ff2448"/>
        <text x="186" y="538" fill="#ff2448" fontSize="12" fontWeight="700">위험 {counts.danger}</text>
        <text x="240" y="538" fill="#7fb4c4" fontSize="11">시설 {facilities.length}개 · 도크/안벽/생산 SHOP 통합</text>
      </svg>

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <div className="px-2.5 py-1.5 bg-ink/85 border border-edge rounded text-[11px] font-bold text-slate-300 flex items-center gap-1.5 backdrop-blur-sm">
          <i className="fa-solid fa-camera text-cyan text-[10px]"/> CAM-01: 실시간 분석 중
        </div>
        <div className="px-2.5 py-1.5 bg-ink/85 border border-edge rounded text-[11px] font-bold text-slate-300 flex items-center gap-1.5 backdrop-blur-sm">
          <i className="fa-solid fa-wifi text-emerald text-[10px]"/> 센서 노드 {facilities.length}개 정상
        </div>
        {counts.danger > 0 && <div className="px-2.5 py-1.5 bg-ink/85 border border-danger/40 rounded text-[11px] font-bold text-danger flex items-center gap-1.5 backdrop-blur-sm blink">
          <i className="fa-solid fa-triangle-exclamation text-[10px]"/> 위험 시나리오 감지
        </div>}
      </div>

      {/* 드래그 가능한 구역 상세 오버레이 패널 */}
      {overlayPanel && <div style={{ position: "absolute", left: panelPos.left, top: panelPos.top, width: 320, zIndex: 30 }}
        className="rounded-2xl border border-cyan/20 bg-ink/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div onMouseDown={startDrag}
          className="px-3 py-1.5 flex items-center gap-2 cursor-grab active:cursor-grabbing border-b border-cyan/10 bg-cyan/5 select-none">
          <GripVertical size={12} className="text-cyan/40"/>
          <span className="text-[9px] font-mono text-cyan/50 uppercase tracking-widest">드래그해서 이동</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">{overlayPanel}</div>
      </div>}
    </div>

    {/* 선택된 구역 하단 상세 스트립 */}
    {selected && selected.code !== "T-BAR-SHOP" && <div className="border-t border-edge bg-ink/80 px-5 py-3 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: riskColors[selected.risk] }}/>
        <div>
          <p className="text-sm font-bold text-slate-100">{selected.name}</p>
          <p className="text-[10px] font-mono text-slate-400">{selected.code} · 위험도: {selected.risk.toUpperCase()}</p>
        </div>
      </div>
      <div className="flex-1 max-w-xs">
        <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>공정 진행률</span><span>{selected.prog}%</span></div>
        <div className="h-1.5 rounded-full bg-edge overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${selected.prog}%`, background: riskColors[selected.risk] }}/>
        </div>
      </div>
      <button className="text-xs font-semibold text-cyan border border-cyan/30 px-3 py-1.5 rounded-lg hover:bg-cyan/10 shrink-0"
        onClick={() => onUnavailable?.(selected.name)}>상세 설비 연동 예정</button>
      <button className="text-slate-400 hover:text-white text-lg leading-none shrink-0" onClick={() => setSelected(null)}>×</button>
    </div>}
  </section>;
}

export default YardTwinMap;