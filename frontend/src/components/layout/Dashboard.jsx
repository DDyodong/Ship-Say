import React from "react";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { adminNav } from "../../data/navigation";
import LegalFooter from "../common/LegalFooter";
import Page from "./Page";

function Dashboard({ session, onLogout, notify, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const { page = "dashboard" } = useParams();
  const nav = adminNav;
  const isMapPage = page === "dashboard";

  return <div className={`app-shell ${theme}-theme`} style={{ gridTemplateColumns: "1fr" }}>
    <main className="workspace" style={{ gridColumn: "1 / -1" }}>
      <header className="topnav-header">
        <div className="topnav-brand">
          <div className="topnav-avatar">{session.name[0]}</div>
          <b>SHIP-SAY</b>
          <span>거제 스마트 조선소 통합 안전 모니터링</span>
        </div>
        <nav className="topnav-menu">
          {nav.map(([id, label, Icon]) => <button key={id} className={page === id ? "active" : ""}
            onClick={() => navigate(`/admin/${id}`)}>
            <Icon size={16}/><small>{label}</small>
          </button>)}
          <button type="button" title="알림" className="topnav-icon-btn">
            <Bell size={16}/>
            <i>3</i>
          </button>
          <button type="button" onClick={onToggleTheme} className="topnav-icon-btn"
            title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
            aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
            aria-pressed={theme === "light"}>
            {theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
          <button type="button" onClick={onLogout} title="로그아웃" className="topnav-icon-btn muted">
            <LogOut size={16}/>
          </button>
        </nav>
      </header>
      <section className="content" style={isMapPage ? { padding: 0, maxWidth: "none", margin: 0 } : undefined}>
        <Page page={page} session={session} notify={notify}/>
      </section>
      {!isMapPage && <LegalFooter compact/>}
    </main>
  </div>;
}

export default Dashboard;
