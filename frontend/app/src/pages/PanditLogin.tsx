import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/Auth";
import "../pandit/pandit.css";
import { Seo } from "../lib/Seo";

/**
 * Dedicated pandit door. Separate from the devotee login on purpose: the
 * audience, the copy and the recovery path (email + date of birth, not an
 * emailed link) are all different, and mixing them produced a form that
 * served neither well.
 *
 * The backend still uses one users/user_sessions store underneath — this is
 * a role-scoped entrance, not a second identity system.
 */
export default function PanditLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.panditLogin(email.trim(), password);
      login(res.token, {
        id: res.user.id,
        email: res.user.email,
        full_name: res.user.fullName,
        role: "pandit",
        phone: null,
        status: res.user.status as never,
        phone_verified: res.user.phoneVerified,
      });
      navigate("/pandit/dashboard", { replace: true });
    } catch (err) {
      // Whatever the backend says, verbatim — it is already written to be
      // non-enumerating ("Login nahi ho paya. Apni details check karein.").
      setError(err instanceof Error ? err.message : "Login nahi ho paya. Apni details check karein.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pandit-auth">
      <Seo title="Pandit Login" path="/pandit-login" noindex />
      <div className="pandit-auth__card">
        <div className="pandit-auth__brand" aria-hidden="true">🙏</div>
        <h1 className="pandit-auth__title">Pandit Ji Login</h1>
        <p className="pandit-auth__sub">Apne PanditSuggest dashboard ko access karein</p>

        <form onSubmit={onSubmit} noValidate>
          {error && <div className="pandit-alert pandit-alert--error" role="alert">{error}</div>}

          <label className="pandit-field">
            <span className="pandit-field__label">Email / Gmail</span>
            <input
              type="email" inputMode="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="panditji@gmail.com" className="pandit-input"
            />
          </label>

          <label className="pandit-field">
            <span className="pandit-field__label">Password</span>
            <div className="pandit-input-group">
              <input
                type={showPassword ? "text" : "password"} autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Apna password" className="pandit-input"
              />
              <button
                type="button" className="pandit-input-group__btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Password chhupayein" : "Password dikhayein"}
              >{showPassword ? "Hide" : "Show"}</button>
            </div>
          </label>

          <button type="submit" className="pandit-btn pandit-btn--primary pandit-btn--block" disabled={busy}>
            {busy ? "Login ho raha hai…" : "Login"}
          </button>
        </form>

        <div className="pandit-auth__links">
          <Link to="/pandit-forgot-password">Forgot Password?</Link>
          <Link to="/contact">Contact Support</Link>
        </div>

        <p className="pandit-auth__foot">
          Devotee hain? <Link to="/login">Yahan login karein</Link>
        </p>
      </div>
    </div>
  );
}
