import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { adminApi, qs } from "../lib/adminApi";

interface AnalyticsResponse {
  pandit: { id: string };
  range: { range: string; from: string; to: string };
  summary: {
    profileViews: number; chatClicks: number; callClicks: number;
    qualifiedLeadsToday: number; qualifiedLeadsLast7Days: number; qualifiedLeadsLast30Days: number;
    qualifiedLeadsCalendarWeek: number; qualifiedLeadsCalendarMonth: number; qualifiedLeadsTotal: number;
    weightedExposure: number; impressions: number;
  };
  funnel: {
    profileViews: number; ctaClicks: number; verifiedInteractions: number; qualifiedLeads: number;
    viewToContactPct: number | null; contactToQualifiedPct: number | null; impressionToLeadPct: number | null;
  };
  trends: { date: string; profileViews: number; chatClicks: number; callClicks: number; qualifiedLeads: number; weightedExposure: number; impressions: number }[];
  locations: { byCity: { city: string; state: string; leads: number }[]; byMarket: { market: string; leads: number }[] };
  sources: { surface: string; leads: number; pct: number }[];
  services: { slug: string; name: string; qualifiedLeads: number; chatLeads: number; callLeads: number }[];
  exposure: { impressions: number; weightedExposure: number; slot1Appearances: number; primeSlotImpressions: number; avgPosition: number };
  dailyCaps: { market: string; cap: number; usedToday: number; remaining: number; capReached: boolean }[];
}
interface PanditHeader {
  id: string; slug: string; name: string; verification_status: string; current_tier: string;
  is_available: boolean; avg_rating: string; review_count: number;
  city: string | null; state: string | null;
  services: { name: string }[]; temples: { name: string }[];
}

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
];

