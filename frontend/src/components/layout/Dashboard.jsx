import React, { useState } from "react";
import { Bell, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { adminNav } from "../../data/navigation";
import { maskName } from "../../utils/privacy";
import LegalFooter from "../common/LegalFooter";
import Page from "./Page";

function Dashboard({ session, onLogout, notify, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const { page = "dashboard" } = useParams();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const nav = adminNav;
  const title = nav.find(n=>n[0]===page)?.[1] || "대시보드";

  const isMapPage = page === "dashboard";

  return <div className={`app-shell ${theme}-theme`}
    style={isMapPage
      ? { gridTemplateColumns: "1fr" }
      : { "--sidebar-width": collapsed ? "72px" : "244px", transition: "grid-template-columns .2s ease" }}>
    {!isMapPage && <aside className={mobile?"sidebar open":"sidebar"}>
      <button type="button" onClick={()=>setCollapsed((v)=>!v)}
        title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        style={{
          position: "absolute", top: 20, right: -14, width: 30, height: 30, borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--panel)", color: "var(--muted)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,.25)", zIndex: 10,
        }}>
        {collapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}
      </button>

      {!collapsed && <div className="side-brand">
        <div style={{
          width: 38, height: 38, borderRadius: "50%", background: "var(--panel)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cyan)", fontWeight: 700, flexShrink: 0,
        }}>{session.name[0]}</div>
        <div><b>{maskName(session.name)}</b><span>관리자 · 안전환경팀</span></div>
        <button onClick={()=>setMobile(false)}><X/></button>
      </div>}

      {!collapsed && <div style={{ borderTop: "1px solid var(--border)", margin: "0 16px" }}/>}
      {!collapsed && <div style={{ padding: "14px 20px 4px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" }}>MAIN</div>}

      <nav style={{ marginTop: collapsed ? 56 : 0 }}>{nav.map(([id,label,Icon])=><button key={id} className={page===id?"active":""}
        title={collapsed ? label : undefined}
        onClick={()=>{navigate(`/admin/${id}`);setMobile(false)}}>
        <Icon/>{!collapsed && label}
      </button>)}</nav>
      <div className="side-bottom" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!collapsed && <div style={{ display: "flex", gap: 8 }}>
          <button type="button" title="알림" style={{
            position: "relative", width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--border)",
            background: "var(--panel)", color: "var(--cyan)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell size={16}/>
            <i style={{
              position: "absolute", top: -2, right: -2, minWidth: 14, height: 14, borderRadius: 7,
              background: "#e0455c", color: "#fff", fontSize: 8, fontWeight: 700, fontStyle: "normal",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>3</i>
          </button>
          <button type="button" className="theme-toggle"
            title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
            aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
            aria-pressed={theme === "light"} onClick={onToggleTheme}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--border)",
              background: "var(--panel)", color: "var(--cyan)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
        </div>}
        <button className="logout" onClick={onLogout} title={collapsed ? "로그아웃" : undefined}>
          <LogOut/>{!collapsed && "로그아웃"}
        </button>
      </div>
    </aside>}
    <main className="workspace" style={isMapPage ? { gridColumn: "1 / -1" } : undefined}>
      {isMapPage && <header style={{
        height: 46, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px", background: "var(--navy)", borderBottom: "1px solid var(--border)",
        position: "relative", zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", background: "var(--panel)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cyan)", fontWeight: 700, fontSize: 12,
          }}>{session.name[0]}</div>
          <b style={{ fontSize: 14 }}>SHIP-SAY</b>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>거제 스마트 조선소 통합 안전 모니터링</span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {nav.map(([id, label, Icon]) => <button key={id} onClick={() => navigate(`/admin/${id}`)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none",
              cursor: "pointer", color: page === id ? "var(--cyan)" : "var(--muted)", fontSize: 9, fontWeight: 700,
            }}>
            <Icon size={16}/>{label}
          </button>)}
          <button type="button" title="알림" style={{ position: "relative", background: "none", border: "none", color: "var(--cyan)", cursor: "pointer" }}>
            <Bell size={16}/>
            <i style={{ position: "absolute", top: -4, right: -6, minWidth: 12, height: 12, borderRadius: 6, background: "#e0455c",
              color: "#fff", fontSize: 7, fontWeight: 700, fontStyle: "normal", display: "flex", alignItems: "center", justifyContent: "center" }}>3</i>
          </button>
          <button type="button" onClick={onToggleTheme} style={{ background: "none", border: "none", color: "var(--cyan)", cursor: "pointer" }}>
            {theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
          <button type="button" onClick={onLogout} title="로그아웃" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            <LogOut size={16}/>
          </button>
        </nav>
      </header>}
      {!isMapPage && <header className="topbar"><button className="menu-btn" onClick={()=>setMobile(true)}><Menu/></button><div><span>거제 스마트 조선소 / 관리자</span><h1>{title}</h1></div><div className="top-actions"><div className="live"><i/> 시스템 정상</div></div></header>}
      <section className="content" style={isMapPage ? { padding: 0, maxWidth: "none", margin: 0 } : undefined}><Page page={page} session={session} notify={notify}/></section>
      {!isMapPage && <LegalFooter compact/>}
    </main>
  </div>;
}

export default Dashboard;