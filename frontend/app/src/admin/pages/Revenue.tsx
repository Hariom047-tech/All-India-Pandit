import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { adminApi, qs } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";

interface RevenueOverview {
  today: string;
  month: string;
  year: string;
  byTier: { tier: string; revenue: string }[];
  activeSubscriptions: number;
  expiringThisWeek: number;
  subscribersByTier: { tier: string; count: number }[];
}

interface RenewalSummary {
  renewed_count: number;
  one_time_active_count: number;
  churned_count: number;
  total_count: number;
}

interface RenewalRow {
  slug: string;
  full_name: string;
  purchase_count: number;
  first_tier: string;
  latest_tier: string;
  first_purchase_at: string;
  last_purchase_at: string;
  has_active_now: boolean;
  renewal_status: "renewed" | "one_time_active" | "churned";
}

interface RenewalReport {
  summary: RenewalSummary;
  data: RenewalRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

interface ReconciliationReport {
  priceMismatch: { tier: string; subscription_plans_price_monthly: string; plan_market_entitlements_price: string }[];
  untraceableTier: { slug: string; full_name: string; current_tier: string; subscription_expires_at: string | null }[];
  tierMismatch: { slug: string; full_name: string; pandit_current_tier: string; latest_subscription_tier: string; is_active: boolean }[];
  stalePending: { id: string; slug: string; full_name: string; amount: string; created_at: string; gateway_order_id: string }[];
}

function money(v: string | number) {
  return `₹${Number(v).toLocaleString("en-IN")}`;
}

const TIER_LABEL: Record<string, string> = { free: "Free", silver: "Silver", gold: "Gold", diamond: "Diamond" };

/**
 * Consumes GET /admin/revenue/overview — already built on the backend,
 * never previously wired to any frontend page. Same admin-stat-grid /
 * admin-stat-card pattern as Dashboard.tsx's "Revenue This Month" card, so
 * this reads as a natural extension of it rather than a new visual language.
 *
 * No chart library exists anywhere in this admin panel (confirmed by audit)
 * — the tier breakdown below uses the same hand-rolled ranked-bar pattern
 * already proven on the pandit-facing Analytics page this session, rather
 * than adding a new dependency for one page.
 */
export default function AdminRevenue() {
  const [data, setData] = useState<RevenueOverview | null>(null);
  const [recon, setRecon] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.get<RevenueOverview>("/revenue/overview")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load revenue"));
    adminApi.get<ReconciliationReport>("/billing/reconciliation").then(setRecon).catch(() => {});
  }, []);

  return (
    <>
      <div className="admin-page-head">
        <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Revenue</h2>
        <p>Collected from completed payments only — never counts a pending or failed attempt as revenue.</p>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}
      {!data && !error && <div className="admin-empty">Loading…</div>}

      {data && (
        <>
          <div className="admin-stat-grid">
            <div className="admin-stat-card">
              <div className="row-between"><span className="admin-stat-card__label">Today</span><Icon name="trending-up" size={16} /></div>
              <div className="admin-stat-card__value">{money(data.today)}</div>
            </div>
            <div className="admin-stat-card">
              <div className="row-between"><span className="admin-stat-card__label">This Month</span><Icon name="trending-up" size={16} /></div>
              <div className="admin-stat-card__value">{money(data.month)}</div>
            </div>
            <div className="admin-stat-card">
              <div className="row-between"><span className="admin-stat-card__label">This Year</span><Icon name="trending-up" size={16} /></div>
              <div className="admin-stat-card__value">{money(data.year)}</div>
            </div>
            <div className="admin-stat-card">
              <div className="row-between"><span className="admin-stat-card__label">Active Subscriptions</span><Icon name="credit-card" size={16} /></div>
              <div className="admin-stat-card__value">{data.activeSubscriptions.toLocaleString("en-IN")}</div>
            </div>
            <div className={`admin-stat-card${data.expiringThisWeek > 0 ? " admin-stat-card--warn" : ""}`}>
              <div className="row-between"><span className="admin-stat-card__label">Expiring This Week</span><Icon name="alert-circle" size={16} /></div>
              <div className="admin-stat-card__value">{data.expiringThisWeek.toLocaleString("en-IN")}</div>
            </div>
          </div>

          <div className="admin-panel" style={{ marginTop: 18 }}>
            <div className="admin-panel__head"><h2>Revenue by Plan (all time, completed payments)</h2></div>
            <div className="admin-panel__body">
              {data.byTier.length === 0 ? (
                <div className="admin-empty">No completed payments yet.</div>
              ) : (
                <RevenueBars rows={data.byTier} />
              )}
            </div>
          </div>

          <div className="admin-panel" style={{ marginTop: 18 }}>
            <div className="admin-panel__head"><h2>Subscribers by Plan</h2></div>
            <div className="admin-panel__body">
              <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>
                Pandits currently on a paid tier right now. Click a tier to see who.
              </p>
              <div className="admin-stat-grid">
                {["silver", "gold", "diamond"].map((tier) => {
                  const row = data.subscribersByTier.find((r) => r.tier === tier);
                  return (
                    <Link
                      key={tier}
                      to={`/admin-panel/subscriptions?tier=${tier}&activeOnly=true`}
                      className="admin-stat-card admin-stat-card--link"
                    >
                      <div className="row-between">
                        <span className="admin-stat-card__label">{TIER_LABEL[tier]}</span>
                        <Icon name="users" size={16} />
                      </div>
                      <div className="admin-stat-card__value">{(row?.count ?? 0).toLocaleString("en-IN")}</div>
                      <div className="muted" style={{ fontSize: ".78rem", marginTop: 4 }}>View pandits →</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <RenewalsSection />

          {recon && (
            <div className="admin-panel" style={{ marginTop: 18 }}>
              <div className="admin-panel__head"><h2>Billing Reconciliation</h2></div>
              <div className="admin-panel__body">
                <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>
                  Flags things worth a human look — never auto-fixed.
                </p>

                {recon.priceMismatch.length > 0 && (
                  <ReconSection title="Price sources disagree (documented, not merged)">
                    <table className="admin-table">
                      <thead><tr><th>Tier</th><th>Plans & Pricing price</th><th>Distribution entitlement price</th></tr></thead>
                      <tbody>
                        {recon.priceMismatch
                          .filter((r) => Number(r.subscription_plans_price_monthly) !== Number(r.plan_market_entitlements_price))
                          .map((r) => (
                            <tr key={r.tier}>
                              <td style={{ textTransform: "capitalize" }}>{r.tier}</td>
                              <td>₹{Number(r.subscription_plans_price_monthly).toLocaleString("en-IN")}</td>
                              <td>₹{Number(r.plan_market_entitlements_price).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </ReconSection>
                )}

                {recon.untraceableTier.length > 0 && (
                  <ReconSection title={`Paid tier with no purchase record (${recon.untraceableTier.length})`}>
                    <table className="admin-table">
                      <thead><tr><th>Pandit</th><th>Tier</th><th>Expires</th></tr></thead>
                      <tbody>
                        {recon.untraceableTier.map((r) => (
                          <tr key={r.slug}>
                            <td>{r.full_name} <span className="muted-cell">({r.slug})</span></td>
                            <td style={{ textTransform: "capitalize" }}>{r.current_tier}</td>
                            <td className="muted-cell">{r.subscription_expires_at ? new Date(r.subscription_expires_at).toLocaleDateString("en-IN") : "no expiry"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ReconSection>
                )}

                {recon.tierMismatch.length > 0 && (
                  <ReconSection title={`Tier disagrees with latest subscription record (${recon.tierMismatch.length})`}>
                    <table className="admin-table">
                      <thead><tr><th>Pandit</th><th>pandits.current_tier</th><th>Latest subscription</th></tr></thead>
                      <tbody>
                        {recon.tierMismatch.map((r) => (
                          <tr key={r.slug}>
                            <td>{r.full_name} <span className="muted-cell">({r.slug})</span></td>
                            <td style={{ textTransform: "capitalize" }}>{r.pandit_current_tier}</td>
                            <td className="muted-cell" style={{ textTransform: "capitalize" }}>{r.latest_subscription_tier} {!r.is_active && "(inactive)"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ReconSection>
                )}

                {recon.stalePending.length > 0 && (
                  <ReconSection title={`Payments pending > 1 day (${recon.stalePending.length})`}>
                    <table className="admin-table">
                      <thead><tr><th>Pandit</th><th>Amount</th><th>Since</th><th>Razorpay Order</th></tr></thead>
                      <tbody>
                        {recon.stalePending.map((r) => (
                          <tr key={r.id}>
                            <td>{r.full_name} <span className="muted-cell">({r.slug})</span></td>
                            <td>₹{Number(r.amount).toLocaleString("en-IN")}</td>
                            <td className="muted-cell">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                            <td className="muted-cell">{r.gateway_order_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ReconSection>
                )}

                {recon.priceMismatch.length === 0 && recon.untraceableTier.length === 0
                  && recon.tierMismatch.length === 0 && recon.stalePending.length === 0 && (
                  <div className="admin-empty">Nothing to review right now.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ReconSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: ".9rem", marginBottom: 8 }}>{title}</div>
      <div className="admin-table-wrap">{children}</div>
    </div>
  );
}

function RevenueBars({ rows }: { rows: { tier: string; revenue: string }[] }) {
  const sorted = [...rows].sort((a, b) => Number(b.revenue) - Number(a.revenue));
  const max = Math.max(1, ...sorted.map((r) => Number(r.revenue)));
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {sorted.map((r) => (
        <li key={r.tier} style={{ marginBottom: 14 }}>
          <div className="row-between" style={{ fontSize: ".9rem", marginBottom: 4 }}>
            <span>{TIER_LABEL[r.tier] || r.tier}</span>
            <strong>{money(r.revenue)}</strong>
          </div>
          <div style={{ height: 10, background: "var(--border-soft, #f0eade)", borderRadius: 999, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(2, (Number(r.revenue) / max) * 100)}%`, background: "var(--gold-grad, #d4a017)", borderRadius: 999 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const RENEWAL_STATUS_LABEL: Record<string, string> = {
  renewed: "Renewed", one_time_active: "Active (first purchase)", churned: "Churned",
};
const RENEWAL_STATUS_PILL: Record<string, string> = {
  renewed: "admin-pill--green", one_time_active: "admin-pill--blue", churned: "admin-pill--gray",
};

/**
 * "Renewed" here means a pandit came back and bought a *second* subscription
 * — same tier again, or a switch to a different tier, both count (per the
 * admin's own definition: a plan change is still a return customer, not a
 * new one). Backed by GET /admin/revenue/renewals — see renewals()/
 * renewalSummary() in subscriptions.repository.js for the exact SQL.
 */
function RenewalsSection() {
  const [report, setReport] = useState<RenewalReport | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.get<RenewalReport>(`/revenue/renewals${qs({ status, page, perPage: 20 })}`)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load renewals"));
  }, [status, page]);

  function toggleStatus(next: string) {
    setStatus((cur) => (cur === next ? "" : next));
    setPage(1);
  }

  return (
    <div className="admin-panel" style={{ marginTop: 18 }}>
      <div className="admin-panel__head"><h2>Renewals — who came back, who didn't</h2></div>
      <div className="admin-panel__body">
        <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>
          A second purchase counts as a renewal whether it's the same plan again or a switch to another tier.
          Click a card to filter the list below.
        </p>

        {error && <div className="admin-login__error" style={{ marginBottom: 14 }}>{error}</div>}

        {report && (
          <div className="admin-stat-grid" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={`admin-stat-card admin-stat-card--link${status === "renewed" ? " admin-stat-card--active" : ""}`}
              onClick={() => toggleStatus("renewed")}
            >
              <span className="admin-stat-card__label">Renewed</span>
              <div className="admin-stat-card__value">{report.summary.renewed_count.toLocaleString("en-IN")}</div>
            </button>
            <button
              type="button"
              className={`admin-stat-card admin-stat-card--link${status === "one_time_active" ? " admin-stat-card--active" : ""}`}
              onClick={() => toggleStatus("one_time_active")}
            >
              <span className="admin-stat-card__label">Active, first purchase</span>
              <div className="admin-stat-card__value">{report.summary.one_time_active_count.toLocaleString("en-IN")}</div>
            </button>
            <button
              type="button"
              className={`admin-stat-card admin-stat-card--link${status === "churned" ? " admin-stat-card--active" : ""}`}
              onClick={() => toggleStatus("churned")}
            >
              <span className="admin-stat-card__label">Churned</span>
              <div className="admin-stat-card__value">{report.summary.churned_count.toLocaleString("en-IN")}</div>
            </button>
            <div className="admin-stat-card">
              <span className="admin-stat-card__label">Total ever subscribed</span>
              <div className="admin-stat-card__value">{report.summary.total_count.toLocaleString("en-IN")}</div>
            </div>
          </div>
        )}

        <div className="admin-table-wrap">
          {!report ? (
            <div className="admin-empty">Loading…</div>
          ) : report.data.length ? (
            <table className="admin-table">
              <thead>
                <tr><th>Pandit</th><th>Purchases</th><th>First Plan</th><th>Latest Plan</th><th>Last Purchase</th><th>Status</th></tr>
              </thead>
              <tbody>
                {report.data.map((r) => (
                  <tr key={r.slug}>
                    <td><strong>{r.full_name}</strong><div className="muted-cell">{r.slug}</div></td>
                    <td>{r.purchase_count}</td>
                    <td style={{ textTransform: "capitalize" }}>{TIER_LABEL[r.first_tier] || r.first_tier}</td>
                    <td style={{ textTransform: "capitalize" }}>
                      {TIER_LABEL[r.latest_tier] || r.latest_tier}
                      {r.first_tier !== r.latest_tier && <span className="muted-cell"> (switched)</span>}
                    </td>
                    <td className="muted-cell">{new Date(r.last_purchase_at).toLocaleDateString("en-IN")}</td>
                    <td><span className={`admin-pill ${RENEWAL_STATUS_PILL[r.renewal_status]}`}>{RENEWAL_STATUS_LABEL[r.renewal_status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No {status ? RENEWAL_STATUS_LABEL[status].toLowerCase() : ""} pandits yet.</div>
          )}
        </div>

        {report && report.totalPages > 1 && (
          <div style={{ paddingTop: 14 }}>
            <Pager page={report.page} pages={report.totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
