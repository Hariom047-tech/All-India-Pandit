import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Icon } from "../lib/icons";
import { api } from "../lib/api";
import { useAuth } from "../lib/Auth";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../lib/i18n";
import { GoogleLogin } from "@react-oauth/google";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { t } = useLang();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const res = await api.post<{ token: string; user: any }>("/auth/login", { email, password });
        login(res.token, res.user);
        toast("Welcome back!");
        navigate(from, { replace: true });
      } else {
        const res = await api.post<{ token: string; user: any }>("/auth/register", {
          email,
          password,
          fullName,
          phone,
          role: "devotee"
        });
        login(res.token, res.user);
        toast("Account created successfully!");
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ token: string; user: any }>("/auth/google", { 
        credential: credentialResponse.credential 
      });
      login(res.token, res.user);
      toast("Welcome! Successfully logged in with Google.");
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Google Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google Sign-In was cancelled or failed");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Left side: Beautiful Pandit Graphic */}
      <div style={{ 
        flex: 1, 
      }} className="login-graphic">
        <div style={{ 
          width: "100%", 
          height: "100%", 
          backgroundImage: "url(/assets/img/login-graphic.jpg)", 
          backgroundSize: "cover", 
          backgroundPosition: "center" 
        }} />
        <style>{`
          @media (max-width: 900px) {
            .login-graphic { display: none !important; }
          }
        `}</style>
      </div>

      {/* Right side: Login Form */}
      <section style={{ 
        flex: 1, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        padding: "40px 20px",
        background: "var(--cream)"
      }}>
        <div className="card card-pad" style={{ width: "100%", maxWidth: 480, background: "white", boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: "2rem", fontFamily: "var(--font-head)" }}>
            {isLogin ? t("login.welcomeBack") : t("login.createAccount")}
          </h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {isLogin ? t("login.logInSub") : t("login.signUpSub")}
          </p>
        </div>

        <div className="row-between" style={{ marginBottom: 24, background: "var(--cream)", padding: 4, borderRadius: 8 }}>
          <button
            className={`btn btn-block ${isLogin ? "btn-gold" : "btn-ghost"}`}
            style={{ borderRadius: 6 }}
            onClick={() => setIsLogin(true)}
          >
            {t("login.logIn")}
          </button>
          <button
            className={`btn btn-block ${!isLogin ? "btn-gold" : "btn-ghost"}`}
            style={{ borderRadius: 6, margin: 0 }}
            onClick={() => setIsLogin(false)}
          >
            {t("login.signUp")}
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#991b1b", borderRadius: 8, marginBottom: 20, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="info" size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label className="label">{t("login.fullName")}</label>
                <input
                  type="text"
                  className="input"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Rahul Sharma"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="label">{t("login.phoneNumber")}</label>
                <input 
                  type="tel" 
                  className="input" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: 16 }}>
            <label className="label">{t("login.emailAddress")}</label>
            <input 
              type="email" 
              className="input" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rahul@example.com"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <div className="row-between">
              <label className="label">{t("login.password")}</label>
              {isLogin && <a href="#" onClick={(e) => { e.preventDefault(); toast(t("login.passwordResetSoon")); }} style={{ fontSize: "0.85rem", color: "var(--gold-deep)" }}>{t("login.forgot")}</a>}
            </div>
            <input 
              type="password" 
              className="input" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-gold btn-block" 
            disabled={loading}
            style={{ height: 48, fontSize: "1.05rem" }}
          >
            {loading ? t("login.pleaseWait") : (isLogin ? t("login.logIn") : t("login.createAccount"))}
          </button>
        </form>

        <div style={{ position: "relative", margin: "24px 0", textAlign: "center" }}>
          <hr style={{ borderColor: "rgba(0,0,0,0.06)", margin: 0 }} />
          <span style={{ 
            position: "absolute", 
            top: "50%", left: "50%", 
            transform: "translate(-50%, -50%)", 
            background: "white", 
            padding: "0 12px",
            fontSize: "0.85rem",
            color: "#888"
          }}>
            {t("login.orContinueWith")}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            useOneTap
            shape="rectangular"
            theme="outline"
            size="large"
            width="100%"
          />
        </div>
      </div>
      </section>
    </div>
  );
}
