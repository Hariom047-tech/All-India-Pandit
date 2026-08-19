import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../lib/adminApi";
import { Icon } from "../../lib/icons";

/**
 * Distribution control panel (v2 engine).
 *
 * Design rule: NOTHING SAVES WITHOUT SHOWING ITS CONSEQUENCE.
 *
 * The plan ladder here inverted once already — ₹9,000 subscribers receiving
 * fewer leads than ₹5,000 ones — because percentages look perfectly reasonable
 * on a slider while the leads-per-seat arithmetic does not. So the cost-per-lead
 * cards sit at the TOP of the page, above every control, and re-compute on the
 * server as you edit.
 *
 * Every input stays editable in every mode. An earlier version disabled the
 * share fields while priority mode was on, which was wrong twice over: the
 * admin could not prepare weights before switching, and a greyed-out box reads
 * as "broken", not as "not used right now". Unused settings are LABELLED, never
 * locked.
 */

type Mode = 0 | 1;

interface ConfigKnob {
  key: string; value: number; label: string; description: string | null;
  min: number | null; max: number | null; step: number;
}
interface Entitlement {
  tier: string; market: string; weight: number; dailyCap: number;
  priority: number | null; seatCap: number | null; priceInr: number | null; isActive: boolean;
}
interface PlanProjection {
  tier: string; plan: string; priceInr: number | null; seatsHeld: number;
  seatCap: number | null; oversold: boolean; seatsRemaining: number | null;
  leadsPerSeat: number; rupeesPerLead: number | null; receivesNothing: boolean;
}
interface Warning { level: "error" | "warn"; code: string; message: string }
interface Projection { mode: string; plans: PlanProjection[]; warnings: Warning[] }
interface Volumes {
  values: { INDIA: number; INTERNATIONAL: number };
  source: "observed_30d" | "assumed";
  observed: { INDIA: number; INTERNATIONAL: number };
}
interface AuditRow { scope: string; target: string; from: string | null; to: string | null; by: string; at: string }
interface Overview {
  config: ConfigKnob[]; entitlements: Entitlement[]; seats: Record<string, number>;
  volumes: Volumes; projection: Projection; audit: AuditRow[];
}

const TIER_LABEL: Record<string, string> = {
  diamond: "International", gold: "Global Connect", silver: "Bharat", free: "Free",
};
const TIER_SUB: Record<string, string> = {
  diamond: "International leads only",
  gold: "India + International",
  silver: "India leads only",
  free: "Not a paid plan",
};
const TIER_ORDER = ["diamond", "gold", "silver", "free"];
const MARKET_LABEL: Record<string, string> = { INDIA: "India", INTERNATIONAL: "International" };

