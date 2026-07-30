import React, { useState } from "react";
import { Bell, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { adminNav } from "../../data/navigation";
import { maskName } from "../../utils/privacy";
import LegalFooter from "../common/LegalFooter";
import Page from "./Page";

function Dashboard({ session, onLogout, notify, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const { page = "dashboard" } = useParams();
  const [mobile, setMobile] = useState(false);
  const nav = adminNav;
  const title = nav.find(n=>n[0]===page)?.[1] || "대시보드";

  return <div className={`app-shell ${theme}-theme`}>
    <aside className={mobile?"sidebar open":"sidebar"}><div className="side-brand"><img className="side-brand-logo" src={theme === "light" ? "/favicon.png" : "/sidebar-logo.png"} alt=""/><div><b>SHIP-SAY</b><span>AI SAFETY SMARTYARD PLATFORM</span></div><button onClick={()=>setMobile(false)}><X/></button></div><nav>{nav.map(([id,label,Icon])=><button key={id} className={page===id?"active":""} onClick={()=>{navigate(`/admin/${id}`);setMobile(false)}}><Icon/>{label}</button>)}</nav><div className="side-bottom"><div className="user-chip"><div>{session.name[0]}</div><span><b>{maskName(session.name)}</b><small>관리자 · 안전환경팀</small></span></div><button className="logout" onClick={onLogout}><LogOut/>로그아웃</button></div></aside>
    <main className="workspace"><header className="topbar"><button className="menu-btn" onClick={()=>setMobile(true)}><Menu/></button><div><span>거제 스마트 조선소 / 관리자</span><h1>{title}</h1></div><div className="top-actions"><div className="live"><i/> 시스템 정상</div><button type="button" title="알림"><Bell/><i>3</i></button><button type="button" className="theme-toggle" title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"} aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"} aria-pressed={theme === "light"} onClick={onToggleTheme}>{theme === "dark" ? <Sun/> : <Moon/>}</button></div></header>
      <section className="content"><Page page={page} session={session} notify={notify}/></section>
      <LegalFooter compact/>
    </main>
  </div>;
}

export default Dashboard;
