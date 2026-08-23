import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { panditApi, type DashboardPayload, type TrendResponse } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, HeroStat, EmptyState, ExpiryBanner, PausedBanner, formatLeadTime, formatDate, METHOD_LABEL } from "./_shared";
import { withPanditHonorific } from "../../lib/normalize";
import { TrendChart, PeriodDropdown } from "../components/charts";

const PERIODS = [
  { id: "today", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

/**
 * Every figure here comes from GET /me/dashboard, which computes real SQL
 * aggregates. There are no placeholder numbers anywhere on this page.
 *
 * Two distinct groups, deliberately never mixed:
 *   Qualified Leads — de-duplicated, verified devotees who chose to contact.
 *   Profile Views   — anonymous counts only. Who viewed is not collected and
 *                     is not shown, because a view is passive and carries no
 *                     consent to share identity.
 *
 * Deliberately just TWO headline numbers behind one Daily/Weekly/Monthly
 * dropdown, not a grid of a dozen small boxes — the funnel-level detail
 * (CTA clicks, call vs WhatsApp split, verified interactions) lives on the
 * Analytics page instead of being duplicated here.
 */
export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [period, setPeriod] = useState("today");

  const load = useCallback(() => {
    setLoading(true); setError(null);
    panditApi.dashboard()
      .then(setData)
      .catch(() => setError("Dashboard data load nahi ho paya."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  // A quiet, best-effort sparkline: if it fails to load the rest of the
  // dashboard (which already answers today/week/month) is unaffected.
  useEffect(() => { panditApi.trend(7).then(setTrend).catch(() => setTrend(null)); }, []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Dashboard data load nahi ho paya."} onRetry={load} />;

  const { plan, qualifiedLeads, views, recentLeads, meta } = data;
  const leadsForPeriod = qualifiedLeads[period as "today" | "week" | "month"];
  const viewsForPeriod = views[period as "today" | "week" | "month"];

  return (
    <div className="pandit-page">
      <PageHead title={`Namaste ${withPanditHonorific(data.pandit.name)} Ji 🙏`} />

      <PausedBanner pandit={data.pandit} />
      <ExpiryBanner plan={{ tier: plan.tier, name: plan.name || plan.tier, expiresAt: plan.expiresAt }} />

      {/* Plan card first: on mobile this is the single most-checked fact. */}
      <section className="pandit-plancard">
        <div>
          <span className="pandit-plancard__label">Current Plan</span>
          <strong className="pandit-plancard__tier">{(plan.name || plan.tier).toUpperCase()}</strong>
          <span className="pandit-plancard__meta">
            {plan.expiresAt ? <>Valid Until <b>{formatDate(plan.expiresAt)}</b></> : "Koi expiry nahi"}
          </span>
        </div>
        <Link to="/pandit/dashboard/plan" className="pandit-btn pandit-btn--primary">Upgrade Plan</Link>
      </section>

      <section className="pandit-panel" aria-labelledby="summary-heading">
        <div className="pandit-section__bar">
          <h2 id="summary-heading" className="pandit-section__title" style={{ margin: 0 }}>Overview</h2>
          <PeriodDropdown options={PERIODS} value={period} onChange={setPeriod} />
        </div>
        <p className="pandit-section__note">
          Sirf verified devotees ke genuine contacts count hote hain. Views sirf count hain — kaun dekh raha hai record nahi hota.
        </p>
        <div className="pandit-herorow">
          <HeroStat tone="lead" label="Qualified Leads" value={leadsForPeriod} />
          <HeroStat tone="view" label="Profile Views" value={viewsForPeriod} />
        </div>
      </section>

      {trend && (
        <section className="pandit-panel" aria-labelledby="trend-heading">
          <div className="pandit-section__bar">
            <h2 id="trend-heading" className="pandit-section__title" style={{ margin: 0 }}>Pichhle 7 Din Ka Trend</h2>
            <Link to="/pandit/dashboard/analytics" className="pandit-link">Poore Analytics dekhein →</Link>
          </div>
          <div className="pandit-trends">
            <TrendChart
              title="Qualified Leads"
              points={trend.points.map((p) => ({ date: p.date, value: p.leads }))}
              color="var(--pd-chart-lead)"
            />
            <TrendChart
              title="Profile Views"
              points={trend.points.map((p) => ({ date: p.date, value: p.views }))}
              color="var(--pd-chart-view)"
            />
          </div>
        </section>
      )}

      <section className="pandit-panel" aria-labelledby="recent-heading">
        <div className="pandit-section__bar">
          <h2 id="recent-heading" className="pandit-section__title" style={{ margin: 0 }}>Recent Qualified Leads</h2>
          <Link to="/pandit/dashboard/leads" className="pandit-link">Sabhi dekhein →</Link>
        </div>
        {recentLeads.length === 0 ? (
          <EmptyState
            title="Abhi koi nayi verified lead nahi hai."
            sub="Jaise hi verified user aapko contact karega, lead yahan dikhegi."
          />
        ) : (
          <ul className="pandit-leadlist">
            {recentLeads.map((l) => (
              <li key={l.id} className="pandit-leadlist__item">
                <div>
                  <strong>{l.contact_name || "Devotee"}</strong>
                  <span className="pandit-leadlist__meta">
                    {METHOD_LABEL[l.first_contact_method]} · {formatLeadTime(l.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="pandit-note">
        {meta.dedupWindowHours} ghante ke andar ek hi devotee ka repeat contact ek hi lead count hota hai.
      </p>
    </div>
  );
}
