import { useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../lib/adminApi";
import { Icon } from "../../lib/icons";

interface Settings {
  enabled: boolean;
  windowDays: number;
  strength: number;
  maxShareMultiplier: number;
  dailyLimit: number;
  sessionResetTime: string;
}
interface PanditRow {
  slug: string;
  name: string;
  tier: string;
  totalProfileViews: number;
  rankScore: number;
  leads: number;
  todayLeads: number;
  dailyCapReached: boolean;
  tierSize: number;
  expectedShare: number;
  actualShare: number;
  fairnessDelta: number;
  boost: number;
  overCap: boolean;
  displayScore: number;
}
interface TierGroup { tier: string; pandits: PanditRow[]; totalLeads: number; underServedCount: number; overServedCount: number; }
interface Overview { settings: Settings; totalPandits: number; totalLeadsInWindow: number; tiers: TierGroup[]; }

const TIER_ORDER = ["diamond", "gold", "silver", "free"];

export default function LeadDistribution() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const o = await adminApi.get<Overview>("/leads/overview");
      setOverview(o);
      setForm(o.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead distribution data");
    }
  }
  useEffect(() => { load(); }, []);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await adminApi.put("/leads/settings", form);
      setNotice("Saved — the public site's ordering updates on its next fetch, no redeploy needed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!overview || !form) {
    return error ? <div className="admin-login__error">{error}</div> : <p className="muted">Loading…</p>;
  }

  const sortedTiers = [...overview.tiers].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Lead Distribution Engine</h2>
          <p>Keeps same-tier pandits from a permanent winner-takes-all order — whoever's under their fair share of recent leads floats up; whoever's over it eases down. Only rebalances within a tier, so a paid plan still means better visibility.</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}
      {notice && <div className="admin-login__setup" style={{ marginBottom: 18 }}>{notice}</div>}

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Engine status</div>
          <div className="admin-stat-card__value" style={{ color: overview.settings.enabled ? "var(--success)" : "var(--text-2)" }}>
            {overview.settings.enabled ? "Active" : "Off"}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Pandits in rotation</div>
          <div className="admin-stat-card__value">{overview.totalPandits}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Leads in window</div>
          <div className="admin-stat-card__value">{overview.totalLeadsInWindow}</div>
        </div>
        <div className="admin-stat-card admin-stat-card--warn">
          <div className="admin-stat-card__label">Under-served right now</div>
          <div className="admin-stat-card__value">{overview.tiers.reduce((s, t) => s + t.underServedCount, 0)}</div>
        </div>
      </div>

      <div className="grid g-2" style={{ gap: 18, alignItems: "start" }}>
        <form className="admin-panel" onSubmit={onSave}>
          <div className="admin-panel__head"><h2>Settings</h2></div>
          <div className="admin-panel__body">
            <label className="row" style={{ gap: 10, marginBottom: 18 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <span><strong>Enable fair rotation</strong><br /><span className="hint">Off = pure rating-based order, same as before this feature existed.</span></span>
            </label>

            <div className="admin-field">
              <label>Rolling window (days) <span className="hint">— how far back "recent leads" looks</span></label>
              <input className="input" type="number" min={1} max={180} value={form.windowDays} onChange={(e) => setForm({ ...form, windowDays: Number(e.target.value) })} />
            </div>

            <div className="admin-field" style={{ marginTop: 14 }}>
              <label>Fairness strength — {Math.round(form.strength * 100)}% <span className="hint">— how hard under/over-served pandits get nudged</span></label>
              <input type="range" min={0} max={1} step={0.05} value={form.strength} onChange={(e) => setForm({ ...form, strength: Number(e.target.value) })} style={{ width: "100%" }} />
            </div>

            <div className="admin-field" style={{ marginTop: 14 }}>
              <label>Lead cap multiplier <span className="hint">— extra penalty once a pandit passes this × their fair share</span></label>
              <input className="input" type="number" min={1} step={0.5} value={form.maxShareMultiplier} onChange={(e) => setForm({ ...form, maxShareMultiplier: Number(e.target.value) })} />
            </div>

            <div className="admin-field" style={{ marginTop: 14 }}>
              <label>Daily Lead Limit <span className="hint">— max leads (clicks+inquiries) per day before profile sinks</span></label>
              <input className="input" type="number" min={1} value={form.dailyLimit || 5} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
            </div>

            <div className="admin-field" style={{ marginTop: 14 }}>
              <label>Session Reset Time <span className="hint">— when daily limit resets (HH:mm)</span></label>
              <input className="input" type="time" value={form.sessionResetTime || '00:00'} onChange={(e) => setForm({ ...form, sessionResetTime: e.target.value })} />
            </div>

            <button className="btn btn-gold" type="submit" disabled={saving} style={{ marginTop: 20 }}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>

        <div className="admin-panel">
          <div className="admin-panel__head"><h2>How it works</h2></div>
          <div className="admin-panel__body">
            <ol className="dot-list" style={{ paddingLeft: 4 }}>
              <li>Every pandit's leads (enquiries) over the window are counted, grouped by subscription tier.</li>
              <li>Each pandit's <em>fair share</em> is 1 ÷ (pandits in their tier); their <em>actual share</em> is their leads ÷ total tier leads.</li>
              <li>The gap between fair and actual share nudges their public ranking up or down — under-served rises, over-served eases back.</li>
              <li>A pandit taking far more than their fair share (past the cap multiplier) gets an additional penalty.</li>
              <li>This sits on top of the existing quality score (rating, reviews, verification) — it doesn't replace it.</li>
            </ol>
          </div>
        </div>
      </div>

      {sortedTiers.map((t) => (
        <div className="admin-panel" style={{ marginTop: 18 }} key={t.tier}>
          <div className="admin-panel__head">
            <h2 style={{ textTransform: "capitalize" }}>{t.tier} tier <span className="hint">({t.pandits.length} pandits · {t.totalLeads} leads)</span></h2>
            <span className="row" style={{ gap: 8 }}>
              {t.underServedCount > 0 && <span className="admin-pill admin-pill--blue">{t.underServedCount} under-served</span>}
              {t.overServedCount > 0 && <span className="admin-pill admin-pill--red">{t.overServedCount} at cap</span>}
            </span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Rank</th><th>Pandit</th><th>Profile Views</th><th>Today's Leads</th><th>Window Leads</th><th>Actual vs Fair share</th><th>Score Adj.</th><th>Final score</th></tr></thead>
              <tbody>
                {t.pandits.map((p, i) => (
                  <tr key={p.slug}>
                    <td className="muted-cell">#{i + 1}</td>
                    <td>
                      <strong>{p.name}</strong>
                      {p.dailyCapReached && <div className="hint" style={{ color: "var(--danger)", marginTop: 4 }}><Icon name="alert-circle" size={12} /> Limit Reached (Pushed Down)</div>}
                    </td>
                    <td>{p.totalProfileViews}</td>
                    <td><strong>{p.todayLeads}</strong> <span className="hint">/ {overview.settings.dailyLimit || 5}</span></td>
                    <td>{p.leads}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ width: 60, height: 7, borderRadius: 4, background: "var(--cream-deep)", overflow: "hidden", display: "inline-block" }}>
                          <span style={{ display: "block", height: "100%", width: `${Math.min(100, p.actualShare * 100)}%`, background: p.overCap ? "var(--danger)" : "var(--gold-grad)" }} />
                        </span>
                        <span className="muted-cell" title={`Actual: ${(p.actualShare * 100).toFixed(0)}% | Fair: ${(p.expectedShare * 100).toFixed(0)}%`}>
                          {(p.actualShare * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`admin-pill ${p.boost > 0.5 ? "admin-pill--blue" : p.boost < -0.5 ? "admin-pill--red" : "admin-pill--gray"}`}>
                        {p.boost > 0 ? "+" : ""}{p.boost.toFixed(1)}
                      </span>
                      {p.overCap && <span className="hint" style={{ marginLeft: 6 }}><Icon name="alert-circle" size={12} /> over cap</span>}
                    </td>
                    <td><strong>{p.displayScore.toFixed(1)}</strong> <span className="hint">(was {p.rankScore.toFixed(1)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
