import React, { useState } from "react";
import { Check, CheckCircle2, Moon, Sun } from "lucide-react";
import { apiRequest } from "../../api/client";
import TermsModal from "../../components/auth/TermsModal";

function Register({ onBack, onRegistered, notify, theme, onToggleTheme }) {
  const [form, setForm] = useState({ name: "", employeeNo: "", username: "", password: "", passwordConfirm: "" });
  const [employeeVerified, setEmployeeVerified] = useState(false);
  const [employeeRole, setEmployeeRole] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isDark = theme === "dark";

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === "name" || field === "employeeNo") { setEmployeeVerified(false); setEmployeeRole(""); }
    if (field === "username") setUsernameAvailable(false);
  };

  const verifyEmployee = async () => {
    if (!form.name || !form.employeeNo) return notify("이름과 사번을 입력해 주세요.");
    try {
      const result = await apiRequest("/api/auth/employees/verify", { method: "POST", body: JSON.stringify({ name: form.name, employeeNo: form.employeeNo }) });
      if (result.verified !== true || !["ADMIN", "WORKER"].includes(result.role)) throw new Error("사번 인증 응답이 올바르지 않습니다.");
      setEmployeeRole(result.role);
      setEmployeeVerified(true);
      notify(`${result.role === "ADMIN" ? "관리자" : "작업자"} 사번 인증이 완료되었습니다.`);
    } catch (error) { setEmployeeVerified(false); setEmployeeRole(""); notify(error.message); }
  };

  const checkUsername = async () => {
    if (!form.username) return notify("아이디를 입력해 주세요.");
    try {
      const result = await apiRequest(`/api/auth/usernames/${encodeURIComponent(form.username)}/availability`);
      setUsernameAvailable(result.available);
      notify(result.available ? "사용할 수 있는 아이디입니다." : "이미 사용 중인 아이디입니다.");
    } catch (error) { setUsernameAvailable(false); notify(error.message); }
  };

  const passwordRules = {
    length: form.password.length >= 10 && form.password.length <= 16,
    letter: /[A-Za-z]/.test(form.password),
    number: /\d/.test(form.password),
    special: /[!@#$%^&*_\-+=?]/.test(form.password),
  };
  const passwordValid = Object.values(passwordRules).every(Boolean);
  const passwordMatches = passwordValid && form.password === form.passwordConfirm;
  const canSubmit = employeeVerified && usernameAvailable && passwordMatches && termsAgreed;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return notify("모든 입력과 인증, 필수 약관 동의를 완료해 주세요.");
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify({ ...form, termsAgreed }) });
      onRegistered(form.username);
    } catch (error) { notify(error.message); } finally { setSubmitting(false); }
  };

  const labelCls = "text-[9px] font-black text-slate-300 dark:text-white/30 uppercase tracking-[0.15em] group-focus-within:text-brand transition-colors";
  const inputCls = "w-full py-2 pr-8 text-base font-bold text-dark dark:text-white outline-none bg-transparent border-b-2 border-slate-200 dark:border-white/15 focus:border-brand focus:pl-2 transition-all duration-300 placeholder:text-slate-200 dark:placeholder:text-white/20";
  const pillCls = (active) => `shrink-0 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors ${
    active ? "bg-emerald-50 text-emerald-600" : "bg-dark text-white dark:bg-white dark:text-dark hover:bg-brand dark:hover:bg-brand dark:hover:text-white"}`;

  return <div className={isDark ? "dark" : ""}>
    <style>{`
      @keyframes reveal-corner-br { from { clip-path: circle(0% at 100% 100%); } to { clip-path: circle(150% at 100% 100%); } }
      .page-reveal-br { animation: reveal-corner-br .8s cubic-bezier(.77,0,.175,1) both; }
    `}</style>
    <div className="page-reveal-br flex h-screen w-full bg-white dark:bg-dark font-sans antialiased overflow-hidden relative transition-colors">
      <button type="button" onClick={onToggleTheme}
        title={isDark ? "밝은 모드로 전환" : "어두운 모드로 전환"}
        className="absolute top-5 right-5 z-40 w-8 h-8 rounded-full bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-white/70 hover:text-brand hover:border-brand/40 transition-colors">
        {isDark ? <Sun size={14}/> : <Moon size={14}/>}
      </button>

      {/* 좌측: 비주얼 히어로 (40%) */}
      <div className="relative hidden lg:flex w-[40%] h-full overflow-hidden bg-dark">
        <div className="absolute inset-0">
          <img className="w-full h-full object-cover opacity-50 grayscale"
            src="https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_aa9a434ba8_ab1ed0813cc71c1f.png"
            alt="조선소 강재 구조물"/>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/20 to-transparent z-10"/>

        <div className="relative z-20 w-full h-full p-10 flex flex-col justify-between">
          <button type="button" onClick={onBack} title="로그인으로"
            className="w-9 h-9 rounded-full bg-white/5 backdrop-blur-2xl border border-white/10 flex items-center justify-center text-white hover:bg-brand transition-colors">
            ←
          </button>

          <div>
            <h1 className="text-white text-4xl font-black mb-4 tracking-tighter uppercase">
              Join the<br/><span className="text-brand text-6xl">CORE.</span>
            </h1>
            <p className="text-white/40 text-xs font-bold tracking-widest uppercase">smart shipyard ai system</p>
          </div>

          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-4 rounded-2xl">
            <p className="text-white/60 text-[10px] font-bold leading-relaxed uppercase tracking-widest">
              Authorized Personnel Only.<br/>Verification Required.
            </p>
          </div>
        </div>
      </div>

      {/* 우측: 회원가입 폼 (60%) */}
      <div className="w-full lg:w-[60%] h-full bg-white dark:bg-dark flex flex-col p-8 lg:p-14 justify-center relative z-30 overflow-y-auto transition-colors">
        <form className="max-w-2xl w-full mx-auto" onSubmit={submit}>
          <header className="mb-6">
            <h2 className="text-3xl font-black text-dark dark:text-white tracking-tighter mb-1.5">REQUEST ACCESS</h2>
            <p className="text-slate-400 dark:text-white/40 font-bold text-xs tracking-tight leading-relaxed">
              시스템 사용 승인을 위해 정보를 입력해 주세요. 모든 필드는 관리자 확인용으로 사용됩니다.
            </p>
          </header>

          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1 group">
                <label className={labelCls}>Full Name</label>
                <div className="relative">
                  <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="성함" className={inputCls}/>
                  {employeeVerified && <CheckCircle2 size={16} className="absolute right-0 bottom-2.5 text-emerald-500"/>}
                </div>
              </div>
              <div className="space-y-1 group">
                <label className={labelCls}>Employee ID</label>
                <div className="relative">
                  <input value={form.employeeNo} onChange={(e) => setField("employeeNo", e.target.value)} placeholder="사번" className={inputCls}/>
                  {employeeVerified && <CheckCircle2 size={16} className="absolute right-0 bottom-2.5 text-emerald-500"/>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between -mt-2.5">
              <span className="text-[10px] font-bold text-slate-400 dark:text-white/40">이름·사번 입력 후 인증이 필요합니다.</span>
              <button type="button" onClick={verifyEmployee} className={pillCls(employeeVerified)}>
                {employeeVerified ? `${employeeRole === "ADMIN" ? "관리자" : "작업자"} 인증됨` : "사번인증"}
                {employeeVerified && <Check size={11}/>}
              </button>
            </div>

            {/* 시안의 Department/Team 자리 — 실제 폼엔 없는 필드라 아이디+중복체크로 대체 */}
            <div className="space-y-1 group">
              <label className={labelCls}>Username</label>
              <div className="flex items-end gap-3">
                <div className="relative flex-1">
                  <input value={form.username} onChange={(e) => setField("username", e.target.value)} placeholder="아이디" className={inputCls}/>
                  {usernameAvailable && <CheckCircle2 size={16} className="absolute right-0 bottom-2.5 text-emerald-500"/>}
                </div>
                <button type="button" onClick={checkUsername} className={`${pillCls(usernameAvailable)} mb-1.5`}>
                  중복체크{usernameAvailable && <Check size={11}/>}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1 group">
                <label className={labelCls}>Set Password</label>
                <div className="relative">
                  <input type="password" autoComplete="new-password" value={form.password} placeholder="비밀번호"
                    onChange={(e) => setField("password", e.target.value)} className={inputCls}/>
                  {passwordValid && <CheckCircle2 size={16} className="absolute right-0 bottom-2.5 text-emerald-500"/>}
                </div>
              </div>
              <div className="space-y-1 group">
                <label className={labelCls}>Confirm Password</label>
                <div className="relative">
                  <input type="password" autoComplete="new-password" value={form.passwordConfirm} placeholder="비밀번호 확인"
                    onChange={(e) => setField("passwordConfirm", e.target.value)} className={inputCls}/>
                  {passwordMatches && <CheckCircle2 size={16} className="absolute right-0 bottom-2.5 text-emerald-500"/>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 -mt-3">
              {[["length", "10~16자"], ["letter", "영문"], ["number", "숫자"], ["special", "특수문자"]].map(([key, label]) => (
                <span key={key} className={`text-[10px] font-bold flex items-center gap-1 ${passwordRules[key] ? "text-emerald-600" : "text-slate-300 dark:text-white/20"}`}>
                  <Check size={10}/>{label}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-white/50">
                <input type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} className="w-3.5 h-3.5 accent-brand"/>
                <span><b className="text-dark dark:text-white">[필수]</b> 이용약관 및 개인정보 수집·이용에 동의합니다.</span>
              </label>
              <button type="button" onClick={() => setTermsOpen(true)}
                className="shrink-0 text-[10px] font-black text-slate-400 dark:text-white/40 hover:text-brand transition-colors uppercase tracking-widest">내용 보기</button>
            </div>

            <button type="submit" disabled={!canSubmit || submitting}
              className="w-full bg-brand hover:bg-black disabled:bg-slate-100 dark:disabled:bg-white/10 disabled:text-slate-300 dark:disabled:text-white/30 text-white font-black py-3.5 rounded-full text-sm uppercase tracking-widest shadow-xl shadow-brand/20 disabled:shadow-none transition-all duration-500 hover:-translate-y-0.5 active:scale-95">
              {submitting ? "가입 처리 중..." : "SUBMIT REQUEST"}
            </button>
          </div>

          <div className="mt-5 text-center">
            <p className="text-xs font-bold text-slate-400 dark:text-white/40">
              이미 승인된 계정이 있으신가요?
              <button type="button" onClick={onBack} className="text-dark dark:text-white hover:text-brand font-black ml-2 uppercase tracking-widest transition-colors">Login Here</button>
            </p>
          </div>
        </form>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)}/>
    </div>
  </div>;
}

export default Register;