import React, { useMemo, useState } from "react";
import { Layers3, Minus, Plus, RotateCcw } from "lucide-react";

const categories = [
  ["ALL", "전체 야드"], ["FABRICATION", "가공"], ["ASSEMBLY", "조립"],
  ["PAINTING", "도장"], ["OUTFITTING", "의장"], ["DOCK", "도크"],
];

const riskColors = { low: "#35e0ad", medium: "#ff9d38", high: "#ff5169", critical: "#ff2448" };

// 시안의 14개 구역을 데이터로 정리 (실제로는 백엔드 스냅샷 API에서 받아올 값)
const defaultFacilities = [
  { code: "DK-01", name: "1번 도크", type: "DOCK", risk: "low", prog: 82, x: 42, y: 30, w: 90, h: 66 },
  { code: "DK-02", name: "2번 도크", type: "DOCK", risk: "medium", prog: 57, x: 42, y: 116, w: 90, h: 66 },
  { code: "QY-01", name: "안벽 1구역", type: "QUAY", risk: "low", prog: 94, x: 42, y: 202, w: 90, h: 66 },
  { code: "FAB-01", name: "강재 가공동 A", type: "FABRICATION", risk: "low", prog: 71, x: 170, y: 30, w: 110, h: 76 },
  { code: "FAB-02", name: "강재 가공동 B", type: "FABRICATION", risk: "medium", prog: 48, x: 300, y: 30, w: 110, h: 76 },
  { code: "T-BAR-SHOP", name: "T-BAR 자동용접 SHOP", type: "FABRICATION", risk: "critical", prog: 63, x: 424, y: 30, w: 160, h: 94, danger: true, tag: "⚠ 위험구역 진입 예측됨" },
  { code: "ASM-01", name: "선체 조립동 1", type: "ASSEMBLY", risk: "low", prog: 88, x: 170, y: 134, w: 130, h: 76 },
  { code: "ASM-02", name: "선체 조립동 2", type: "ASSEMBLY", risk: "high", prog: 35, x: 320, y: 134, w: 130, h: 76 },
  { code: "PNT-01", name: "도장 공장", type: "PAINTING", risk: "medium", prog: 60, x: 170, y: 240, w: 130, h: 76 },
  { code: "OUT-01", name: "의장 작업장 A", type: "OUTFITTING", risk: "low", prog: 76, x: 470, y: 150, w: 130, h: 76 },
  { code: "OUT-02", name: "의장 작업장 B", type: "OUTFITTING", risk: "low", prog: 91, x: 620, y: 150, w: 130, h: 76 },
  { code: "FAB-03", name: "절단 가공동", type: "FABRICATION", risk: "low", prog: 67, x: 470, y: 248, w: 130, h: 76 },
  { code: "ASM-03", name: "대형 조립 플랫폼", type: "ASSEMBLY", risk: "low", prog: 52, x: 170, y: 346, w: 280, h: 88 },
  { code: "OUT-03", name: "의장 3공장", type: "OUTFITTING", risk: "medium", prog: 44, x: 470, y: 346, w: 280, h: 88 },
];

// 위험구역 진입 예측 시나리오(MVP 대표 기능) 표현용 작업자 마커
const defaultWorkers = [
  { id: "088", x: 400, y: 95, predictedX: 500, predictedY: 60, danger: false, label: "ID:088" },
  { id: "000", x: 504, y: 75, danger: true, label: "ID:000 ⚠" },
];