const rupees = (n: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

/** Knobs most admins will touch, versus the ones that need real understanding. */
const CORE_KNOBS = ["fairness_strength", "quality_weight", "window_days", "max_share_multiplier"];
const ADVANCED_KNOBS = [
  "lead_deficit_weight", "exposure_deficit_weight", "rotation_depth",
  "min_profile_completeness", "cold_start_days", "cold_start_boost",
  "cold_start_max_exposure", "rotation_noise", "page_size",
];

export default function Distribution() {
  const [data, setData] = useState<Overview | null>(null);
  const [config, setConfig] = useState<Record<string, number>>({});
  const [ents, setEnts] = useState<Entitlement[]>([]);
  const [volumes, setVolumes] = useState({ INDIA: 0, INTERNATIONAL: 0 });
  const [preview, setPreview] = useState<Projection | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [projecting, setProjecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.get<Overview>("/distribution");
      setData(res);
      setConfig(Object.fromEntries(res.config.map((c) => [c.key, Number(c.value)])));
      setEnts(res.entitlements);
      setVolumes(res.volumes.values);
      setPreview(res.projection);
      setDirty(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load distribution settings");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mode = (Number(config.pool_mode) === 1 ? 1 : 0) as Mode;

  /* Re-project on every edit, debounced. Server-side, because a projection that
     disagreed with the engine would be worse than showing none. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data || !dirty) return;
    if (timer.current) clearTimeout(timer.current);
    setProjecting(true);
    timer.current = setTimeout(() => {
      adminApi
        .post<{ projection: Projection }>("/distribution/preview", { entitlements: ents, mode, volumes })
        .then((r) => setPreview(r.projection))
        .catch(() => { /* keep the last good projection rather than blanking it */ })
        .finally(() => setProjecting(false));
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [ents, mode, volumes, data, dirty]);

  const setKnob = (key: string, value: number) => {
    setConfig((c) => ({ ...c, [key]: value })); setDirty(true); setNotice("");
  };
  const setEnt = (tier: string, market: string, patch: Partial<Entitlement>) => {
    setEnts((rows) => rows.map((r) => (r.tier === tier && r.market === market ? { ...r, ...patch } : r)));
    setDirty(true); setNotice("");
  };
  /** Price and seat cap belong to the PLAN, not to one of its markets. */
  const setPlan = (tier: string, patch: Partial<Entitlement>) => {
    setEnts((rows) => rows.map((r) => (r.tier === tier ? { ...r, ...patch } : r)));
    setDirty(true); setNotice("");
  };

  async function save() {
    if (!data) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updates: Record<string, number> = {};
      for (const c of data.config) if (config[c.key] !== Number(c.value)) updates[c.key] = config[c.key];
      if (Object.keys(updates).length) await adminApi.put("/distribution/config", { updates });

      const res = await adminApi.put<{ warnings: Warning[] }>("/distribution/entitlements", { entitlements: ents });
      setNotice(res.warnings?.length
        ? res.warnings.map((w) => w.message).join(" ")
        : "Saved. The public listing picks this up on its next request — no redeploy needed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  /** One editable card per PLAN, with its markets nested inside. */
  const plans = useMemo(() => {
    const byTier = new Map<string, Entitlement[]>();
    for (const e of ents) {
      if (!byTier.has(e.tier)) byTier.set(e.tier, []);
      byTier.get(e.tier)!.push(e);
    }
    return [...byTier.entries()]
      .sort((a, b) => TIER_ORDER.indexOf(a[0]) - TIER_ORDER.indexOf(b[0]))
      .map(([tier, rows]) => ({ tier, rows }));
  }, [ents]);

  const marketTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of ents) if (e.isActive) out[e.market] = (out[e.market] || 0) + Number(e.weight || 0);
    return out;
  }, [ents]);

  if (!data) {
    return error
      ? <div className="admin-login__error">{error}</div>
      : <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  }

  const knob = (key: string) => data.config.find((c) => c.key === key);
  const errs = preview?.warnings.filter((w) => w.level === "error") || [];
  const warns = preview?.warnings.filter((w) => w.level === "warn") || [];
  const projFor = (tier: string) => preview?.plans.find((p) => p.tier === tier);

  const renderKnob = (key: string) => {
    const k = knob(key);
    if (!k) return null;
    const v = config[key] ?? 0;
    const pct = k.min != null && k.max != null && k.max > k.min
      ? ((v - k.min) / (k.max - k.min)) * 100 : 0;
    return (
      <div className="dst-knob" key={key}>
        <div className="dst-knob__top">
          <span className="dst-knob__label">{k.label}</span>
          <span className="dst-knob__val">{v}</span>
        </div>
        <input
          type="range" min={k.min ?? 0} max={k.max ?? 1} step={k.step} value={v}
          style={{ ["--pct" as string]: `${pct}%` }}
          onChange={(e) => setKnob(key, Number(e.target.value))}
        />
        {k.description && <p className="dst-knob__hint">{k.description}</p>}
      </div>
    );
  };

  return (
    <div className="dst">
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Distribution Controls</h2>
          <p>Set how leads are shared between plans. Every change shows its cost-per-lead before you save.</p>
        </div>
        <button className="btn btn-gold" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 16 }}>{error}</div>}
      {notice && <div className="admin-login__setup" style={{ marginBottom: 16 }}>{notice}</div>}

      {/* ═══ 1. The consequence, first and biggest ═══════════════════════ */}
      <section className="dst-section">
        <header className="dst-section__head">
          <h3><Icon name="trending-up" /> What each plan actually gets</h3>
          <span className={`dst-chip ${projecting ? "is-busy" : ""}`}>
            {projecting ? "recalculating…" : mode === 1 ? "Priority mode" : "Weighted mode"}
          </span>
        </header>

        <div className="dst-cards">
          {plans.filter((p) => p.tier !== "free").map(({ tier, rows }) => {
            const pr = projFor(tier);
            const price = rows[0]?.priceInr ?? null;
            const cap = rows[0]?.seatCap ?? null;
            const held = pr?.seatsHeld ?? 0;
            const fillPct = cap ? Math.min(100, (held / cap) * 100) : 0;
            return (
              <article key={tier} className={`dst-card ${pr?.receivesNothing ? "is-danger" : ""}`}>
                <div className="dst-card__name">{TIER_LABEL[tier] || tier}</div>
                <div className="dst-card__price">{rupees(price)}<span>/year</span></div>

                <div className="dst-card__big">
                  {pr?.receivesNothing ? "No leads" : rupees(pr?.rupeesPerLead ?? null)}
                  {!pr?.receivesNothing && <span>per lead</span>}
                </div>

                <div className="dst-card__row">
                  <span>Leads per pandit</span>
                  <strong>{pr?.leadsPerSeat ?? 0}</strong>
                </div>

                <div className="dst-card__seats">
                  <div className="dst-card__row">
                    <span>Seats</span>
                    <strong>
                      {held}{cap != null && <span className="muted"> / {cap}</span>}
                    </strong>
                  </div>
                  {cap != null && (
                    <>
                      <div className="dst-bar"><i style={{ width: `${fillPct}%` }} className={pr?.oversold ? "is-over" : fillPct >= 100 ? "is-full" : ""} /></div>
                      <small className={pr?.oversold ? "is-warn" : "muted"}>
                        {pr?.oversold ? `${held - cap} over cap — still served`
                          : pr?.seatsRemaining === 0 ? "Sold out"
                            : `${pr?.seatsRemaining} seats left to sell`}
                      </small>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {errs.map((w, i) => <div key={`e${i}`} className="dst-alert is-error">{w.message}</div>)}
        {warns.map((w, i) => <div key={`w${i}`} className="dst-alert is-warn">{w.message}</div>)}
        {!errs.length && !warns.length && preview && (
          <div className="dst-alert is-ok">
            Ladder looks right — each dearer plan costs less per lead than the one below it.
          </div>
        )}

        <div className="dst-assume">
          <span>Projected over</span>
          <label>
            <input type="number" min={0} value={volumes.INDIA}
              onChange={(e) => { setVolumes((v) => ({ ...v, INDIA: Number(e.target.value) })); setDirty(true); }} />
            India leads / month
          </label>
          <label>
            <input type="number" min={0} value={volumes.INTERNATIONAL}
              onChange={(e) => { setVolumes((v) => ({ ...v, INTERNATIONAL: Number(e.target.value) })); setDirty(true); }} />
            International / month
          </label>
          <small className="muted">
            {data.volumes.source === "assumed"
              ? "Estimates — no lead history yet. Change them to model your own."
              : "Your real traffic over the last 30 days."}
          </small>
        </div>
      </section>

      {/* ═══ 2. Mode ════════════════════════════════════════════════════ */}
      <section className="dst-section">
        <header className="dst-section__head"><h3>Which pool serves a visitor</h3></header>
        <div className="dst-modes">
          <button type="button" className={`dst-mode ${mode === 0 ? "is-on" : ""}`} onClick={() => setKnob("pool_mode", 0)}>
            <span className="dst-mode__tick">{mode === 0 && <Icon name="check" />}</span>
            <strong>Weighted share</strong>
            <p>Each plan gets the percentage you set. Every plan is guaranteed a share — nobody is starved.</p>
          </button>
          <button type="button" className={`dst-mode ${mode === 1 ? "is-on" : ""}`} onClick={() => setKnob("pool_mode", 1)}>
            <span className="dst-mode__tick">{mode === 1 && <Icon name="check" />}</span>
            <strong>Strict priority</strong>
            <p>The top-priority plan with anyone available takes every visitor. Lower plans get nothing until it runs out.</p>
          </button>
        </div>
        {mode === 1 && (
          <div className="dst-alert is-warn">
            Priority mode starves the plans below the top one — that is what it is for. Check the cards above before saving.
          </div>
        )}
      </section>

      {/* ═══ 3. Plans ═══════════════════════════════════════════════════ */}
      <section className="dst-section">
        <header className="dst-section__head">
          <h3>Plans</h3>
          <div className="dst-totals">
            {Object.entries(marketTotals).map(([m, total]) => (
              <span key={m} className={Math.abs(total - 1) > 0.001 ? "is-bad" : "is-ok"}>
                {MARKET_LABEL[m] || m} shares: {(total * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </header>

        <div className="dst-plans">
          {plans.filter((p) => p.tier !== "free").map(({ tier, rows }) => (
            <article key={tier} className={`dst-plan ${rows.every((r) => !r.isActive) ? "is-off" : ""}`}>
              <div className="dst-plan__head">
                <div>
                  <strong>{TIER_LABEL[tier] || tier}</strong>
                  <small>{TIER_SUB[tier]}</small>
                </div>
                <label className="dst-toggle">
                  <input type="checkbox" checked={rows.some((r) => r.isActive)}
                    onChange={(e) => setPlan(tier, { isActive: e.target.checked })} />
                  <span>{rows.some((r) => r.isActive) ? "Active" : "Off"}</span>
                </label>
              </div>

              <div className="dst-plan__grid">
                <label className="dst-in">
                  <span>Price / year</span>
                  <input type="number" min={0} step={500} value={rows[0]?.priceInr ?? ""}
                    onChange={(e) => setPlan(tier, { priceInr: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label className="dst-in">
                  <span>Seat cap</span>
                  <input type="number" min={0} placeholder="unlimited" value={rows[0]?.seatCap ?? ""}
                    onChange={(e) => setPlan(tier, { seatCap: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
                <label className="dst-in">
                  <span>Priority {mode === 0 && <em>(priority mode only)</em>}</span>
                  <input type="number" min={1} value={rows[0]?.priority ?? 100}
                    onChange={(e) => setPlan(tier, { priority: Number(e.target.value) })} />
                </label>
              </div>

              <div className="dst-markets">
                {rows.map((r) => (
                  <div key={r.market} className="dst-market">
                    <div className="dst-market__name">
                      {MARKET_LABEL[r.market] || r.market}
                      <span className="dst-market__pct">{Math.round(r.weight * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.01} value={r.weight}
                      style={{ ["--pct" as string]: `${r.weight * 100}%` }}
                      onChange={(e) => setEnt(r.tier, r.market, { weight: Number(e.target.value) })}
                    />
                    <div className="dst-market__foot">
                      <label>
                        share
                        <input className="dst-mini" type="number" min={0} max={1} step={0.05} value={r.weight}
                          onChange={(e) => setEnt(r.tier, r.market, { weight: Number(e.target.value) })} />
                      </label>
                      <label>
                        max leads / day
                        <input className="dst-mini" type="number" min={0} value={r.dailyCap}
                          onChange={(e) => setEnt(r.tier, r.market, { dailyCap: Number(e.target.value) })} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <p className="dst-note">
          <strong>Seat cap stops sales, not visibility.</strong> Once a plan is full, assigning it to
          another pandit is refused. But pandits already over the cap keep being shown — hiding
          someone who paid would be worse, and invisible.
          {mode === 1 && " Shares are ignored while priority mode is on, but you can still set them here."}
        </p>
      </section>

      {/* ═══ 4. Fairness ════════════════════════════════════════════════ */}
      <section className="dst-section">
        <header className="dst-section__head"><h3>Fairness tuning</h3></header>
        <div className="dst-knobs">{CORE_KNOBS.map(renderKnob)}</div>

        <details className="dst-more">
          <summary>Advanced ({ADVANCED_KNOBS.filter(knob).length} more)</summary>
          <div className="dst-knobs">{ADVANCED_KNOBS.map(renderKnob)}</div>
        </details>

        <p className="dst-note">
          Ranges come from the database and are enforced there too — a value the slider
          cannot reach is also rejected by the API.
        </p>
      </section>

      {/* ═══ 5. Audit ═══════════════════════════════════════════════════ */}
      {data.audit.length > 0 && (
        <section className="dst-section">
          <details className="dst-more">
            <summary>Recent changes ({data.audit.length})</summary>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>When</th><th>What</th><th>From</th><th>To</th><th>By</th></tr></thead>
                <tbody>
                  {data.audit.map((a, i) => (
                    <tr key={i}>
                      <td className="muted">{new Date(a.at).toLocaleString("en-IN")}</td>
                      <td>{a.target}</td>
                      <td className="muted">{a.from ?? "—"}</td>
                      <td>{a.to ?? "—"}</td>
                      <td>{a.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      {/* Sticky save, so the button is reachable from anywhere on a long page. */}
      {dirty && (
        <div className="dst-savebar">
          <span>Unsaved changes</span>
          <div>
            <button className="btn btn-outline" onClick={() => void load()} disabled={saving}>Discard</button>
            <button className="btn btn-gold" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
