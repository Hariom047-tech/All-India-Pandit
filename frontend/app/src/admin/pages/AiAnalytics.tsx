/**
 * Admin → AI Analytics.
 *
 * Demand gaps come first, deliberately. Conversation counts are vanity; "187
 * people asked for Pitru Dosh Puja in Ujjain and we had nobody" is a recruiting
 * decision. That table is the commercially useful output of the whole feature.
 */

import { useCallback, useEffect, useState } from "react";
import { adminApi, qs } from "../lib/adminApi";

interface Gap {
  gap_type: "no_knowledge" | "no_service" | "no_pandit" | "low_confidence";
  want: string;
  location: string;
  searches: number;
  last_seen: string;
}

interface Overview {
  windowDays: number;
  volume: { conversations: number; turns: number; avg_latency_ms: number | null; unmet: number };
  topCategories: { category: string; n: number }[];
  events: Record<string, number>;
  panditCtr: number | null;
  contactClicks: number;
  feedback: { helpful: number; unhelpful: number; reason: string | null; n: number }[];
  tokens: { input_tokens: string; output_tokens: string; generations: number };
}

interface LowConf {
  query_text: string; language: string | null; problem_category: string | null;
  retrieval_top_score: string | null; gap_type: string; created_at: string;
}

/** What an admin should DO about each gap — the whole point of separating them. */
const GAP_ACTION: Record<Gap["gap_type"], { label: string; action: string; tone: string }> = {
  no_knowledge: { label: "No knowledge", action: "Write an article", tone: "warn" },
  no_service:   { label: "Not offered",  action: "Add the service",  tone: "bad" },
  no_pandit:    { label: "No pandit",    action: "Recruit in this city", tone: "bad" },
  low_confidence: { label: "Understood poorly", action: "Add example phrases", tone: "warn" },
};

/** gpt-4o-mini list price, Aug 2026. Shown as an estimate, never as a bill. */
const IN_PER_M = 0.15;
const OUT_PER_M = 0.60;

