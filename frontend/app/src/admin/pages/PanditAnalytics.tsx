import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { adminApi, qs } from "../lib/adminApi";
import "../../pandit/pandit.css";
import { FieldExplorer, SeriesChart, type PivotDimension, type PivotMeasure } from "../../pandit/components/pivot";
import { PeriodDropdown, DONUT_COLORS, shortDate } from "../../pandit/components/charts";

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

/** One row-level qualified lead — the raw material behind the Lead
 *  Explorer below. Mirrors AnalyticsDetailRow on the pandit's own
 *  self-service Analytics page (frontend/app/src/pandit/pages/Analytics.tsx)
 *  — same backend mapper (qualifiedLeads.repository.js's mapDetailRow), so
 *  a pandit's own numbers and this admin view can never disagree. `market`
 *  is admin-only (India vs International), not exposed on the pandit's own
 *  Lead Explorer. */
interface AnalyticsDetailRow {
  date: string; createdAt: string;
  status: "new" | "viewed" | "contacted" | "completed" | "not_reachable";
  method: "phone_call" | "whatsapp";
  interactionCount: number;
  market: "India" | "International" | null;
  country: string | null; city: string | null; state: string | null;
}

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
];

/** Independent of the RANGES pills above — the row-level detail endpoint
 *  only understands rolling windows, not calendar months, so the Lead
 *  Explorer gets its own compact period control rather than silently
 *  breaking for two of the six range options. */
const EXPLORER_PERIODS = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "all", label: "All Time" },
];

