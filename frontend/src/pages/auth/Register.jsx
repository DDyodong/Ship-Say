import React, { useState } from "react";
import { Check, CheckCircle2, LockKeyhole, Moon, Sun, UserRound } from "lucide-react";
import { apiRequest } from "../../api/client";
import TermsModal from "../../components/auth/TermsModal";
import VisualPanel from "../../components/auth/VisualPanel";

function Register({ onBack, onRegistered, notify, theme, onToggleTheme }) {
  const [form, setForm] = useState({ name:"", employeeNo:"", username:"", password:"", passwordConfirm:"" });
  const [employeeVerified, setEmployeeVerified] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const setField = (field, value) => {
    setForm(current => ({...current, [field]: value}));
    if (field === "name" || field === "employeeNo") setEmployeeVerified(false);
    if (field === "username") setUsernameAvailable(false);
  };
  const verifyEmployee = async () => {
    if (!form.name || !form.employeeNo) return notify("이름과 사번을 입력해 주세요.");
    try {
      await apiRequest("/api/auth/employees/verify", { method:"POST", body:JSON.stringify({name:form.name, employeeNo:form.employeeNo}) });
      setEmployeeVerified(true); notify("사번 인증이 완료되었습니다.");
    } catch (error) { setEmployeeVerified(false); notify(error.message); }
  };
  const checkUsername = async () => {
    if (!form.username) return notify("아이디를 입력해 주세요.");
    try {
      const result = await apiRequest(`/api/auth/usernames/${encodeURIComponent(form.username)}/availability`);
      setUsernameAvailable(result.available);
      notify(result.available ? "사용할 수 있는 아이디입니다." : "이미 사용 중인 아이디입니다.");
    } catch (error) { setUsernameAvailable(false); notify(error.message); }
  };
  const passwordValid = form.password.length >= 8;
  const passwordMatches = passwordValid && form.password === form.passwordConfirm;
  const canSubmit = employeeVerified && usernameAvailable && passwordMatches && termsAgreed;
  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return notify("모든 입력과 인증, 필수 약관 동의를 완료해 주세요.");
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/register", { method:"POST", body:JSON.stringify({...form, termsAgreed}) });
      onRegistered(form.username);
    } catch (error) { notify(error.message); } finally { setSubmitting(false); }
  };
  return <div className={`auth-theme-shell ${theme}-theme`}>
    <button type="button" className="auth-theme-toggle" onClick={onToggleTheme} title={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"} aria-label={theme === "dark" ? "밝은 모드로 전환" : "어두운 모드로 전환"}>{theme === "dark" ? <Sun/> : <Moon/>}</button>
    <main className="login-page">
      <VisualPanel/>
      <section className="login-wrap"><form className="login-card register-card" onSubmit={submit}>
      <div className="login-head"><div className="shield-icon"><UserRound/></div><div><span className="eyebrow">CREATE ACCOUNT</span><h2>안전관리 시스템 회원가입</h2></div></div>
      <div className="register-row employee-row">
        <label><span>이름</span><div className="input-box"><UserRound/><input value={form.name} onChange={e=>setField("name",e.target.value)}/>{employeeVerified&&<CheckCircle2 className="field-check"/>}</div></label>
        <label><span>사번</span><div className="input-box"><input value={form.employeeNo} onChange={e=>setField("employeeNo",e.target.value)}/>{employeeVerified&&<CheckCircle2 className="field-check"/>}</div></label>
        <button type="button" className={employeeVerified?"verify-btn verified":"verify-btn"} onClick={verifyEmployee}>사번인증{employeeVerified&&<Check/>}</button>
      </div>
      <div className="register-row username-row">
        <label><span>아이디</span><div className="input-box"><UserRound/><input value={form.username} onChange={e=>setField("username",e.target.value)}/>{usernameAvailable&&<CheckCircle2 className="field-check"/>}</div></label>
        <button type="button" className={usernameAvailable?"verify-btn verified":"verify-btn"} onClick={checkUsername}>중복체크{usernameAvailable&&<Check/>}</button>
      </div>
      <div className="register-row password-row">
        <label><span>비밀번호</span><div className="input-box"><LockKeyhole/><input type="password" autoComplete="new-password" value={form.password} onChange={e=>setField("password",e.target.value)}/>{passwordValid&&<CheckCircle2 className="field-check"/>}</div></label>
        <label><span>비밀번호 확인</span><div className="input-box"><LockKeyhole/><input type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={e=>setField("passwordConfirm",e.target.value)}/>{passwordMatches&&<CheckCircle2 className="field-check"/>}</div></label>
      </div>
      <div className="terms-consent">
        <label><input type="checkbox" checked={termsAgreed} onChange={event=>setTermsAgreed(event.target.checked)}/><span><b>[필수]</b> 이용약관 및 개인정보 수집·이용에 동의합니다.</span></label>
        <button type="button" onClick={()=>setTermsOpen(true)}>내용 보기</button>
      </div>
      <div className="auth-actions"><button type="button" className="secondary-auth-btn" onClick={onBack}>로그인으로</button><button className="primary-btn" type="submit" disabled={!canSubmit||submitting}>{submitting?"가입 처리 중...":"회원가입 완료"}</button></div>
      </form></section>
    </main>
    <TermsModal open={termsOpen} onClose={()=>setTermsOpen(false)}/>
  </div>;
}

export default Register;
