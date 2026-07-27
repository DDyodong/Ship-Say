import React from "react";
import { LogOut, Moon, Smartphone, Sun } from "lucide-react";
import VisualPanel from "../../components/auth/VisualPanel";

function MobileAppNotice({ session, onLogout, theme, onToggleTheme }) {
  return <div className={`auth-theme-shell worker-notice-shell ${theme}-theme`}>
    <button
      type="button"
      className="auth-theme-toggle"
      onClick={onToggleTheme}
      title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
      aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}
    >
      {theme === "dark" ? <Sun/> : <Moon/>}
    </button>
    <main className="login-page">
      <VisualPanel/>
      <section className="login-wrap">
        <div className="login-card mobile-app-notice">
          <div className="mobile-app-icon"><Smartphone/></div>
          <span className="eyebrow">MOBILE SERVICE</span>
          <h2>{session.name} 님</h2>
          <p>현장 작업자 기능은 모바일 앱을 이용해 주세요.</p>
          <button type="button" className="secondary-auth-btn" onClick={onLogout}><LogOut/>로그아웃</button>
        </div>
      </section>
    </main>
  </div>;
}

export default MobileAppNotice;
