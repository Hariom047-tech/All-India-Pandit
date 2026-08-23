import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";

interface SubscriptionRow {
  id: string;
  pandit_slug: string;
  pandit_name: string;
  plan: string;
  billing_cycle: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
}

const TIER_PILL: Record<string, string> = {
  Free: "admin-pill--gray", Silver: "admin-pill--blue", Gold: "admin-pill--gold", Diamond: "admin-pill--gold",
};

function daysRemaining(expiresAt: string) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Consumes GET /admin/subscriptions — already fully built on the backend
 * (admin/subscriptions.controller.js), never previously wired to any
 * frontend page. Same table/filter/pager conventions as Pandits.tsx.
 */
export default function AdminSubscriptions() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<SubscriptionRow> | null>(null);
  const [error, setError] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm, setGrantForm] = useState({ panditSlug: "", tier: "silver", durationDays: "30", reason: "" });
  const [granting, setGranting] = useState(false);

  const tier = params.get("tier") || "";
  const activeOnly = params.get("activeOnly") || "";
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      const res = await adminApi.get<Paged<SubscriptionRow>>(`/subscriptions${qs({ tier, activeOnly, page, perPage: 25 })}`);
      setRows(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  async function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true); setError("");
    try {
      await adminApi.post("/subscriptions/grant", {
        panditSlug: grantForm.panditSlug.trim(),
        tier: grantForm.tier,
        durationDays: Number(grantForm.durationDays) || 30,
        reason: grantForm.reason.trim(),
      });
      setGrantOpen(false);
      setGrantForm({ panditSlug: "", tier: "silver", durationDays: "30", reason: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setGranting(false);
    }
  }

  return (
    <>
      <div className="admin-page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Active Subscriptions</h2>
          <p>Every pandit_subscriptions row — real purchases, renewals, and manual grants.</p>
        </div>
        <button className="btn btn-gold" style={{ whiteSpace: "nowrap" }} onClick={() => setGrantOpen((v) => !v)}>
          {grantOpen ? "Cancel" : "+ Manual Grant"}
        </button>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      {grantOpen && (
        <div className="admin-panel" style={{ marginBottom: 18 }}>
          <div className="admin-panel__head"><h2>Grant a plan manually</h2></div>
          <form className="admin-panel__body admin-form-grid" onSubmit={submitGrant}>
            <label className="admin-field">
              <span>Pandit slug</span>
              <input className="input" required value={grantForm.panditSlug}
                onChange={(e) => setGrantForm((f) => ({ ...f, panditSlug: e.target.value }))} placeholder="ramesh-sharma" />
            </label>
            <label className="admin-field">
              <span>Tier</span>
              <select className="select" value={grantForm.tier} onChange={(e) => setGrantForm((f) => ({ ...f, tier: e.target.value }))}>
                <option value="free">Free</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
                <option value="diamond">Diamond</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Duration (days)</span>
              <input className="input" type="number" min={1} value={grantForm.durationDays}
                onChange={(e) => setGrantForm((f) => ({ ...f, durationDays: e.target.value }))} />
            </label>
            <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
              <span>Reason (required for the audit log)</span>
              <input className="input" required value={grantForm.reason}
                onChange={(e) => setGrantForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Complimentary 30-day Diamond extension approved by support" />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn btn-gold" type="submit" disabled={granting}>{granting ? "Granting…" : "Grant plan"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => e.preventDefault()}>
          <select className="select" value={tier} onChange={(e) => updateParam("tier", e.target.value)}>
            <option value="">All tiers</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="diamond">Diamond</option>
          </select>
          <select className="select" value={activeOnly} onChange={(e) => updateParam("activeOnly", e.target.value)}>
            <option value="">Active + inactive</option>
            <option value="true">Active only</option>
          </select>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} subscriptions</span>}
        </form>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pandit</th><th>Plan</th><th>Billing</th><th>Started</th><th>Expires</th><th>Days Left</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.data.map((s) => {
                  const remaining = daysRemaining(s.expires_at);
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.pandit_name}</strong><div className="muted-cell">{s.pandit_slug}</div></td>
                      <td><span className={`admin-pill ${TIER_PILL[s.plan] || "admin-pill--gray"}`}>{s.plan}</span></td>
                      <td className="muted-cell" style={{ textTransform: "capitalize" }}>{s.billing_cycle}</td>
                      <td className="muted-cell">{formatDate(s.starts_at)}</td>
                      <td className="muted-cell">{formatDate(s.expires_at)}</td>
                      <td>
                        {s.is_active
                          ? <span className={remaining <= 5 ? "admin-pill admin-pill--red" : "muted-cell"}>{remaining >= 0 ? `${remaining}d` : "expired"}</span>
                          : <span className="muted-cell">—</span>}
                      </td>
                      <td>
                        <span className={`admin-pill ${s.is_active && remaining > 0 ? "admin-pill--green" : "admin-pill--gray"}`}>
                          {s.is_active ? (remaining > 0 ? "Active" : "Expired") : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No subscriptions matched.</div>
          )}
        </div>

        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}>
            <Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} />
          </div>
        )}
      </div>
    </>
  );
}
