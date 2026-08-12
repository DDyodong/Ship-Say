import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { apiRequest } from "./api/client";
import Dashboard from "./components/layout/Dashboard";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import WorkerApp from "./pages/worker/WorkerApp";
import FactoryDetailTwin from "./pages/admin/FactoryDetailTwin";

function App() {
  const previewTwinCode = new URLSearchParams(window.location.search).get("previewTwin");
  if (import.meta.env.DEV && previewTwinCode) {
    return <FactoryDetailTwin facilityCode={previewTwinCode} onBack={() => {}} notify={() => {}}/>;
  }
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("dashboard-theme") || "dark");
  const [session, setSession] = useState(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem("safety-session"));
      const roles = (stored?.roles || []).map(role => String(role).toUpperCase());
      const role = roles.includes("ADMIN") ? "admin" : roles.includes("WORKER") ? "worker" : null;
      if (stored?.token && role) return { ...stored, roles, role };
      sessionStorage.removeItem("safety-session");
      return null;
    } catch { return null; }
  });
  const [registeredUsername, setRegisteredUsername] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => {
    localStorage.setItem("dashboard-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f7f9fb" : "#07111b");
  }, [theme]);
  const toggleTheme = () => setTheme(current => current === "dark" ? "light" : "dark");
  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(window.__toast);
    window.__toast = window.setTimeout(() => setToast(""), 2600);
  }, []);
  const login = (nextSession) => {
    sessionStorage.setItem("safety-session", JSON.stringify(nextSession));
    setSession(nextSession);
    navigate(nextSession.role === "admin" ? "/admin/dashboard" : "/worker/app", { replace: true });
  };
  const logout = async () => {
    try { await apiRequest("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${session.token}` } }); } catch { /* local logout still proceeds */ }
    sessionStorage.removeItem("safety-session");
    setSession(null);
    navigate("/login", { replace: true });
  };
  const registered = (username) => { setRegisteredUsername(username); navigate("/login", { replace: true }); notify("회원가입이 완료되었습니다. 로그인해 주세요."); };
  const homePath = session ? (session.role === "admin" ? "/admin/dashboard" : "/worker/app") : "/login";
  const canUseWorker = session && session.roles?.includes("WORKER");
  const canUseAdmin = session && session.roles?.includes("ADMIN");
  return <><Routes>
    <Route path="/login" element={session ? <Navigate to={homePath} replace/> : <Login initialUsername={registeredUsername} onRegister={() => navigate("/register")} onLogin={login} notify={notify} theme={theme} onToggleTheme={toggleTheme} />}/>
    <Route path="/register" element={session ? <Navigate to={homePath} replace/> : <Register onBack={() => navigate("/login")} onRegistered={registered} notify={notify} theme={theme} onToggleTheme={toggleTheme} />}/>
    <Route path="/worker/*" element={canUseWorker ? <WorkerApp session={session} onLogout={logout} notify={notify}/> : <Navigate to={homePath} replace/>}/>
    <Route path="/admin/:page" element={canUseAdmin ? <Dashboard session={session} onLogout={logout} notify={notify} theme={theme} onToggleTheme={toggleTheme}/> : <Navigate to={homePath} replace/>}/>
    <Route path="*" element={<Navigate to={homePath} replace/>}/>
  </Routes>
    {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </>;
}

export default App;
