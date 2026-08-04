import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Factory,
  MapPin,
  Search,
  X,
} from "lucide-react";

const MAP_IMAGE = "/images/yard-overview.webp";

const categories = [
  ["ALL", "전체 시설"],
  ["FABRICATION", "가공"],
  ["ASSEMBLY", "조립"],
  ["PAINTING", "도장"],
  ["OUTFITTING", "의장"],
  ["DOCK", "도크·안벽"],
];

const riskColors = {
  low: "#20c997",
  medium: "#f6b73c",
  high: "#ff7a1a",
  critical: "#f04452",
};

const riskLabels = {
  low: "정상",
  medium: "주의",
  high: "위험",
  critical: "심각",
};

const typeLabels = {
  FABRICATION: "가공",
  ASSEMBLY: "조립",
  PAINTING: "도장",
  OUTFITTING: "의장",
  DOCK: "도크",
  QUAY: "안벽",
  WELDING_SHOP: "용접",
  MACHINERY: "기계",
  STORAGE: "적치",
};

const defaultFacilities = [
  {
    code: "T-BAR-SHOP",
    name: "T-BAR 자동용접 SHOP",
    type: "FABRICATION",
    risk: "critical",
    progress: 63,
    x: 42,
    y: 68,
    description: "T-Bar 부재 조립과 자동 용접 공정이 진행되는 생산 시설입니다.",
    features: ["자동 용접 로봇 운영", "작업자 PPE 실시간 감지", "위험구역 접근 예측"],
    image: "/images/facilities/tbar-shop.webp",
  },
  {
    code: "ASSEMBLY-01",
    name: "블록 조립 1공장",
    type: "ASSEMBLY",
    risk: "low",
    progress: 88,
    x: 31,
    y: 53,
    description: "선박 블록을 조립하고 탑재 전 검사를 수행하는 생산 시설입니다.",
    features: ["대형 블록 조립", "크레인 협업 작업", "작업허가서 연동"],
    image: "/images/facilities/assembly-01.webp",
  },
  {
    code: "DOCK-01",
    name: "1도크",
    type: "DOCK",
    risk: "medium",
    progress: 82,
    x: 55,
    y: 59,
    description: "선박 건조와 진수를 수행하는 주요 도크입니다.",
    features: ["블록 탑재", "중장비 이동", "도크 안전관제"],
    image: "/images/facilities/dock-01.webp",
  },
];

const defaultWorkers = [];

function getProgress(facility) {
  return Math.max(
    0,
    Math.min(100, Number(facility.progress ?? facility.prog ?? facility.progressPercent ?? 0)),
  );
}

// TwinContent가 기존 1000x560 좌표를 보내도 처리하고,
// 새 퍼센트 좌표(0~100)를 보내도 그대로 사용할 수 있다.
function toPercent(value, axis) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  if (number >= 0 && number <= 100) return number;
  const base = axis === "x" ? 1000 : 560;
  return Math.max(0, Math.min(100, (number / base) * 100));
}

function isVisibleByFilter(facility, filter) {
  if (filter === "ALL") return true;
  if (filter === "DOCK") return facility.type === "DOCK" || facility.type === "QUAY";
  return facility.type === filter;
}

function normalizeFacility(facility, index) {
  const risk = facility.risk ?? facility.riskLevel ?? "low";
  return {
    ...facility,
    number: facility.number ?? index + 1,
    risk,
    progress: getProgress(facility),
    xPercent: toPercent(facility.x ?? facility.mapX, "x"),
    yPercent: toPercent(facility.y ?? facility.mapY, "y"),
    description: facility.description || "등록된 시설 설명이 없습니다.",
    features: Array.isArray(facility.features) ? facility.features : [],
  };
}

