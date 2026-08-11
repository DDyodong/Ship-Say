import React, { useCallback, useEffect, useState } from "react";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { adminNav } from "../../data/navigation";
import LegalFooter from "../common/LegalFooter";
import Page from "./Page";

function Dashboard({ session, onLogout, notify, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const { page = "dashboard" } = useParams();
  const nav = adminNav;
  const isMapPage = page === "dashboard";
  const [unconfirmedEventCount, setUnconfirmedEventCount] = useState(0);

  const loadUnconfirmedEventCount = useCallback(async () => {
    try {
      const events = await apiRequest("/api/safety-events/reports?status=received", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      // 시스템이 작업자에게 보낸 안내는 관리자의 확인 대상이 아니므로 제외한다.
      setUnconfirmedEventCount(events.filter(event => event.sourceType !== "system_alert").length);
    } catch {
      // 배지 조회 실패가 관리자 화면 전체 사용을 막지 않도록 기존 값을 유지한다.
    }
  }, [session.token]);

  useEffect(() => {
    loadUnconfirmedEventCount();
    const refresh = () => loadUnconfirmedEventCount();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("safety-events-updated", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("safety-events-updated", refresh);
    };
  }, [loadUnconfirmedEventCount]);

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
          <button
            type="button"
            title={`미확인 안전 이벤트 ${unconfirmedEventCount}건`}
            aria-label={`미확인 안전 이벤트 ${unconfirmedEventCount}건`}
            className="topnav-icon-btn"
            onClick={() => navigate("/admin/reports")}
          >
            <Bell size={16}/>
            {unconfirmedEventCount > 0 && <i>{unconfirmedEventCount > 99 ? "99+" : unconfirmedEventCount}</i>}
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