export default function AdminPanditAnalytics() {
  const { id } = useParams();
  const [range, setRange] = useState("30d");
  const [pandit, setPandit] = useState<PanditHeader | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    adminApi.get<PanditHeader>(`/pandits/${id}`).then(setPandit).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setData(null);
    adminApi.get<AnalyticsResponse>(`/pandits/${id}/analytics${qs({ range })}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"));
  }, [id, range]);

  if (error) return <div className="admin-login__error">{error}</div>;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>{pandit?.name || "Pandit Analytics"}</h2>
          <p>
            {pandit && (
              <>
                <span className={`admin-pill ${pandit.verification_status === "verified" ? "admin-pill--green" : "admin-pill--red"}`}>{pandit.verification_status}</span>{" "}
                <span className="admin-pill admin-pill--gold">{pandit.current_tier}</span>{" "}
                ★ {pandit.avg_rating} ({pandit.review_count} reviews) · {[pandit.city, pandit.state].filter(Boolean).join(", ")}
              </>
            )}
          </p>
        </div>
        {pandit && <Link to={`/admin-panel/pandits/${pandit.slug}`} className="btn btn-outline btn-sm">Edit profile →</Link>}
      </div>

      <div className="admin-toolbar" style={{ marginBottom: 18 }}>
        {RANGES.map((r) => (
          <button key={r.value} className={`btn btn-sm ${range === r.value ? "btn-gold" : "btn-outline"}`} onClick={() => setRange(r.value)}>{r.label}</button>
        ))}
      </div>

      {!data ? <p className="muted">Loading…</p> : (
        <>
          <div className="admin-stat-grid" style={{ marginBottom: 18 }}>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Leads Today</span><div className="admin-stat-card__value">{data.summary.qualifiedLeadsToday}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Leads Last 7 Days</span><div className="admin-stat-card__value">{data.summary.qualifiedLeadsLast7Days}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Leads Last 30 Days</span><div className="admin-stat-card__value">{data.summary.qualifiedLeadsLast30Days}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Leads This Calendar Month</span><div className="admin-stat-card__value">{data.summary.qualifiedLeadsCalendarMonth}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Total Leads (lifetime)</span><div className="admin-stat-card__value">{data.summary.qualifiedLeadsTotal}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Profile Views</span><div className="admin-stat-card__value">{data.summary.profileViews}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Chat Clicks</span><div className="admin-stat-card__value">{data.summary.chatClicks}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Call Clicks</span><div className="admin-stat-card__value">{data.summary.callClicks}</div></div>
          </div>

          <div className="grid g-2" style={{ gap: 18, alignItems: "start", marginBottom: 18 }}>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Lead conversion funnel</h2></div>
              <div className="admin-panel__body">
                <table className="admin-table">
                  <tbody>
                    <tr><td>Profile Views</td><td className="admin-stat-card__value">{data.funnel.profileViews}</td><td /></tr>
                    <tr><td>Chat/Call Clicks</td><td className="admin-stat-card__value">{data.funnel.ctaClicks}</td><td className="muted-cell">{data.funnel.viewToContactPct !== null ? `${data.funnel.viewToContactPct}% of views` : "—"}</td></tr>
                    <tr><td>Verified Contact Events</td><td className="admin-stat-card__value">{data.funnel.verifiedInteractions}</td><td /></tr>
                    <tr><td>Qualified Leads</td><td className="admin-stat-card__value">{data.funnel.qualifiedLeads}</td><td className="muted-cell">{data.funnel.contactToQualifiedPct !== null ? `${data.funnel.contactToQualifiedPct}% of clicks` : "—"}</td></tr>
                  </tbody>
                </table>
                <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>Impression → Lead: {data.funnel.impressionToLeadPct !== null ? `${data.funnel.impressionToLeadPct}%` : "not enough impression data yet"}</p>
              </div>
            </div>

            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Exposure &amp; fairness</h2></div>
              <div className="admin-panel__body">
                <table className="admin-table">
                  <tbody>
                    <tr><td>Impressions</td><td className="admin-stat-card__value">{data.exposure.impressions}</td></tr>
                    <tr><td>Weighted Exposure</td><td className="admin-stat-card__value">{data.exposure.weightedExposure.toFixed(2)}</td></tr>
                    <tr><td>Slot #1 Appearances</td><td className="admin-stat-card__value">{data.exposure.slot1Appearances}</td></tr>
                    <tr><td>Prime-Slot (top 3) Impressions</td><td className="admin-stat-card__value">{data.exposure.primeSlotImpressions}</td></tr>
                    <tr><td>Average Position</td><td className="admin-stat-card__value">{data.exposure.avgPosition.toFixed(1)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="admin-panel" style={{ marginBottom: 18 }}>
            <div className="admin-panel__head"><h2>Daily lead cap</h2></div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Market</th><th>Cap</th><th>Used Today</th><th>Remaining</th><th>Status</th></tr></thead>
                <tbody>
                  {data.dailyCaps.map((c) => (
                    <tr key={c.market}>
                      <td>{c.market}</td><td>{c.cap}</td><td>{c.usedToday}</td><td>{c.remaining}</td>
                      <td><span className={`admin-pill ${c.capReached ? "admin-pill--red" : "admin-pill--green"}`}>{c.capReached ? "Cap reached" : "Open"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid g-2" style={{ gap: 18, alignItems: "start", marginBottom: 18 }}>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Leads by city</h2></div>
              <div className="admin-table-wrap">
                {data.locations.byCity.length ? (
                  <table className="admin-table">
                    <thead><tr><th>City</th><th>State</th><th>Leads</th></tr></thead>
                    <tbody>{data.locations.byCity.map((c) => <tr key={c.city + c.state}><td>{c.city}</td><td className="muted-cell">{c.state}</td><td>{c.leads}</td></tr>)}</tbody>
                  </table>
                ) : <div className="admin-empty">No leads in this range.</div>}
              </div>
            </div>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>India vs International</h2></div>
              <div className="admin-table-wrap">
                {data.locations.byMarket.length ? (
                  <table className="admin-table">
                    <thead><tr><th>Market</th><th>Leads</th></tr></thead>
                    <tbody>{data.locations.byMarket.map((m) => <tr key={m.market}><td>{m.market}</td><td>{m.leads}</td></tr>)}</tbody>
                  </table>
                ) : <div className="admin-empty">No leads in this range.</div>}
              </div>
            </div>
          </div>

          <div className="grid g-2" style={{ gap: 18, alignItems: "start", marginBottom: 18 }}>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Lead source surface</h2></div>
              <div className="admin-table-wrap">
                {data.sources.length ? (
                  <table className="admin-table">
                    <thead><tr><th>Surface</th><th>Leads</th><th>%</th></tr></thead>
                    <tbody>{data.sources.map((s) => <tr key={s.surface}><td>{s.surface}</td><td>{s.leads}</td><td>{s.pct}%</td></tr>)}</tbody>
                  </table>
                ) : <div className="admin-empty">No leads in this range.</div>}
              </div>
            </div>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Leads by service</h2></div>
              <div className="admin-table-wrap">
                {data.services.length ? (
                  <table className="admin-table">
                    <thead><tr><th>Service</th><th>Leads</th><th>Chat</th><th>Call</th></tr></thead>
                    <tbody>{data.services.map((s) => <tr key={s.slug}><td>{s.name}</td><td>{s.qualifiedLeads}</td><td className="muted-cell">{s.chatLeads}</td><td className="muted-cell">{s.callLeads}</td></tr>)}</tbody>
                  </table>
                ) : <div className="admin-empty">No service-attributed leads in this range.</div>}
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel__head"><h2>Daily trend</h2></div>
            <div className="admin-table-wrap">
              {data.trends.length ? (
                <table className="admin-table">
                  <thead><tr><th>Date</th><th>Views</th><th>Chat</th><th>Call</th><th>Qualified Leads</th><th>Weighted Exposure</th></tr></thead>
                  <tbody>
                    {data.trends.map((t) => (
                      <tr key={t.date}>
                        <td>{new Date(t.date).toLocaleDateString("en-IN")}</td>
                        <td>{t.profileViews}</td><td>{t.chatClicks}</td><td>{t.callClicks}</td>
                        <td>{t.qualifiedLeads}</td><td>{t.weightedExposure.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="admin-empty">No daily activity recorded in this range.</div>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
