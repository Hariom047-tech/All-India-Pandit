import { useCallback, useEffect, useState } from "react";
import { panditApi, type DashboardPayload } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, StatCard } from "./_shared";

/**
 * The funnel, with each stage labelled for what it actually is. A CTA click
 * is never presented as a lead — that mislabelling is precisely what makes a
 * directory's analytics untrustworthy.
 */
export default function Analytics() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    panditApi.dashboard().then(setData)
      .catch(() => setError("Analytics load nahi ho payi."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Analytics load nahi ho payi."} onRetry={load} />;

  const a = data.analytics;
  // Only shown once there is enough traffic for a percentage to mean anything.
  const enoughData = a.profileViews >= 50;
  const conversion = enoughData && a.profileViews > 0
    ? ((a.qualifiedLeadCount / a.profileViews) * 100).toFixed(1)
    : null;

  const funnel = [
    { label: "Profile Views", value: a.profileViews, note: "Kisi ne bhi dekha (guests included)" },
    { label: "CTA Clicks", value: a.ctaClicks, note: "Call/WhatsApp button dabaya" },
    { label: "Verified Interactions", value: a.verifiedInteractions, note: "Logged-in user ne dabaya" },
    { label: "Qualified Leads", value: a.qualifiedLeadCount, note: "De-duplicated genuine leads" },
  ];
  const max = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="pandit-page">
      <PageHead title="Analytics" sub="Har stage alag hai — CTA click lead nahi hota." />

      <div className="pandit-stats">
        <StatCard tone="view" label="Views (Today)" value={a.viewsToday} />
        <StatCard tone="view" label="Views (Week)" value={a.viewsWeek} />
        <StatCard tone="view" label="Views (Month)" value={a.viewsMonth} />
        <StatCard tone="lead" label="Qualified Leads" value={a.qualifiedLeadCount} />
      </div>

      <section aria-labelledby="funnel-h">
        <h2 id="funnel-h" className="pandit-section__title">Conversion Funnel</h2>
        <ul className="pandit-funnel">
          {funnel.map((f) => (
            <li key={f.label}>
              <div className="pandit-funnel__row">
                <span className="pandit-funnel__label">{f.label}</span>
                <strong className="pandit-funnel__value">{f.value.toLocaleString("en-IN")}</strong>
              </div>
              <div className="pandit-funnel__bar">
                <span style={{ width: `${Math.max(2, (f.value / max) * 100)}%` }} />
              </div>
              <small className="pandit-funnel__note">{f.note}</small>
            </li>
          ))}
        </ul>
        {conversion
          ? <p className="pandit-note">Qualified Leads / Profile Views = <b>{conversion}%</b></p>
          : <p className="pandit-note">Conversion rate tab dikhega jab kam se kam 50 profile views ho jaayein.</p>}
      </section>
    </div>
  );
}
