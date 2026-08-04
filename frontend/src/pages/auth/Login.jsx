import React, { useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { apiRequest } from "../../api/client";
import TermsModal from "../../components/auth/TermsModal";

function Login({ initialUsername, onLogin, onRegister, notify, theme, onToggleTheme }) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [form, setForm] = useState({ username: initialUsername || "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState(""); // 비어있지 않으면 실패 모달이 뜸
  const isDark = theme === "dark";

  const submit = async (e) => {
    e.preventDefault();

    const nextErrors = {
      username: form.username ? "" : "아이디를 입력해 주세요.",
      password: form.password ? "" : "비밀번호를 입력해 주세요.",
    };
    setFieldErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) return;

    setSubmitting(true);
    try {
      const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
      const roles = (result.user.roles || []).map((role) => String(role).toUpperCase());
      const role = roles.includes("ADMIN") ? "admin" : roles.includes("WORKER") ? "worker" : null;
      if (!role) throw new Error("웹 화면에 접근할 수 있는 사용자 역할이 없습니다.");
      onLogin({ token: result.accessToken, role, roles, name: result.user.name, username: result.user.username });
    } catch (error) {
      setLoginError(error.message || "아이디 또는 비밀번호를 잘못 입력했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const clearFieldError = (field) => {
    if (fieldErrors[field]) setFieldErrors({ ...fieldErrors, [field]: "" });
  };

  return <div className={isDark ? "dark" : ""}>
    <style>{`
      @keyframes reveal-corner { from { clip-path: circle(0% at 0% 0%); } to { clip-path: circle(150% at 0% 0%); } }
      .page-reveal-tl { animation: reveal-corner .8s cubic-bezier(.77,0,.175,1) both; }
      @keyframes modal-pop { from { opacity: 0; transform: scale(.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      .modal-pop { animation: modal-pop .18s ease-out both; }
    `}</style>
    <div className="page-reveal-tl flex h-screen w-full bg-white dark:bg-dark font-sans antialiased overflow-hidden relative transition-colors">
      <button type="button" onClick={onToggleTheme}
        title={isDark ? "밝은 모드로 전환" : "어두운 모드로 전환"}
        className="absolute top-5 right-5 z-40 w-8 h-8 rounded-full bg-slate-50 dark:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-white/70 hover:text-brand hover:border-brand/40 transition-colors">
        {isDark ? <Sun size={14}/> : <Moon size={14}/>}
      </button>

      {/* 좌측: 비주얼 히어로 (60%) */}
      <div className="relative hidden lg:flex w-[60%] h-full overflow-hidden bg-dark">
        <div className="absolute inset-0 scale-110">
          <img className="w-full h-full object-cover opacity-60"
            src="https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_4e6b4e13b7_44c5129a04221d73.png"
            alt="조선소 야드 전경"/>
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-dark/40 via-transparent to-dark/80 z-10"/>

        <div className="relative z-20 w-full h-full p-14 flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white">
              <ShieldCheck size={18}/>
            </div>
            <span className="text-white font-bold tracking-[0.3em] uppercase text-[11px]">Smart Shipyard AI System</span>
          </div>

          <div className="max-w-2xl">
            <h1 className="text-white font-black mb-6" style={{ fontSize: "clamp(2.6rem, 7vw, 4.2rem)", lineHeight: 0.9, letterSpacing: "-0.04em" }}>
              AI 기반 스마트 조선소<br/><span className="text-brand">안전관리 시스템</span>
            </h1>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-[2rem] inline-block">
              <p className="text-white/70 text-base font-medium leading-relaxed max-w-md">
                대한민국 조선업의 미래, <br/>AI가 지키는 가장 안전한 작업 현장입니다.
              </p>
            </div>
          </div>

          <div className="flex gap-10 text-white/40 text-[10px] font-bold uppercase tracking-widest">
            <div className="flex flex-col gap-1"><span className="text-brand">Precision</span><span>99.9% Detection</span></div>
            <div className="flex flex-col gap-1"><span className="text-brand">Response</span><span>&lt; 0.1s Real-time</span></div>
          </div>
        </div>
      </div>

      {/* 우측: 로그인 폼 (40%) */}
      <div className="w-full lg:w-[40%] h-full bg-white dark:bg-dark flex flex-col p-10 lg:p-16 justify-center relative z-30 transition-colors">
        <form className="max-w-md w-full mx-auto" onSubmit={submit} noValidate>
          <header className="mb-10">
            <h2 className="text-4xl font-black text-dark dark:text-white tracking-tighter mb-2.5">LOGIN</h2>
            <p className="text-slate-400 dark:text-white/40 font-bold text-sm tracking-tight">지능형 안전관리 시스템 접속</p>
          </header>

          <div className="space-y-8">
            <label className="block space-y-1.5 group">
              <span className="text-[10px] font-black text-slate-300 dark:text-white/30 uppercase tracking-[0.2em] group-focus-within:text-brand transition-colors flex items-center gap-1.5">
                <UserRound size={12}/> 아이디
              </span>
              <input autoComplete="username" value={form.username}
                onChange={(e) => { setForm({ ...form, username: e.target.value }); clearFieldError("username"); }}
                placeholder="아이디를 입력하세요"
                aria-invalid={!!fieldErrors.username}
                className={`w-full py-3 text-lg font-bold text-dark dark:text-white outline-none placeholder:text-slate-200 dark:placeholder:text-white/20 bg-transparent border-b-2 transition-all duration-300 focus:pl-2 ${
                  fieldErrors.username ? "border-danger focus:border-danger" : "border-slate-200 dark:border-white/15 focus:border-brand"}`}/>
              {fieldErrors.username && <p className="flex items-center gap-1.5 text-[12px] font-bold text-danger pt-0.5">
                <AlertCircle size={13}/> {fieldErrors.username}
              </p>}
            </label>

            <label className="block space-y-1.5 group">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-slate-300 dark:text-white/30 uppercase tracking-[0.2em] group-focus-within:text-brand transition-colors flex items-center gap-1.5">
                  <LockKeyhole size={12}/> 비밀번호
                </span>
              </div>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); clearFieldError("password"); }}
                  placeholder="••••••••"
                  aria-invalid={!!fieldErrors.password}
                  className={`w-full py-3 pr-9 text-lg font-bold text-dark dark:text-white outline-none placeholder:text-slate-200 dark:placeholder:text-white/20 bg-transparent border-b-2 transition-all duration-300 focus:pl-2 ${
                    fieldErrors.password ? "border-danger focus:border-danger" : "border-slate-200 dark:border-white/15 focus:border-brand"}`}/>
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 bottom-3 text-slate-300 dark:text-white/30 hover:text-brand transition-colors">
                  {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {fieldErrors.password && <p className="flex items-center gap-1.5 text-[12px] font-bold text-danger pt-0.5">
                <AlertCircle size={13}/> {fieldErrors.password}
              </p>}
            </label>

            <div className="pt-4">
              <button type="submit" disabled={submitting}
                className="w-full bg-brand hover:bg-black disabled:opacity-60 text-white font-black py-4 rounded-full text-base shadow-2xl shadow-brand/20 transition-all duration-500 hover:-translate-y-1 active:scale-95">
                {submitting ? "접속 중..." : "ENTER SYSTEM"}
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-white/40">
              <ShieldCheck size={13} className="text-brand"/> Spring Security · 역할 기반 접근 제어(RBAC)
            </div>
          </div>

          <footer className="mt-12 flex flex-col gap-6">
            <div className="h-px w-full bg-slate-100 dark:bg-white/10"/>
            <div className="flex justify-between items-center">
              <p className="text-xs font-bold text-slate-400 dark:text-white/40">계정이 없으신가요?</p>
              <button type="button" onClick={onRegister}
                className="group flex items-center gap-2 text-dark dark:text-white font-black text-xs uppercase tracking-widest hover:text-brand transition-colors">
                Request Access <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform"/>
              </button>
            </div>
          </footer>
        </form>
      </div>

      {/* 로그인 실패 모달 */}
      {loginError && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setLoginError("")}>
        <div className="modal-pop w-full max-w-sm bg-white dark:bg-dark border border-slate-100 dark:border-white/10 rounded-2xl shadow-2xl p-7"
          onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-black text-dark dark:text-white mb-2">로그인에 실패했습니다.</h3>
          <p className="text-sm font-medium text-slate-500 dark:text-white/50 mb-6">{loginError}</p>
          <button type="button" onClick={() => setLoginError("")}
            className="w-full bg-brand hover:bg-black text-white font-black py-3.5 rounded-full text-sm transition-colors">
            확인
          </button>
        </div>
      </div>}

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)}/>
    </div>
  </div>;
}

export default Login;