import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import "../pandit/pandit.css";
import { Seo } from "../lib/Seo";

/**
 * Two-step reset: prove identity with email + date of birth, then set a new
 * password using the short-lived token that step returns.
 *
 * The DOB is never re-sent in step 2. Once identity is established the weak
 * secret is out of the flow entirely and a high-entropy single-use token
 * carries the state change — otherwise step 1 would be decorative.
 */
export default function PanditForgotPassword() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function verifyIdentity(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null); setBusy(true);
    try {
      const res = await api.panditResetVerify(email.trim(), dob);
      setResetToken(res.resetToken);
      setStep(2);
    } catch (err) {
      // Identical message whether the email is unknown or the DOB is wrong —
      // the backend deliberately cannot tell us which, and neither can we.
      setError(err instanceof Error ? err.message : "Details verify nahi ho paayi.");
    } finally { setBusy(false); }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (newPassword !== confirmPassword) { setError("Dono passwords match nahi kar rahe."); return; }
    setBusy(true);
    try {
      await api.panditResetPassword(resetToken, newPassword, confirmPassword);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset nahi ho paya.");
    } finally { setBusy(false); }
  }

  return (
    <div className="pandit-auth">
      <Seo title="Reset Password" path="/pandit-forgot-password" noindex />
      <div className="pandit-auth__card">
        <div className="pandit-auth__brand" aria-hidden="true">🔑</div>
        <h1 className="pandit-auth__title">Password Reset</h1>

        {step === 1 && (
          <>
            <p className="pandit-auth__sub">
              Apna registered email aur date of birth daalein. Dono match hone par hi aage badh payenge.
            </p>
            <form onSubmit={verifyIdentity} noValidate>
              {error && <div className="pandit-alert pandit-alert--error" role="alert">{error}</div>}
              <label className="pandit-field">
                <span className="pandit-field__label">Email / Gmail</span>
                <input type="email" inputMode="email" required className="pandit-input"
                  value={email} onChange={(e) => setEmail(e.target.value)} placeholder="panditji@gmail.com" />
              </label>
              <label className="pandit-field">
                <span className="pandit-field__label">Date of Birth</span>
                <input type="date" required className="pandit-input" max={new Date().toISOString().slice(0, 10)}
                  value={dob} onChange={(e) => setDob(e.target.value)} />
              </label>
              <button type="submit" className="pandit-btn pandit-btn--primary pandit-btn--block" disabled={busy}>
                {busy ? "Verify ho raha hai…" : "Verify karein"}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <p className="pandit-auth__sub">Naya password set karein. Yeh link 10 minute mein expire ho jaayega.</p>
            <form onSubmit={submitPassword} noValidate>
              {error && <div className="pandit-alert pandit-alert--error" role="alert">{error}</div>}
              <label className="pandit-field">
                <span className="pandit-field__label">New Password</span>
                <input type="password" required minLength={8} autoComplete="new-password" className="pandit-input"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label className="pandit-field">
                <span className="pandit-field__label">Confirm New Password</span>
                <input type="password" required minLength={8} autoComplete="new-password" className="pandit-input"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
              <p className="pandit-hint">Kam se kam 8 characters, ek letter aur ek number zaroori hai.</p>
              <button type="submit" className="pandit-btn pandit-btn--primary pandit-btn--block" disabled={busy}>
                {busy ? "Save ho raha hai…" : "Password badlein"}
              </button>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <div className="pandit-alert pandit-alert--success" role="status">
              Password badal gaya hai. Suraksha ke liye aapke saare purane sessions logout kar diye gaye hain.
            </div>
            <button className="pandit-btn pandit-btn--primary pandit-btn--block"
              onClick={() => navigate("/pandit-login")}>
              Ab login karein
            </button>
          </>
        )}

        <div className="pandit-auth__links">
          <Link to="/pandit-login">Login par wapas</Link>
          <Link to="/contact">Contact Support</Link>
        </div>
      </div>
    </div>
  );
}