function YardFacilityMap({
  facilities = defaultFacilities,
  workers = defaultWorkers,
  overlayPanel,
  alertBanner,
  onOpenShop,
  onUnavailable,
}) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState(null);

  const normalizedFacilities = useMemo(
    () => facilities.map(normalizeFacility),
    [facilities],
  );

  const visibleFacilities = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return normalizedFacilities.filter((facility) => {
      const matchesFilter = isVisibleByFilter(facility, filter);
      const matchesSearch = !keyword
        || `${facility.name} ${facility.code} ${typeLabels[facility.type] || facility.type}`
          .toLowerCase()
          .includes(keyword);
      return matchesFilter && matchesSearch;
    });
  }, [filter, normalizedFacilities, search]);

  const selected = normalizedFacilities.find(
    (facility) => facility.code === selectedCode,
  ) || null;

  const counts = useMemo(() => ({
    low: normalizedFacilities.filter((facility) => facility.risk === "low").length,
    medium: normalizedFacilities.filter((facility) => facility.risk === "medium").length,
    danger: normalizedFacilities.filter((facility) => ["high", "critical"].includes(facility.risk)).length,
  }), [normalizedFacilities]);

  const selectFacility = (facility) => {
    setSelectedCode(facility.code);
  };

  const openSelected = () => {
    if (!selected) return;
    if (onOpenShop) onOpenShop(selected.code);
    else onUnavailable?.(selected.name);
  };

  return (
    <section className="facility-map-card">
      <style>{FACILITY_MAP_CSS}</style>

      <div className="facility-map-shell">
        <img
          className="facility-map-background"
          src={MAP_IMAGE}
          alt="스마트 조선소 전체 조감도"
        />
        <div className="facility-map-shade" />

        <aside className="facility-list-panel" aria-label="시설 목록">
          <div className="facility-list-heading">
            <Factory size={20} />
            <div>
              <b>조선소 시설 안내</b>
              <small>YARD FACILITIES</small>
            </div>
          </div>

          <label className="facility-search">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="시설명 또는 코드 검색"
            />
          </label>

          <div className="facility-category-list">
            {categories.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="facility-scroll-list">
            {visibleFacilities.length ? visibleFacilities.map((facility) => (
              <button
                key={facility.code}
                type="button"
                className={selected?.code === facility.code ? "active" : ""}
                onClick={() => selectFacility(facility)}
              >
                <span className="facility-list-number">{facility.number}</span>
                <div>
                  <b>{facility.name}</b>
                  <small>{typeLabels[facility.type] || facility.type}</small>
                </div>
                <i
                  className="facility-list-risk"
                  style={{ background: riskColors[facility.risk] || riskColors.low }}
                />
              </button>
            )) : (
              <p className="facility-list-empty">조건에 맞는 시설이 없습니다.</p>
            )}
          </div>

          <div className="facility-risk-summary">
            <RiskCount label="정상" value={counts.low} color={riskColors.low} />
            <RiskCount label="주의" value={counts.medium} color={riskColors.medium} />
            <RiskCount label="위험" value={counts.danger} color={riskColors.critical} />
          </div>
        </aside>

        <div className="facility-map-title">
          <MapPin size={16} />
          <div>
            <b>스마트 조선소 디지털 트윈</b>
            <small>시설을 선택하면 운영 상태를 확인할 수 있습니다.</small>
          </div>
        </div>

        <div className="facility-map-live">
          <i />
          LIVE CONNECTED
          {counts.danger > 0 && (
            <span><AlertTriangle size={12} /> 위험 시설 {counts.danger}개</span>
          )}
        </div>

        <div className="facility-marker-layer" aria-label="조감도 시설 위치">
          {workers.filter((worker) => Array.isArray(worker.route) && worker.route.length > 1).map((worker) => (
            <svg key={`${worker.id}-route`} className="facility-patrol-route" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={worker.route.map((point) => `${point.x},${point.y}`).join(" ")}/>
            </svg>
          ))}
          {visibleFacilities.map((facility) => {
            const isSelected = selected?.code === facility.code;
            const isDanger = ["high", "critical"].includes(facility.risk);
            return (
              <button
                key={facility.code}
                type="button"
                className={`facility-marker${isSelected ? " selected" : ""}${isDanger ? " danger" : ""}`}
                style={{
                  left: `${facility.xPercent}%`,
                  top: `${facility.yPercent}%`,
                  "--facility-color": riskColors[facility.risk] || riskColors.low,
                }}
                onClick={() => selectFacility(facility)}
                aria-label={`${facility.number}. ${facility.name}`}
              >
                {isSelected && <span className="facility-selected-area" />}
                <span className="facility-marker-label">{facility.name}</span>
                <b>{facility.number}</b>
              </button>
            );
          })}

          {workers.map((worker) => <WorkerAvatar key={worker.id} worker={worker}/>)}
        </div>

        {overlayPanel && <div className="facility-external-panel">{overlayPanel}</div>}

        {selected && (
          <article className="facility-detail-panel">
            <button
              type="button"
              className="facility-detail-close"
              onClick={() => setSelectedCode(null)}
              aria-label="시설 상세 닫기"
            >
              <X size={18} />
            </button>

            {selected.image && (
              <img
                className="facility-detail-image"
                src={selected.image}
                alt={`${selected.name} 시설`}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}

            <div className="facility-detail-content">
              <span className="facility-detail-eyebrow">
                <b>{selected.number}</b>
                SELECTED FACILITY · {selected.code}
              </span>

              <div className="facility-detail-title">
                <div>
                  <h3>{selected.name}</h3>
                  <p>{typeLabels[selected.type] || selected.type}</p>
                </div>
                <strong style={{ color: riskColors[selected.risk] || riskColors.low }}>
                  {riskLabels[selected.risk] || "정상"}
                </strong>
              </div>

              <p className="facility-description">{selected.description}</p>

              {selected.features.length > 0 && (
                <ul className="facility-features">
                  {selected.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              )}

              <div className="facility-progress-row">
                <span>공정 진행률</span>
                <b>{Math.round(selected.progress)}%</b>
              </div>
              <div className="facility-progress-track">
                <i
                  style={{
                    width: `${selected.progress}%`,
                    background: riskColors[selected.risk] || riskColors.low,
                  }}
                />
              </div>

              <button type="button" className="facility-detail-button" onClick={openSelected}>
                <Activity size={15} />
                상세 관제 보기
                <ChevronRight size={16} />
              </button>
            </div>
          </article>
        )}

        <div className="facility-map-footer">
          <span><i /> 데이터 연결 정상</span>
          <b>시설 {normalizedFacilities.length}개</b>
          <small>목록 또는 번호 마커를 눌러 시설 정보를 확인하세요.</small>
        </div>

        {alertBanner && (
          <>
            <div className="facility-alert-frame" />
            <div className="facility-alert-banner">{alertBanner}</div>
          </>
        )}
      </div>
    </section>
  );
}

function RiskCount({ label, value, color }) {
  return (
    <div>
      <span><i style={{ background: color }} />{label}</span>
      <b style={{ color }}>{value}</b>
    </div>
  );
}

function WorkerAvatar({ worker }) {
  const previous = useRef({ x: worker.x, y: worker.y });
  const [direction, setDirection] = useState("left");
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    const dx = Number(worker.x) - Number(previous.current.x);
    const dy = Number(worker.y) - Number(previous.current.y);
    const moving = Math.hypot(dx, dy) > 0.05;
    if (Math.abs(dx) > 0.04) setDirection(dx > 0 ? "right" : "left");
    setWalking(moving);
    previous.current = { x: worker.x, y: worker.y };
    const timer = window.setTimeout(() => setWalking(false), 360);
    return () => window.clearTimeout(timer);
  }, [worker.x, worker.y]);

  return <div
    className={`facility-worker person ${direction}${walking ? " walking" : ""}${worker.danger ? " danger" : ""}`}
    style={{
      left: `${toPercent(worker.x, "x")}%`,
      top: `${toPercent(worker.y, "y")}%`,
    }}
  >
    <span className="facility-person-avatar" aria-hidden="true">
      <i className="person-hardhat"/>
      <i className="person-head"/>
      <i className="person-body"/>
      <i className="person-arm arm-left"/>
      <i className="person-arm arm-right"/>
      <i className="person-leg leg-left"/>
      <i className="person-leg leg-right"/>
    </span>
    <b className="facility-person-label">{worker.label || `ID:${worker.id}`}</b>
  </div>;
}

