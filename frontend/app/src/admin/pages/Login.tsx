import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, setToken, AdminApiError, ADMIN_BASE } from "../lib/adminApi";
import { useAdminAuth } from "../lib/AdminAuth";
import { Icon } from "../../lib/icons";

type Step = "credentials" | "totp";

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAdminAuth();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCredentials(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await adminApi.login(email, password);
      setChallengeToken(res.challengeToken);
      setSetup(res.setup || null);
      setStep("totp");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await adminApi.verify(challengeToken, totpCode);
      setToken(res.token);
      await refresh();
      navigate(ADMIN_BASE, { replace: true });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <div className="admin-login__brand">
          <img src="/assets/img/logo.svg" alt="" />
          <span>Pandit<span className="gold-text">Connect</span></span>
        </div>
        <h1 className="admin-login__title">Admin sign in</h1>
        <p className="admin-login__sub">
          {step === "credentials"
            ? "Password + authenticator code required — no admin can sign in with a password alone."
            : setup
              ? "First login: set up your authenticator app, then enter the 6-digit code it shows."
              : "Enter the 6-digit code from your authenticator app."}
        </p>

        {error && <div className="admin-login__error">{error}</div>}

        {step === "credentials" ? (
          <form style={{ marginTop: 22 }} onSubmit={onCredentials}>
            <div className="field-group">
              <label className="label" htmlFor="alEmail">Email</label>
              <input className="input" id="alEmail" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field-group" style={{ marginTop: 14 }}>
              <label className="label" htmlFor="alPassword">Password</label>
              <input className="input" id="alPassword" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-gold btn-block" type="submit" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? "Checking…" : "Continue"} <Icon name="arrow-right" size={16} />
            </button>
          </form>
        ) : (
          <form style={{ marginTop: 22 }} onSubmit={onVerify}>
            {setup && (
              <div className="admin-login__setup">
                <strong>Add this account to your authenticator app</strong> (Google Authenticator, Authy, 1Password…) using
                "manual entry" / "setup key" — this secret is shown once:
                <code className="admin-login__secret">{setup.secret}</code>
                <p className="hint" style={{ marginTop: 8 }}>Account name: {email} · Issuer: PanditSuggest · Type: Time-based, 6 digits, 30s</p>
              </div>
            )}
            <div className="field-group" style={{ marginTop: 16 }}>
              <label className="label" htmlFor="alTotp">Authenticator code</label>
              <input
                className="input"
                id="alTotp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="123456"
                style={{ letterSpacing: "0.3em", fontSize: "1.15rem", textAlign: "center" }}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <button className="btn btn-gold btn-block" type="submit" disabled={busy || totpCode.length !== 6} style={{ marginTop: 20 }}>
              {busy ? "Verifying…" : "Verify & sign in"} <Icon name="shield-check" size={16} />
            </button>
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => { setStep("credentials"); setError(""); }}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
