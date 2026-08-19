import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi } from "../lib/adminApi";

interface Plan {
  id: string; name: string; tier: string;
  price_monthly: string | number;
  price_quarterly: string | number | null;
  price_yearly: string | number | null;
  currency: string;
  features: string[] | Record<string, unknown> | null;
  description: string | null; tagline: string | null;
  lead_credits_monthly: number | null;
  max_temple_listings: number; max_service_listings: number; max_photos: number;
  is_popular: boolean; is_active: boolean; display_order: number;
}

const TIERS = ["free", "silver", "gold", "diamond"];

/** Tolerates both the legacy { highlights: [] } object and the array shape. */
function inclusionsOf(features: Plan["features"]): string[] {
  if (Array.isArray(features)) return features as string[];
  if (features && typeof features === "object" && Array.isArray((features as { highlights?: string[] }).highlights)) {
    return (features as { highlights: string[] }).highlights;
  }
  return [];
}

/**
 * Plan catalogue management: price per billing cycle plus the inclusion list
 * a pandit sees on their upgrade page. Editing here changes the live pandit
 * Plan page immediately — nothing about pricing is hardcoded in the frontend.
 */
export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError("");
    adminApi.get<Plan[]>("/subscription-plans")
      .then(setPlans)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load plans"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name"),
      tier: fd.get("tier"),
      priceMonthly: Number(fd.get("priceMonthly")),
      priceQuarterly: fd.get("priceQuarterly") ? Number(fd.get("priceQuarterly")) : null,
      priceYearly: fd.get("priceYearly") ? Number(fd.get("priceYearly")) : null,
      tagline: fd.get("tagline") || null,
      description: fd.get("description") || null,
      leadCreditsMonthly: fd.get("leadCreditsMonthly") ? Number(fd.get("leadCreditsMonthly")) : null,
      // One inclusion per line — the simplest editor for an ordered bullet list.
      features: String(fd.get("features") || "").split("\n").map((f) => f.trim()).filter(Boolean),
      isPopular: fd.get("isPopular") === "on",
      isActive: fd.get("isActive") === "on",
      displayOrder: Number(fd.get("displayOrder") || 0),
    };
    setError(""); setNotice("");
    try {
      if (editing) await adminApi.put(`/subscription-plans/${editing.id}`, body);
      else await adminApi.post("/subscription-plans", body);
      setNotice(editing ? "Plan updated." : "Plan created.");
      setEditing(null); setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const form = editing || (creating ? null : undefined);

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Subscription Plans</h2>
          <p>Set the price and the inclusions each plan shows to pandits.</p>
        </div>
        <button className="btn btn-gold" onClick={() => { setCreating(true); setEditing(null); }}>
          + New Plan
        </button>
      </div>

      {error && <div className="admin-login__error">{error}</div>}
      {notice && <div className="admin-panel" style={{ padding: 12, marginBottom: 12 }}>{notice}</div>}

      {(form !== undefined) && (
        <div className="admin-panel" style={{ marginBottom: 18 }}>
          <div className="admin-panel__head">
            <h2>{editing ? `Edit — ${editing.name}` : "New Plan"}</h2>
          </div>
          <div className="admin-panel__body">
            <form onSubmit={save}>
              <div className="admin-form-grid">
                <div className="admin-field">
                  <label>Plan Name</label>
                  <input className="input" name="name" required defaultValue={editing?.name} placeholder="Gold" />
                </div>
                <div className="admin-field">
                  <label>Tier</label>
                  {editing ? (
                    <>
                      <input className="input" value={editing.tier} readOnly />
                      {/* Tier is the join key for pandits, ranking and fairness —
                          changing it would rewrite history for every subscriber. */}
                      <small style={{ opacity: .7 }}>Tier cannot be changed after creation.</small>
                    </>
                  ) : (
                    <select className="input" name="tier" required defaultValue="silver">
                      {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
                <div className="admin-field">
                  <label>Price — Monthly (₹)</label>
                  <input className="input" name="priceMonthly" type="number" min={0} step="0.01" required
                    defaultValue={editing ? String(editing.price_monthly) : ""} />
                </div>
                <div className="admin-field">
                  <label>Price — Quarterly (₹)</label>
                  <input className="input" name="priceQuarterly" type="number" min={0} step="0.01"
                    defaultValue={editing?.price_quarterly ? String(editing.price_quarterly) : ""} />
                </div>
                <div className="admin-field">
                  <label>Price — Yearly (₹)</label>
                  <input className="input" name="priceYearly" type="number" min={0} step="0.01"
                    defaultValue={editing?.price_yearly ? String(editing.price_yearly) : ""} />
                </div>
                <div className="admin-field">
                  <label>Monthly Lead Credits</label>
                  <input className="input" name="leadCreditsMonthly" type="number" min={0}
                    defaultValue={editing?.lead_credits_monthly ?? ""} />
                </div>
                <div className="admin-field admin-field--full">
                  <label>Tagline</label>
                  <input className="input" name="tagline" maxLength={160} defaultValue={editing?.tagline || ""}
                    placeholder="Sabse zyada chuna gaya plan" />
                </div>
                <div className="admin-field admin-field--full">
                  <label>Description</label>
                  <textarea className="input" name="description" rows={2} defaultValue={editing?.description || ""} />
                </div>
                <div className="admin-field admin-field--full">
                  <label>Inclusions — one per line</label>
                  <textarea
                    className="input" name="features" rows={7}
                    defaultValue={inclusionsOf(editing?.features ?? null).join("\n")}
                    placeholder={"Verified badge\nPriority listing\nUnlimited leads\nVideo intro on profile"}
                  />
                  <small style={{ opacity: .7 }}>Ye hi list pandit ke Upgrade page par dikhegi.</small>
                </div>
                <div className="admin-field">
                  <label>Display Order</label>
                  <input className="input" name="displayOrder" type="number" defaultValue={editing?.display_order ?? 0} />
                </div>
                <div className="admin-field">
                  <label><input type="checkbox" name="isPopular" defaultChecked={editing?.is_popular} /> Mark as Popular</label>
                  <label><input type="checkbox" name="isActive" defaultChecked={editing ? editing.is_active : true} /> Active</label>
                </div>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 18 }}>
                <button type="submit" className="btn btn-gold">{editing ? "Save changes" : "Create plan"}</button>
                <button type="button" className="btn btn-outline"
                  onClick={() => { setEditing(null); setCreating(false); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="admin-panel">
        <div className="admin-panel__body">
          {loading ? <p>Loading…</p> : plans.length === 0 ? <p>No plans configured yet.</p> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Plan</th><th>Tier</th><th>Monthly</th><th>Inclusions</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong>{p.is_popular && <span> ⭐</span>}</td>
                    <td>{p.tier}</td>
                    <td>₹{Number(p.price_monthly).toLocaleString("en-IN")}</td>
                    <td style={{ maxWidth: 320 }}>
                      {inclusionsOf(p.features).length
                        ? <span style={{ fontSize: ".85rem" }}>{inclusionsOf(p.features).join(" · ")}</span>
                        : <em style={{ opacity: .6 }}>none set</em>}
                    </td>
                    <td>{p.is_active ? "Active" : "Hidden"}</td>
                    <td>
                      <button className="btn btn-outline btn-sm"
                        onClick={() => { setEditing(p); setCreating(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
