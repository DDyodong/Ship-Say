import React from "react";
import { Activity, BarChart3, Camera, FileSearch, ShieldCheck } from "lucide-react";
import { Feature } from "../common";

function VisualPanel() {
  return <section className="visual-panel">
    <header className="brand"><span className="auth-brand-mark"><img className="auth-brand-dark" src="/sidebar-logo.png" alt=""/><img className="auth-brand-light" src="/favicon.png" alt=""/></span><span>SMART SHIPYARD</span><em>AI SAFETY</em></header>
    <div className="hero-copy"><span className="eyebrow">CONNECTED SAFETY PLATFORM</span><h1>AI 기반 스마트 조선소<br/><strong>안전관리 시스템</strong></h1><p>실시간 위험 감지부터 작업 허가, TBM까지.<br/>조선소의 모든 안전 데이터를 하나로 연결합니다.</p></div>
    <div className="scene"><div className="scan-grid"/><div className="pulse p1"/><div className="pulse p2"/><div className="float f1"><ShieldCheck/>PPE 감지 <b>정상</b></div><div className="float f2"><Camera/>CAM-12 <b>LIVE</b></div><div className="float f3"><Activity/>위험도 <b>낮음</b></div></div>
    <div className="feature-strip"><Feature icon={Camera} title="AI 영상 관제" text="24시간 보호구·위험구역 감지"/><Feature icon={FileSearch} title="스마트 허가서" text="충돌 분석과 승인조건 자동 도출"/><Feature icon={BarChart3} title="예측 안전관리" text="블록별 위험도를 미리 확인"/></div>
    <footer>© 2026 Smart Shipyard AI Safety Management System</footer>
  </section>;
}

export default VisualPanel;
