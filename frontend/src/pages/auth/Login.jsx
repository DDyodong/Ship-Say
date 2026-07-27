import React, { useState } from "react";
import { ChevronRight, Eye, EyeOff, FileText, LockKeyhole, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { apiRequest } from "../../api/client";
import TermsModal from "../../components/auth/TermsModal";
import VisualPanel from "../../components/auth/VisualPanel";

function Login({ initialUsername, onLogin, onRegister, notify, theme, onToggleTheme }) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [form, setForm] = useState({ username: initialUsername || "", password: "" });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) return notify("아이디와 비밀번호를 입력해 주세요.");
    setSubmitting(true);
    try {
      const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
      const roles = (result.user.roles || []).map(role => String(role).toUpperCase());
      const role = roles.includes("ADMIN") ? "admin" : roles.includes("WORKER") ? "worker" : null;
      if (!role) throw new Error("웹 화면에 접근할 수 있는 사용자 역할이 없습니다.");
      onLogin({ token: result.accessToken, role, roles, name: result.user.name, username: result.user.username });
    } catch (error) { notify(error.message); } finally { setSubmitting(false); }
  };
  return <div className={`auth-theme-shell ${theme}-theme`}>
    <button type="button" className="auth-theme-toggle" onClick={onToggleTheme} title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"} aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}>{theme === "dark" ? <Sun/> : <Moon/>}</button>
    <main className="login-page">
      <VisualPanel/>
      <section className="login-wrap"><form className="login-card" onSubmit={submit}>
        <div className="login-head"><div className="shield-icon"><LockKeyhole/></div><div><span className="eyebrow">SECURE ACCESS</span><h2>안전관리 시스템 로그인</h2><p>허가된 임직원만 접속할 수 있습니다.</p></div></div>
        <label><span>아이디</span><div className="input-box"><UserRound/><input autoComplete="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="아이디를 입력하세요"/></div></label>
        <label><span>비밀번호</span><div className="input-box"><LockKeyhole/><input type={showPassword?"text":"password"} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="비밀번호를 입력하세요"/><button type="button" className="icon-btn" onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>
        <div className="auth-actions"><button type="button" className="secondary-auth-btn" onClick={onRegister}>회원가입</button><button className="primary-btn" type="submit" disabled={submitting}>{submitting?"접속 중...":"시스템 접속 →"}</button></div>
        <div className="login-note"><ShieldCheck/>Spring Security · 역할 기반 접근 제어(RBAC)</div>
        <button type="button" className="terms-banner" onClick={()=>setTermsOpen(true)}><FileText/><span><b>서비스 이용약관</b><small>약관 및 개인정보 수집·이용 내용 확인</small></span><ChevronRight/></button>
      </form></section>
    </main>
    <TermsModal open={termsOpen} onClose={()=>setTermsOpen(false)}/>
  </div>;
}

export default Login;