const IST = "Asia/Kolkata";
const DOW_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_KEYS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
function dowKey(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(new Date(iso));
}
function hourKey(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
function hourLabel(h: string) {
  const n = Number(h);
  const period = n < 12 ? "AM" : "PM";
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return `${h12} ${period}`;
}
const STATUS_LABEL: Record<string, string> = {
  new: "New", viewed: "Viewed", contacted: "Contacted", completed: "Completed", not_reachable: "Not Reachable",
};
const METHOD_LABEL: Record<string, string> = { phone_call: "Call", whatsapp: "WhatsApp" };

const LEAD_DIMENSIONS: PivotDimension<AnalyticsDetailRow>[] = [
  {
    key: "date", label: "Date",
    accessor: (r) => r.date,
    fixedOrder: (rows) => [...new Set(rows.map((r) => r.date))].sort(),
    formatKey: shortDate,
  },
  { key: "dow", label: "Day of Week", accessor: (r) => dowKey(r.createdAt), fixedOrder: DOW_KEYS },
  { key: "hour", label: "Hour of Day", accessor: (r) => hourKey(r.createdAt), fixedOrder: HOUR_KEYS, formatKey: hourLabel },
  { key: "status", label: "Status", accessor: (r) => r.status, formatKey: (k) => STATUS_LABEL[k] || k },
  { key: "method", label: "Contact Method", accessor: (r) => r.method, formatKey: (k) => METHOD_LABEL[k] || k },
  { key: "market", label: "Market", accessor: (r) => r.market || "Unknown" },
  { key: "country", label: "Country", accessor: (r) => r.country || "Unknown" },
  { key: "city", label: "City", accessor: (r) => (r.city ? `${r.city}${r.state ? `, ${r.state}` : ""}` : "Unknown") },
];

const LEAD_MEASURES: PivotMeasure<AnalyticsDetailRow>[] = [
  { key: "count", label: "Count of Leads", aggregate: (rs) => rs.length },
  { key: "interactions", label: "Total Interactions", aggregate: (rs) => rs.reduce((s, r) => s + r.interactionCount, 0) },
  {
    key: "avgInteractions", label: "Avg Interactions / Lead",
    aggregate: (rs) => (rs.length ? rs.reduce((s, r) => s + r.interactionCount, 0) / rs.length : 0),
    format: (v) => v.toFixed(1),
  },
];

type TrendPoint = AnalyticsResponse["trends"][number];

const TREND_DIMENSIONS: PivotDimension<TrendPoint>[] = [
  {
    key: "date", label: "Date",
    accessor: (r) => r.date.slice(0, 10),
    fixedOrder: (rows) => [...new Set(rows.map((r) => r.date.slice(0, 10)))].sort(),
    formatKey: shortDate,
  },
];

const TREND_MEASURES: PivotMeasure<TrendPoint>[] = [
  { key: "views", label: "Profile Views", aggregate: (rs) => rs.reduce((s, r) => s + r.profileViews, 0), color: "var(--pd-chart-view)" },
  { key: "leads", label: "Qualified Leads", aggregate: (rs) => rs.reduce((s, r) => s + r.qualifiedLeads, 0), color: "var(--pd-chart-lead)" },
  { key: "chat", label: "Chat Clicks", aggregate: (rs) => rs.reduce((s, r) => s + r.chatClicks, 0), color: DONUT_COLORS[1] },
  { key: "call", label: "Call Clicks", aggregate: (rs) => rs.reduce((s, r) => s + r.callClicks, 0), color: DONUT_COLORS[2] },
  { key: "exposure", label: "Weighted Exposure", aggregate: (rs) => rs.reduce((s, r) => s + r.weightedExposure, 0), format: (v) => v.toFixed(1) },
  { key: "impressions", label: "Impressions", aggregate: (rs) => rs.reduce((s, r) => s + r.impressions, 0) },
];

/**
 * Admin's view of one pandit's analytics — redesigned around the same
 * "pick a field, see it reshape" explorer as the pandit's own self-service
 * Analytics page, so an admin can slice the exact same underlying leads by
 * any dimension (including admin-only ones like Market) instead of reading
 * a wall of fixed HTML tables. The conversion funnel stays a fixed visual on
 * purpose — same reasoning as the pandit page: CTA clicks must never be
 * pivotable into looking like leads.
 */
export default function AdminPanditAnalytics() {
  const { id } = useParams();
  const [range, setRange] = useState("30d");
  const [pandit, setPandit] = useState<PanditHeader | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState("");

  const [explorerPeriod, setExplorerPeriod] = useState("30d");
  const [detailRows, setDetailRows] = useState<AnalyticsDetailRow[] | null>(null);
  const [detailError, setDetailError] = useState("");

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

  const loadDetail = useCallback(() => {
    if (!id) return;
    setDetailRows(null); setDetailError("");
    adminApi.get<{ rows: AnalyticsDetailRow[] }>(`/pandits/${id}/analytics/detail${qs({ period: explorerPeriod })}`)
      .then((res) => setDetailRows(res.rows))
      .catch((err) => setDetailError(err instanceof Error ? err.message : "Failed to load lead detail"));
  }, [id, explorerPeriod]);
  useEffect(loadDetail, [loadDetail]);

  if (error) return <div className="admin-login__error">{error}</div>;

  const funnel = data ? [
    { label: "Profile Views", value: data.funnel.profileViews, note: "Anyone who viewed, guests included" },
    { label: "CTA Clicks", value: data.funnel.ctaClicks, note: "Call/WhatsApp button pressed" },
    { label: "Verified Interactions", value: data.funnel.verifiedInteractions, note: "Pressed while logged in" },
    { label: "Qualified Leads", value: data.funnel.qualifiedLeads, note: "De-duplicated genuine leads" },
  ] : [];
  const funnelMax = Math.max(...funnel.map((f) => f.value), 1);

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
          <div className="admin-panel" style={{ marginBottom: 18 }}>
            <div className="admin-panel__body">
              <div className="pandit-kpi-row" style={{ marginTop: 0 }}>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Leads Today</span><strong className="pandit-kpi__value">{data.summary.qualifiedLeadsToday}</strong></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Leads Last 7 Days</span><strong className="pandit-kpi__value">{data.summary.qualifiedLeadsLast7Days}</strong></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Leads Last 30 Days</span><strong className="pandit-kpi__value">{data.summary.qualifiedLeadsLast30Days}</strong></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Leads This Month</span><strong className="pandit-kpi__value">{data.summary.qualifiedLeadsCalendarMonth}</strong></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Total Leads</span><strong className="pandit-kpi__value">{data.summary.qualifiedLeadsTotal}</strong><span className="pandit-kpi__hint">Lifetime</span></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Profile Views</span><strong className="pandit-kpi__value">{data.summary.profileViews}</strong></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Chat Clicks</span><strong className="pandit-kpi__value">{data.summary.chatClicks}</strong></div>
                <div className="pandit-kpi"><span className="pandit-kpi__label">Call Clicks</span><strong className="pandit-kpi__value">{data.summary.callClicks}</strong></div>
              </div>
            </div>
          </div>

          <div className="grid g-2" style={{ gap: 18, alignItems: "start", marginBottom: 18 }}>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Lead conversion funnel</h2></div>
              <div className="admin-panel__body">
                <ul className="pandit-funnel">
                  {funnel.map((f) => (
                    <li key={f.label}>
                      <div className="pandit-funnel__row">
                        <span className="pandit-funnel__label">{f.label}</span>
                        <strong className="pandit-funnel__value">{f.value.toLocaleString("en-IN")}</strong>
                      </div>
                      <div className="pandit-funnel__bar">
                        <span style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%` }} />
                      </div>
                      <small className="pandit-funnel__note">{f.note}</small>
                    </li>
                  ))}
                </ul>
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

          <div className="admin-panel" style={{ marginBottom: 18 }}>
            <div className="admin-panel__head"><h2>Daily Performance</h2></div>
            <div className="admin-panel__body">
              <p className="muted" style={{ fontSize: ".85rem", marginTop: -6, marginBottom: 12 }}>
                Driven by the range pills above. Pick a measure and a chart type — replaces the old fixed daily-trend table.
              </p>
              <FieldExplorer
                rows={data.trends}
                dimensions={TREND_DIMENSIONS}
                measures={TREND_MEASURES}
                chartKinds={["line", "bar", "table"]}
                color="var(--pd-chart-lead)"
                defaultMeasureKey="leads"
                emptyMessage="No daily activity recorded in this range."
              />
            </div>
          </div>

          <div className="grid g-2" style={{ gap: 18, alignItems: "start", marginBottom: 18 }}>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Lead source surface</h2></div>
              <div className="admin-panel__body">
                {data.sources.length ? (
                  <SeriesChart
                    title="Leads by Source Surface"
                    mode="bar"
                    color="var(--pd-chart-lead)"
                    points={data.sources.map((s) => ({ key: s.surface, label: s.surface, value: s.leads }))}
                  />
                ) : <div className="admin-empty">No leads in this range.</div>}
              </div>
            </div>
            <div className="admin-panel">
              <div className="admin-panel__head"><h2>Leads by service</h2></div>
              <div className="admin-panel__body">
                {data.services.length ? (
                  <SeriesChart
                    title="Qualified Leads by Service"
                    mode="bar"
                    color="var(--pd-chart-lead)"
                    points={data.services.map((s) => ({ key: s.slug, label: s.name, value: s.qualifiedLeads }))}
                  />
                ) : <div className="admin-empty">No service-attributed leads in this range.</div>}
              </div>
            </div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel__head">
              <h2>Lead Explorer</h2>
              <PeriodDropdown options={EXPLORER_PERIODS} value={explorerPeriod} onChange={setExplorerPeriod} />
            </div>
            <div className="admin-panel__body">
              <p className="muted" style={{ fontSize: ".85rem", marginTop: -6, marginBottom: 12 }}>
                X-Axis, Y-Axis and chart type — slice this pandit's leads by any field, including Market (India vs
                International) and City. Country comes from the devotee's verified phone; city from their own profile.
              </p>
              {detailError && <p className="admin-empty">{detailError}</p>}
              {!detailError && (detailRows === null ? <p className="muted">Loading…</p> : (
                <FieldExplorer
                  rows={detailRows}
                  dimensions={LEAD_DIMENSIONS}
                  measures={LEAD_MEASURES}
                  chartKinds={["bar", "line", "pie", "table"]}
                  color="var(--pd-chart-lead)"
                  defaultDimensionKey="status"
                  defaultChartKind="bar"
                  emptyMessage="No qualified leads in this period."
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
