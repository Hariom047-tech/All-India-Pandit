import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { panditApi, type DashboardPayload } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, StatCard, EmptyState, formatLeadTime, formatDate, METHOD_LABEL } from "./_shared";
import { withPanditHonorific } from "../../lib/normalize";

/**
 * Every figure here comes from GET /me/dashboard, which computes real SQL
 * aggregates. There are no placeholder numbers anywhere on this page.
 *
 * Two distinct groups, deliberately never mixed:
 *   Qualified Leads — de-duplicated, verified devotees who chose to contact.
 *   Profile Views   — anonymous counts only. Who viewed is not collected and
 *                     is not shown, because a view is passive and carries no
 *                     consent to share identity.
 */
export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    panditApi.dashboard()
      .then(setData)
      .catch(() => setError("Dashboard data load nahi ho paya."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Dashboard data load nahi ho paya."} onRetry={load} />;

  const { plan, qualifiedLeads, views, analytics, recentLeads, meta } = data;

  return (
    <div className="pandit-page">
      <PageHead title={`Namaste ${withPanditHonorific(data.pandit.name)} Ji 🙏`} />

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

      <section aria-labelledby="ql-heading">
        <h2 id="ql-heading" className="pandit-section__title">Qualified Leads</h2>
        <p className="pandit-section__note">
          Sirf verified users ke genuine contacts. Ek hi user {meta.dedupWindowHours} ghante mein
          ek hi lead count hota hai.
        </p>
        <div className="pandit-stats">
          <StatCard tone="lead" label="Today" value={qualifiedLeads.today} />
          <StatCard tone="lead" label="This Week" value={qualifiedLeads.week} />
          <StatCard tone="lead" label="This Month" value={qualifiedLeads.month} />
        </div>
      </section>

      <section aria-labelledby="views-heading">
        <h2 id="views-heading" className="pandit-section__title">Profile Views</h2>
        <p className="pandit-section__note">
          Aapki profile kitni baar dekhi gayi — sirf count. Kaun dekh raha hai woh record nahi hota.
        </p>
        <div className="pandit-stats">
          <StatCard tone="view" label="Today" value={views.today} />
          <StatCard tone="view" label="This Week" value={views.week} />
          <StatCard tone="view" label="This Month" value={views.month} />
          <StatCard tone="view" label="Total" value={analytics.profileViews.toLocaleString("en-IN")} />
        </div>
      </section>

      <section aria-labelledby="funnel-heading">
        <h2 id="funnel-heading" className="pandit-section__title">Interactions</h2>
        <div className="pandit-stats">
          <StatCard label="Total CTA Clicks" value={analytics.ctaClicks} hint="Sabhi Call/WhatsApp taps" />
          <StatCard label="Call Clicks" value={analytics.callInteractions} />
          <StatCard label="WhatsApp Clicks" value={analytics.whatsappInteractions} />
          <StatCard label="Verified Contacts" value={analytics.verifiedInteractions} hint="Logged-in users" />
          <StatCard tone="lead" label="Qualified Leads" value={analytics.qualifiedLeadCount} />
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <div className="pandit-section__bar">
          <h2 id="recent-heading" className="pandit-section__title">Recent Qualified Leads</h2>
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
                <span className={`pandit-badge pandit-badge--${l.status}`}>{l.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