const FACILITY_MAP_CSS = `
  .facility-map-card{overflow:hidden;border:1px solid rgba(225,112,30,.32);border-radius:18px;background:#e9eef1;box-shadow:0 22px 54px rgba(42,58,66,.16)}
  .facility-map-shell{position:relative;height:clamp(680px,76vh,900px);overflow:hidden;background:linear-gradient(145deg,#123348,#06131c)}
  .facility-map-background{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;object-position:center;user-select:none}
  .facility-map-shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(3,13,20,.46),transparent 33%,transparent 68%,rgba(3,13,20,.28)),linear-gradient(180deg,rgba(2,12,18,.12),transparent 45%,rgba(2,12,18,.3))}
  .facility-list-panel{position:absolute;z-index:30;left:24px;top:24px;bottom:58px;width:300px;display:flex;flex-direction:column;overflow:hidden;border-radius:20px;background:rgba(249,251,252,.95);box-shadow:0 24px 70px rgba(0,0,0,.34);backdrop-filter:blur(18px);color:#17222b}
  .facility-list-heading{display:flex;align-items:center;gap:11px;padding:20px 20px 15px;color:#ff6b00}.facility-list-heading b,.facility-list-heading small{display:block}.facility-list-heading b{color:#18242d;font-size:16px}.facility-list-heading small{margin-top:3px;color:#8a969e;font:800 9px monospace;letter-spacing:.12em}
  .facility-search{display:flex;align-items:center;gap:8px;margin:0 16px;padding:0 11px;height:38px;border:1px solid #dce3e7;border-radius:10px;background:#fff;color:#8b99a2}.facility-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#1d2932;font-size:12px}
  .facility-category-list{display:flex;gap:5px;overflow-x:auto;padding:11px 16px 9px;scrollbar-width:none}.facility-category-list::-webkit-scrollbar{display:none}.facility-category-list button{flex:0 0 auto;padding:6px 9px;border:1px solid #dce3e7;border-radius:999px;background:#fff;color:#7c8991;font-size:9px;font-weight:800;cursor:pointer}.facility-category-list button.active{border-color:#ff6b00;background:#ff6b00;color:#fff}
  .facility-scroll-list{flex:1;overflow-y:auto;padding:3px 10px 12px}.facility-scroll-list>button{display:flex;align-items:center;gap:10px;width:100%;min-height:58px;padding:8px 10px;border:0;border-bottom:1px solid #e8edef;background:transparent;color:#1f2b34;text-align:left;cursor:pointer;transition:.18s}.facility-scroll-list>button:hover{background:#f2f5f6}.facility-scroll-list>button.active{border-radius:10px;background:#fff2e9;box-shadow:inset 3px 0 #ff6b00}.facility-list-number{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:#f0f2f3;color:#66747c;font-size:11px;font-weight:900}.facility-scroll-list>button.active .facility-list-number{background:#ff6b00;color:#fff}.facility-scroll-list button>div{min-width:0;flex:1}.facility-scroll-list b,.facility-scroll-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.facility-scroll-list b{font-size:12px}.facility-scroll-list small{margin-top:4px;color:#8a969e;font-size:9px}.facility-list-risk{width:8px;height:8px;flex:0 0 8px;border-radius:50%;box-shadow:0 0 8px currentColor}.facility-list-empty{padding:30px 12px;color:#88959d;font-size:11px;text-align:center}
  .facility-risk-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:12px 14px;border-top:1px solid #e1e7ea;background:#f6f8f9}.facility-risk-summary>div{text-align:center}.facility-risk-summary span,.facility-risk-summary b{display:block}.facility-risk-summary span{color:#87949c;font-size:8px}.facility-risk-summary span i{display:inline-block;width:5px;height:5px;margin-right:4px;border-radius:50%}.facility-risk-summary b{margin-top:3px;font:900 13px monospace}
  .facility-map-title{position:absolute;z-index:12;left:348px;top:24px;display:flex;align-items:center;gap:9px;padding:10px 13px;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:rgba(3,16,24,.68);color:#ff8a35;backdrop-filter:blur(12px)}.facility-map-title b,.facility-map-title small{display:block}.facility-map-title b{color:#fff;font-size:11px}.facility-map-title small{margin-top:3px;color:#a7bbc4;font-size:8px}
  .facility-map-live{position:absolute;z-index:14;right:24px;top:24px;display:flex;align-items:center;gap:7px;padding:9px 11px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(3,16,24,.72);color:#c7d9df;font:800 8px monospace;backdrop-filter:blur(12px)}.facility-map-live>i{width:7px;height:7px;border-radius:50%;background:#36e2a7;box-shadow:0 0 9px #36e2a7}.facility-map-live span{display:flex;align-items:center;gap:4px;margin-left:5px;color:#ff6c79}
  .facility-marker-layer{position:absolute;inset:0;z-index:10;pointer-events:none}.facility-patrol-route{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.facility-patrol-route polyline{fill:none;stroke:#66e4f6;stroke-width:2.2;stroke-dasharray:7 7;stroke-linecap:round;stroke-linejoin:round;opacity:.5;filter:drop-shadow(0 0 4px rgba(61,214,239,.75));animation:routeFlow 1.8s linear infinite}.facility-marker{position:absolute;display:grid;place-items:center;width:40px;height:40px;padding:0;transform:translate(-50%,-50%);border:3px solid #fff;border-radius:50%;background:#ff6b00;color:#fff;box-shadow:0 5px 17px rgba(0,0,0,.52);font-size:12px;font-weight:950;cursor:pointer;pointer-events:auto;transition:.2s}.facility-marker:hover,.facility-marker.selected{z-index:4;transform:translate(-50%,-50%) scale(1.16);box-shadow:0 0 0 5px rgba(255,255,255,.8),0 0 0 9px var(--facility-color),0 9px 28px rgba(0,0,0,.55)}.facility-marker.danger{animation:facilityPulse 1.4s ease-out infinite}.facility-marker-label{position:absolute;left:50%;bottom:47px;max-width:140px;padding:5px 8px;transform:translateX(-50%);overflow:hidden;border-radius:6px;background:rgba(2,13,20,.82);color:#fff;font-size:9px;font-weight:800;text-overflow:ellipsis;white-space:nowrap;opacity:0;pointer-events:none;transition:.2s}.facility-marker:hover .facility-marker-label,.facility-marker.selected .facility-marker-label{opacity:1}.facility-selected-area{position:absolute;z-index:-1;width:110px;height:58px;border:4px solid #ff6b00;border-radius:50%;background:rgba(255,107,0,.16);transform:rotate(-9deg);box-shadow:0 0 22px rgba(255,107,0,.65)}
  .facility-worker{position:absolute;display:flex;align-items:center;gap:6px;transform:translate(-50%,-50%);color:#61dcf4;white-space:nowrap;pointer-events:none}.facility-worker i{width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:#3bd4f4;box-shadow:0 0 12px #3bd4f4;animation:workerPulse 1.4s infinite}.facility-worker span{font:900 9px monospace;text-shadow:0 2px 5px #000}.facility-worker.danger{color:#ff728a}.facility-worker.danger i{background:#ff4664;box-shadow:0 0 12px #ff4664}
  .facility-worker.person{z-index:8;display:flex;flex-direction:column;gap:3px;width:44px;height:48px;transform:translate(-50%,-82%);transition:left .14s linear,top .14s linear;filter:drop-shadow(0 5px 5px rgba(0,0,0,.7))}.facility-worker.person .facility-person-avatar{position:relative;display:block;width:24px;height:38px;transform-origin:50% 80%;text-shadow:none}.facility-worker.person.right .facility-person-avatar{transform:scaleX(-1)}.facility-worker.person.walking .facility-person-avatar{animation:personBob .3s ease-in-out infinite alternate}.facility-worker.person i{position:absolute;display:block;width:auto;height:auto;border:0;border-radius:0;background:none;box-shadow:none;animation:none}.facility-worker.person .person-hardhat{z-index:3;left:5px;top:0;width:14px;height:6px;border-radius:7px 7px 2px 2px;background:#ff861f;box-shadow:0 0 0 1px #fff}.facility-worker.person .person-hardhat:after{content:"";position:absolute;right:-3px;bottom:-1px;width:7px;height:2px;border-radius:2px;background:#ffc067}.facility-worker.person .person-head{z-index:2;left:7px;top:5px;width:10px;height:10px;border-radius:50%;background:#f3c39e}.facility-worker.person .person-body{z-index:2;left:6px;top:14px;width:12px;height:14px;border-radius:4px 4px 2px 2px;background:linear-gradient(90deg,#11a8ca 0 42%,#efff72 42% 58%,#0784a5 58%);box-shadow:0 0 0 1px rgba(255,255,255,.85)}.facility-worker.person .person-arm{z-index:1;top:15px;width:4px;height:15px;border-radius:4px;background:#f3c39e;transform-origin:50% 2px}.facility-worker.person .arm-left{left:4px;transform:rotate(17deg)}.facility-worker.person .arm-right{right:4px;transform:rotate(-17deg)}.facility-worker.person .person-leg{top:26px;width:5px;height:13px;border-radius:2px 2px 4px 4px;background:#16394b;transform-origin:50% 1px}.facility-worker.person .leg-left{left:6px}.facility-worker.person .leg-right{right:6px}.facility-worker.person.walking .arm-left,.facility-worker.person.walking .leg-right{animation:limbForward .3s ease-in-out infinite alternate}.facility-worker.person.walking .arm-right,.facility-worker.person.walking .leg-left{animation:limbBack .3s ease-in-out infinite alternate}.facility-person-label{padding:3px 6px;border:1px solid rgba(103,224,245,.5);border-radius:5px;background:rgba(2,18,27,.88);color:#7de9fb;font:900 8px monospace;box-shadow:0 3px 8px rgba(0,0,0,.35)}.facility-worker.person.danger .person-body{background:linear-gradient(90deg,#ef344d 0 42%,#fff071 42% 58%,#b81835 58%)}.facility-worker.person.danger .facility-person-label{border-color:rgba(255,91,112,.65);color:#ff8798}
  .facility-external-panel{position:absolute;z-index:25;right:24px;top:72px;width:350px;display:flex;flex-direction:column;gap:10px}.facility-external-panel>div{border-color:rgba(255,135,55,.24)!important;background:rgba(7,29,43,.9)!important;box-shadow:0 18px 44px rgba(3,18,28,.24)!important}
  .facility-detail-panel{position:absolute;z-index:28;right:24px;bottom:66px;width:min(420px,calc(100% - 372px));overflow:hidden;border:1px solid rgba(255,255,255,.2);border-radius:18px;background:rgba(4,17,25,.88);box-shadow:0 28px 80px rgba(0,0,0,.52);color:#fff;backdrop-filter:blur(20px)}.facility-detail-close{position:absolute;z-index:3;right:12px;top:12px;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:rgba(2,10,16,.76);color:#fff;cursor:pointer}.facility-detail-image{display:block;width:100%;height:190px;object-fit:cover}.facility-detail-content{padding:20px}.facility-detail-eyebrow{display:flex;align-items:center;gap:8px;color:#9fb6bf;font:800 8px monospace;letter-spacing:.09em}.facility-detail-eyebrow b{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#ff6b00;color:#fff;font:950 10px sans-serif}.facility-detail-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-top:12px}.facility-detail-title h3,.facility-detail-title p{margin:0}.facility-detail-title h3{font-size:19px}.facility-detail-title p{margin-top:5px;color:#8da5af;font-size:10px}.facility-detail-title strong{padding:5px 8px;border:1px solid currentColor;border-radius:999px;font-size:9px}.facility-description{margin:15px 0 0;color:#c1d0d5;font-size:11px;line-height:1.7}.facility-features{display:grid;gap:5px;margin:12px 0 0;padding:0;list-style:none}.facility-features li{position:relative;padding-left:12px;color:#aebfc5;font-size:10px}.facility-features li:before{content:"";position:absolute;left:0;top:5px;width:4px;height:4px;border-radius:50%;background:#ff7a1a}.facility-progress-row{display:flex;justify-content:space-between;margin-top:16px;color:#9db0b7;font-size:9px}.facility-progress-row b{color:#fff;font:900 12px monospace}.facility-progress-track{height:5px;margin-top:6px;overflow:hidden;border-radius:5px;background:#263942}.facility-progress-track i{display:block;height:100%;border-radius:inherit}.facility-detail-button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:40px;margin-top:16px;border:0;border-radius:9px;background:#ff6b00;color:#fff;font-size:11px;font-weight:900;cursor:pointer}.facility-detail-button svg:last-child{margin-left:auto}.facility-detail-button:hover{background:#ff7c1f}
  .facility-map-footer{position:absolute;z-index:16;left:348px;right:24px;bottom:16px;display:flex;align-items:center;gap:13px;padding:9px 12px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(3,16,24,.7);color:#7f9aa5;font-size:8px;backdrop-filter:blur(12px)}.facility-map-footer span{display:flex;align-items:center;gap:5px;color:#96b7ac}.facility-map-footer span i{width:6px;height:6px;border-radius:50%;background:#32e3a5;box-shadow:0 0 7px #32e3a5}.facility-map-footer b{color:#c4d6dc}.facility-map-footer small{margin-left:auto}
  .facility-alert-frame{position:absolute;inset:0;z-index:35;border:4px solid rgba(255,70,100,.55);pointer-events:none;animation:alertBlink 1.4s steps(2,start) infinite}.facility-alert-banner{position:absolute;z-index:40;left:50%;bottom:68px;width:min(440px,90%);transform:translateX(-50%)}
  @keyframes facilityPulse{50%{box-shadow:0 0 0 12px rgba(255,70,100,.14),0 5px 18px rgba(0,0,0,.52)}}@keyframes workerPulse{50%{transform:scale(1.45);opacity:.55}}@keyframes routeFlow{to{stroke-dashoffset:-28}}@keyframes personBob{to{margin-top:-2px}}@keyframes limbForward{to{transform:rotate(28deg)}}@keyframes limbBack{to{transform:rotate(-28deg)}}@keyframes alertBlink{50%{opacity:.35}}
  @media(max-width:1100px){.facility-map-shell{height:780px}.facility-list-panel{width:260px}.facility-map-title,.facility-map-footer{left:308px}.facility-detail-panel{width:360px}.facility-external-panel{display:none}}
  @media(max-width:760px){.facility-map-shell{height:850px}.facility-list-panel{left:10px;right:10px;top:10px;bottom:auto;width:auto;height:280px}.facility-map-title{display:none}.facility-map-live{top:302px;right:10px}.facility-detail-panel{left:10px;right:10px;bottom:52px;width:auto}.facility-detail-image{height:135px}.facility-map-footer{left:10px;right:10px;bottom:10px}.facility-map-footer small{display:none}.facility-marker-layer{top:280px}.facility-map-background,.facility-map-shade{top:280px;height:570px}}
`;

export default YardFacilityMap;
