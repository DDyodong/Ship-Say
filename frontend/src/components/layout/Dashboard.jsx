import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { adminNav } from "../../data/navigation";
import LegalFooter from "../common/LegalFooter";
import Page from "./Page";

function Dashboard({ session, onLogout, notify, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const { page = "dashboard" } = useParams();
  const isMapPage = page === "dashboard";
  const [profileOpen, setProfileOpen] = useState(false);
  const [unconfirmedEventCount, setUnconfirmedEventCount] = useState(0);
  const profileRef = useRef(null);
  const displayName = String(session?.name || session?.username || "사용자").trim();
  const maskedName = displayName.length > 1 ? `${displayName.slice(0, -1)}*` : "*";
  const userRoleLabel = session?.roles?.includes("ADMIN") ? "안전 관리자" : "작업자";

  const loadUnconfirmedEventCount = useCallback(async () => {
    try {
      const events = await apiRequest("/api/safety-events/reports?status=received", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      // 시스템이 작업자에게 보낸 안내는 관리자의 확인 대상이 아니므로 제외한다.
      setUnconfirmedEventCount(events.filter((event) => event.sourceType !== "system_alert").length);
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

  useEffect(() => {
    const closeProfile = (event) => {
      const clickedOutside = event.type === "pointerdown" && !profileRef.current?.contains(event.target);
      if (event.key === "Escape" || clickedOutside) setProfileOpen(false);
    };
    document.addEventListener("pointerdown", closeProfile);
    document.addEventListener("keydown", closeProfile);
    return () => {
      document.removeEventListener("pointerdown", closeProfile);
      document.removeEventListener("keydown", closeProfile);
    };
  }, []);

  return <div className={`app-shell ${theme}-theme`} style={{ gridTemplateColumns: "1fr" }}>
    <main className="workspace" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", height: "100dvh" }}>
      <header className="topnav-header" style={{ flexShrink: 0 }}>
        <div className="topnav-brand">
          <b>SHIP-SAY</b>
          <span>스마트 조선소 통합 안전 모니터링</span>
        </div>

        <div className="topnav-right">
          <nav className="topnav-menu" aria-label="관리자 메뉴">
            {adminNav.map(([id, label, Icon]) => <button key={id} className={page === id ? "active" : ""}
              onClick={() => navigate(`/admin/${id}`)}>
              <Icon size={16}/><small>{label}</small>
            </button>)}
          </nav>

          <div className="topnav-tools">
            <button
              type="button"
              title={`미확인 안전 이벤트 ${unconfirmedEventCount}건`}
              aria-label={`미확인 안전 이벤트 ${unconfirmedEventCount}건`}
              className="topnav-icon-btn"
              onClick={() => navigate("/admin/reports")}
            >
              <Bell size={17}/>
              {unconfirmedEventCount > 0 && <i>{unconfirmedEventCount > 99 ? "99+" : unconfirmedEventCount}</i>}
            </button>
            <button type="button" onClick={onToggleTheme} className="topnav-icon-btn"
              title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
              aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
              aria-pressed={theme === "light"}>
              {theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}
            </button>

            <div className="topnav-profile" ref={profileRef}>
              <button type="button" className="profile-trigger" aria-label="프로필 메뉴"
                aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
                <span className="profile-avatar"><UserRound size={17}/></span>
                <ChevronDown size={13} className={profileOpen ? "open" : ""}/>
              </button>
              {profileOpen && <div className="profile-menu" role="menu">
                <div className="profile-summary">
                  <span className="profile-avatar large"><UserRound size={18}/></span>
                  <div><small>{userRoleLabel}</small><b>{maskedName}</b></div>
                </div>
                <button type="button" role="menuitem" className="profile-logout"
                  onClick={() => { setProfileOpen(false); onLogout(); }}>
                  <LogOut size={15}/><span>로그아웃</span>
                </button>
              </div>}
            </div>
          </div>
        </div>
      </header>

      <section className="content" style={isMapPage ? { padding: 0, maxWidth: "none", margin: 0, flex: 1, minHeight: 0 } : undefined}>
        <Page page={page} session={session} notify={notify}/>
      </section>
      <LegalFooter compact/>
    </main>
  </div>;
}

export default Dashboard;