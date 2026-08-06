import { useEffect, useState, type FormEvent } from "react";
import { adminApi, ADMIN_BASE, type Paged } from "../lib/adminApi";
import { useAdminAuth } from "../lib/AdminAuth";

interface AuditRow { id: string; event_type: string; severity: string; details: Record<string, unknown> | null; ip: string | null; created_at: string; }
interface BannedIp { ip: string; reason: string | null; banned_at: string; expires_at: string | null; }
interface Session { session_id: string; email: string; full_name: string; session_ip: string | null; created_at: string; last_active_at: string; }

export default function AdminSecurity() {
  const { user } = useAdminAuth();
  const [tab, setTab] = useState<"audit" | "bans" | "sessions">("audit");
  const [audit, setAudit] = useState<Paged<AuditRow> | null>(null);
  const [bans, setBans] = useState<BannedIp[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.get<Paged<AuditRow>>("/security/audit-log?perPage=50").then(setAudit).catch(() => {});
    adminApi.get<BannedIp[]>("/security/banned-ips").then(setBans).catch(() => {});
    adminApi.get<Session[]>("/security/active-sessions").then(setSessions).catch(() => {});
  }, []);

  async function onBan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await adminApi.post("/security/ban-ip", { ip: data.get("ip"), reason: data.get("reason"), durationHours: Number(data.get("durationHours")) || undefined });
      e.currentTarget.reset();
      setBans(await adminApi.get<BannedIp[]>("/security/banned-ips"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ban IP");
    }
  }

  async function unban(ip: string) {
    await adminApi.del(`/security/ban-ip/${encodeURIComponent(ip)}`);
    setBans(await adminApi.get<BannedIp[]>("/security/banned-ips"));
  }

  async function forceLogoutAll() {
    if (!confirm("Force-logout every admin session, including your own? You will need to sign in again.")) return;
    await adminApi.post("/security/force-logout-all", {});
    window.location.href = `${ADMIN_BASE}/login`;
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Security</h2>
          <p>Audit trail, banned IPs and active admin sessions. IP bans never lock out the admin panel itself (see docs/ADMIN.md).</p>
        </div>
        {user?.role === "super_admin" && (
          <button className="btn btn-outline btn-sm" onClick={forceLogoutAll}>Force logout all admins</button>
        )}
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="svc-cat-bar pill-nav" style={{ marginBottom: 18 }}>
        <button className={`pill${tab === "audit" ? " is-active" : ""}`} onClick={() => setTab("audit")}>Audit log</button>
        <button className={`pill${tab === "bans" ? " is-active" : ""}`} onClick={() => setTab("bans")}>Banned IPs</button>
        <button className={`pill${tab === "sessions" ? " is-active" : ""}`} onClick={() => setTab("sessions")}>Active sessions</button>
      </div>

      {tab === "audit" && (
        <div className="admin-panel">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Event</th><th>Severity</th><th>IP</th><th>When</th></tr></thead>
              <tbody>
                {(audit?.data || []).map((a) => (
                  <tr key={a.id}>
                    <td>{a.event_type}</td>
                    <td><span className={`admin-pill ${a.severity === "high" ? "admin-pill--red" : a.severity === "medium" ? "admin-pill--gold" : "admin-pill--gray"}`}>{a.severity}</span></td>
                    <td className="muted-cell">{a.ip || "—"}</td>
                    <td className="muted-cell">{new Date(a.created_at).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!audit?.data.length && <div className="admin-empty">No security events logged yet.</div>}
          </div>
        </div>
      )}

      {tab === "bans" && (
        <div className="admin-panel">
          <div className="admin-panel__body">
            <form className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 18 }} onSubmit={onBan}>
              <input className="input" name="ip" placeholder="IP address" required style={{ maxWidth: 200 }} />
              <input className="input" name="reason" placeholder="Reason" style={{ maxWidth: 240 }} />
              <input className="input" name="durationHours" type="number" placeholder="Hours (blank = permanent)" style={{ maxWidth: 200 }} />
              <button className="btn btn-gold btn-sm" type="submit">Ban IP</button>
            </form>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>IP</th><th>Reason</th><th>Banned at</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {bans.map((b) => (
                  <tr key={b.ip}>
                    <td><code>{b.ip}</code></td>
                    <td className="muted-cell">{b.reason || "—"}</td>
                    <td className="muted-cell">{new Date(b.banned_at).toLocaleDateString("en-IN")}</td>
                    <td className="muted-cell">{b.expires_at ? new Date(b.expires_at).toLocaleDateString("en-IN") : "Never"}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => unban(b.ip)}>Unban</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!bans.length && <div className="admin-empty">No banned IPs.</div>}
          </div>
        </div>
      )}

      {tab === "sessions" && (
        <div className="admin-panel">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Admin</th><th>IP</th><th>Started</th><th>Last active</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session_id}>
                    <td>{s.full_name} <span className="muted-cell">({s.email})</span></td>
                    <td className="muted-cell">{s.session_ip || "—"}</td>
                    <td className="muted-cell">{new Date(s.created_at).toLocaleString("en-IN")}</td>
                    <td className="muted-cell">{new Date(s.last_active_at).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sessions.length && <div className="admin-empty">No active sessions.</div>}
          </div>
        </div>
      )}
    </>
  );
}