export default function AiAnalytics() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [lowConf, setLowConf] = useState<LowConf[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [o, g, l] = await Promise.all([
        adminApi.get<Overview>(`/ai/analytics/overview${qs({ days })}`),
        adminApi.get<Gap[]>(`/ai/analytics/demand-gaps${qs({ days })}`),
        adminApi.get<LowConf[]>("/ai/analytics/low-confidence"),
      ]);
      setOverview(o); setGaps(g); setLowConf(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load AI analytics");
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const tokens = overview?.tokens;
  const cost = tokens
    ? (Number(tokens.input_tokens) / 1e6) * IN_PER_M + (Number(tokens.output_tokens) / 1e6) * OUT_PER_M
    : 0;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>AI Analytics</h1>
          <p className="muted">Kya poocha ja raha hai, aur kahan hum jawab nahi de paa rahe.</p>
        </div>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 160 }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error && <div className="admin-login__error">{error}</div>}

      {overview && (
        <div className="admin-stat-grid">
          <Stat label="Conversations" value={overview.volume.conversations} />
          <Stat label="Turns" value={overview.volume.turns} />
          <Stat label="Unmet requests" value={overview.volume.unmet}
            tone={overview.volume.unmet ? "warn" : undefined} />
          <Stat label="Pandit CTR"
            value={overview.panditCtr === null ? "—" : `${(overview.panditCtr * 100).toFixed(1)}%`} />
          <Stat label="Contact clicks" value={overview.contactClicks} />
          <Stat label="Avg latency"
            value={overview.volume.avg_latency_ms ? `${(overview.volume.avg_latency_ms / 1000).toFixed(1)}s` : "—"} />
        </div>
      )}

      {/* ── Demand gaps ─────────────────────────────────────────────── */}
      <section className="admin-panel" style={{ marginTop: 22 }}>
        <div className="admin-panel__head">
          <h2>Demand gaps</h2>
          <p style={{ fontSize: ".85rem", opacity: .75, margin: "4px 0 0" }}>
            Jo devotees maang rahe hain aur hum de nahi paa rahe. Yeh supply
            intelligence hai — teen alag gap types, teen alag actions.
          </p>
        </div>
        <div className="admin-panel__body">
          <div className="admin-table-wrap"><table className="admin-table">
            <thead>
              <tr><th>Gap</th><th>What they wanted</th><th>Where</th><th>Searches</th><th>Do this</th></tr>
            </thead>
            <tbody>
              {gaps.map((g, i) => {
                const meta = GAP_ACTION[g.gap_type] || GAP_ACTION.low_confidence;
                return (
                  <tr key={`${g.gap_type}-${g.want}-${g.location}-${i}`}>
                    <td><span className={`admin-pill admin-pill--${meta.tone}`}>{meta.label}</span></td>
                    <td><strong>{g.want}</strong></td>
                    <td>{g.location}</td>
                    <td><strong>{g.searches}</strong></td>
                    <td className="muted">{meta.action}</td>
                  </tr>
                );
              })}
              {gaps.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: 22, textAlign: "center" }}>
                  Is window me koi gap nahi — har request ka jawab mil raha hai.
                </td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      </section>

      {/* ── Categories + feedback ───────────────────────────────────── */}
      <div className="admin-two-col" style={{ marginTop: 22 }}>
        <section className="admin-panel">
          <div className="admin-panel__head"><h2>Top problems</h2></div>
          <div className="admin-panel__body">
            {overview?.topCategories.length ? (
              <ul className="admin-barlist">
                {overview.topCategories.map((c) => {
                  const max = overview.topCategories[0].n || 1;
                  return (
                    <li key={c.category}>
                      <span className="admin-barlist__label">{c.category}</span>
                      <span className="admin-barlist__bar">
                        <i style={{ width: `${Math.round((c.n / max) * 100)}%` }} />
                      </span>
                      <span className="admin-barlist__n">{c.n}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted">Abhi data nahi.</p>}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__head"><h2>Feedback &amp; cost</h2></div>
          <div className="admin-panel__body">
            {overview && (
              <>
                <p style={{ marginTop: 0 }}>
                  👍 {overview.feedback.reduce((a, f) => a + (f.helpful || 0), 0)}
                  {"  ·  "}
                  👎 {overview.feedback.reduce((a, f) => a + (f.unhelpful || 0), 0)}
                </p>
                {overview.feedback.filter((f) => f.reason).length > 0 && (
                  <ul className="muted" style={{ fontSize: ".84rem", paddingLeft: 18 }}>
                    {overview.feedback.filter((f) => f.reason).map((f) => (
                      <li key={f.reason}>{f.reason}: {f.n}</li>
                    ))}
                  </ul>
                )}
                <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid var(--admin-line, #e8d5b7)" }} />
                {/* Tokens are measured off the API response, not estimated. The
                    money figure IS an estimate — list price can change. */}
                <p style={{ margin: 0, fontSize: ".88rem" }}>
                  {overview.tokens.generations} generations ·{" "}
                  {Number(overview.tokens.input_tokens).toLocaleString()} in /{" "}
                  {Number(overview.tokens.output_tokens).toLocaleString()} out
                </p>
                <p className="muted" style={{ fontSize: ".82rem", marginTop: 4 }}>
                  ≈ ${cost.toFixed(3)} at list price
                  {overview.volume.conversations > 0
                    && ` · ≈ $${(cost / overview.volume.conversations).toFixed(4)} per conversation`}
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── Raw low-confidence queries ─────────────────────────────── */}
      <section className="admin-panel" style={{ marginTop: 22 }}>
        <div className="admin-panel__head">
          <h2>Recent queries we handled poorly</h2>
          <p style={{ fontSize: ".85rem", opacity: .75, margin: "4px 0 0" }}>
            Devotee ke apne shabd. Inhein kisi article ke "example phrases" me
            daal dijiye — retrieval ka sabse seedha sudhaar yahi hai.
          </p>
        </div>
        <div className="admin-panel__body">
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Query</th><th>Category</th><th>Score</th><th>Gap</th></tr></thead>
            <tbody>
              {lowConf.map((q, i) => (
                <tr key={i}>
                  <td>{q.query_text}</td>
                  <td className="muted">{q.problem_category || "—"}</td>
                  <td className="muted">{q.retrieval_top_score ? Number(q.retrieval_top_score).toFixed(2) : "—"}</td>
                  <td><span className="admin-pill admin-pill--gold">{q.gap_type}</span></td>
                </tr>
              ))}
              {lowConf.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ padding: 22, textAlign: "center" }}>
                  Koi low-confidence query nahi.
                </td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`admin-stat-card${tone === "warn" || tone === "bad" ? " admin-stat-card--warn" : ""}`}>
      <span className="admin-stat-card__value">{value}</span>
      <span className="admin-stat-card__label">{label}</span>
    </div>
  );
}