function YardTwinMap({ facilities = defaultFacilities, workers = defaultWorkers, onOpenShop, onUnavailable }) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);

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

  return <section className="rounded-xl bg-panel border border-edge overflow-hidden flex flex-col">
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
    <div className="relative flex-1 overflow-hidden" style={{ background: "#06141d", minHeight: 420 }}>
      <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform .25s ease" }}
        className="absolute inset-0 w-full h-full">

        <rect width="1000" height="560" fill="#06141d"/>
        {[112, 224, 336, 448].map((y) => <line key={y} x1="28" y1={y} x2="972" y2={y} stroke="#1c333c" strokeWidth="1.5"/>)}
        {[150, 400, 650, 900].map((x) => <line key={x} x1={x} y1="17" x2={x} y2="543" stroke="#1c333c" strokeWidth="1.5"/>)}
        <rect x="930" y="17" width="46" height="526" rx="3" fill="#0c2530" stroke="#1c4a60" strokeWidth="1"/>

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
            <rect x={f.x + 4} y={f.y + f.h - 8} width={progW} height="4" rx="2" fill={color}/>
            <circle cx={f.x + f.w - 14} cy={f.y + 14} r={f.danger ? 7 : 6} fill={color}>
              {pulse && <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite"/>}
            </circle>
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 - (f.danger ? 8 : 4)} textAnchor="middle" fill="#eaf6f8"
              fontSize="11" fontWeight="600">{f.name}</text>
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 + (f.danger ? 8 : 12)} textAnchor="middle" fill="#9fd4e0"
              fontSize="9">{f.code} · {f.prog}%</text>
            {f.danger && f.tag && <>
              <rect x={f.x + f.w / 2 - 56} y={f.y + f.h - 26} width="112" height="16" rx="4" fill="rgba(255,36,72,0.2)"/>
              <text x={f.x + f.w / 2} y={f.y + f.h - 14} textAnchor="middle" fill="#ff2448" fontSize="9"
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
          <text x={w.x + 12} y={w.y - 4} fill={w.danger ? "#ff2448" : "#00d2ff"} fontSize="9"
            fontWeight="800">{w.label}</text>
        </g>)}

        <text x="20" y="498" fill="#9fd4e0" fontSize="11" fontWeight="700" fontFamily="JetBrains Mono" opacity=".8">SMART YARD DIGITAL TWIN</text>
        <text x="20" y="513" fill="#5a8a9a" fontSize="9" fontFamily="JetBrains Mono">2D GEO-REFERENCED OPERATIONS VIEW</text>

        <circle cx="948" cy="500" r="18" fill="#0a1e28" stroke="#1c333c" strokeWidth="1.5"/>
        <text x="948" y="495" textAnchor="middle" fill="#00d2ff" fontSize="11" fontWeight="800">N</text>
        <line x1="948" y1="486" x2="948" y2="499" stroke="#00d2ff" strokeWidth="2"/>
        <line x1="948" y1="499" x2="948" y2="513" stroke="#5a8a9a" strokeWidth="2"/>

        <rect x="20" y="525" width="56" height="18" rx="4" fill="rgba(53,224,173,0.12)"/>
        <circle cx="32" cy="534" r="4" fill="#35e0ad"/>
        <text x="40" y="538" fill="#35e0ad" fontSize="9" fontWeight="700">정상 {counts.low}</text>
        <rect x="84" y="525" width="56" height="18" rx="4" fill="rgba(255,157,56,0.12)"/>
        <circle cx="96" cy="534" r="4" fill="#ff9d38"/>
        <text x="104" y="538" fill="#ff9d38" fontSize="9" fontWeight="700">주의 {counts.medium}</text>
        <rect x="148" y="525" width="56" height="18" rx="4" fill="rgba(255,36,72,0.12)"/>
        <circle cx="160" cy="534" r="4" fill="#ff2448"/>
        <text x="168" y="538" fill="#ff2448" fontSize="9" fontWeight="700">위험 {counts.danger}</text>
        <text x="220" y="538" fill="#5a8a9a" fontSize="8">시설 {facilities.length}개 · 도크/안벽/생산 SHOP 통합</text>
      </svg>

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <div className="px-2 py-1 bg-ink/85 border border-edge rounded text-[9px] font-bold text-slate-400 flex items-center gap-1.5 backdrop-blur-sm">
          <i className="fa-solid fa-camera text-cyan text-[8px]"/> CAM-01: 실시간 분석 중
        </div>
        <div className="px-2 py-1 bg-ink/85 border border-edge rounded text-[9px] font-bold text-slate-400 flex items-center gap-1.5 backdrop-blur-sm">
          <i className="fa-solid fa-wifi text-emerald text-[8px]"/> 센서 노드 {facilities.length}개 정상
        </div>
        {counts.danger > 0 && <div className="px-2 py-1 bg-ink/85 border border-danger/40 rounded text-[9px] font-bold text-danger flex items-center gap-1.5 backdrop-blur-sm blink">
          <i className="fa-solid fa-triangle-exclamation text-[8px]"/> 위험 시나리오 감지
        </div>}
      </div>
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