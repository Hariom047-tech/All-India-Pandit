import { useCallback, useEffect, useState } from "react";
import { panditApi, type DashboardPayload, type TrendResponse, type TrendPointRaw, type AnalyticsDetailRow } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, STATUS_LABEL, METHOD_LABEL } from "./_shared";
import { PeriodDropdown, shortDate, DONUT_COLORS } from "../components/charts";
import { FieldExplorer, MiniSparkline, type PivotDimension, type PivotMeasure } from "../components/pivot";

const WINDOWS: { id: string; label: string; days: 7 | 30 | 90 }[] = [
  { id: "7d", label: "Weekly", days: 7 },
  { id: "30d", label: "Monthly", days: 30 },
  { id: "90d", label: "Quarterly", days: 90 },
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

/**
 * Every field a pandit can put on the X-axis of the Lead Explorer — all
 * derived from real qualified-lead rows (GET /me/analytics/detail), nothing
 * fabricated. Date/Day-of-Week/Hour-of-Day are zero-filled fixed axes (same
 * convention as the trend endpoint); Status/Method/Country/City rank by
 * volume and fold anything past the top few into "Other".
 */
const LEAD_DIMENSIONS: PivotDimension<AnalyticsDetailRow>[] = [
  {
    key: "date", label: "Date",
    accessor: (r) => r.date,
    fixedOrder: (rows) => [...new Set(rows.map((r) => r.date))].sort(),
    formatKey: shortDate,
  },
  {
    key: "dow", label: "Day of Week",
    accessor: (r) => dowKey(r.createdAt),
    fixedOrder: DOW_KEYS,
  },
  {
    key: "hour", label: "Hour of Day",
    accessor: (r) => hourKey(r.createdAt),
    fixedOrder: HOUR_KEYS,
    formatKey: hourLabel,
  },
  {
    key: "status", label: "Status",
    accessor: (r) => r.status,
    formatKey: (k) => STATUS_LABEL[k] || k,
  },
  {
    key: "method", label: "Contact Method",
    accessor: (r) => r.method,
    formatKey: (k) => METHOD_LABEL[k] || k,
  },
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

const TREND_DIMENSIONS: PivotDimension<TrendPointRaw>[] = [
  {
    key: "date", label: "Date",
    accessor: (r) => r.date,
    fixedOrder: (rows) => rows.map((r) => r.date),
    formatKey: shortDate,
  },
];

const TREND_MEASURES: PivotMeasure<TrendPointRaw>[] = [
  { key: "views", label: "Profile Views", aggregate: (rs) => rs.reduce((s, r) => s + r.views, 0), color: "var(--pd-chart-view)" },
  { key: "leads", label: "Qualified Leads", aggregate: (rs) => rs.reduce((s, r) => s + r.leads, 0), color: "var(--pd-chart-lead)" },
  { key: "call", label: "Call Clicks", aggregate: (rs) => rs.reduce((s, r) => s + r.call_clicks, 0), color: DONUT_COLORS[1] },
  { key: "whatsapp", label: "WhatsApp Clicks", aggregate: (rs) => rs.reduce((s, r) => s + r.whatsapp_clicks, 0), color: DONUT_COLORS[2] },
];

/**
 * The pandit's own analytics: a KPI strip, then two field-driven explorers
 * (Daily Performance over the trend rows, Lead Explorer over row-level lead
 * facts) instead of a wall of fixed charts — pick the field, pick the
 * measure, pick the visual, exactly like swapping fields on a PowerBI card.
 * The funnel below stays a fixed visual on purpose: mixing CTA clicks with
 * qualified leads is the one misrepresentation this page must never allow,
 * so that comparison is never handed to a free-form field picker.
 */
export default function Analytics() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [windowId, setWindowId] = useState("30d");
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [detailRows, setDetailRows] = useState<AnalyticsDetailRow[] | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(true);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    panditApi.dashboard().then(setData)
      .catch(() => setError("Analytics load nahi ho payi."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const loadExplorerData = useCallback(() => {
    setExplorerLoading(true); setExplorerError(null);
    const days = WINDOWS.find((w) => w.id === windowId)?.days || 30;
    Promise.all([panditApi.trend(days), panditApi.analyticsDetail(windowId)])
      .then(([t, d]) => { setTrend(t); setDetailRows(d.rows); })
      .catch(() => setExplorerError("Chart data load nahi ho payi."))
      .finally(() => setExplorerLoading(false));
  }, [windowId]);
  useEffect(loadExplorerData, [loadExplorerData]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Analytics load nahi ho payi."} onRetry={load} />;

  const a = data.analytics;
  const enoughLifetimeData = a.profileViews >= 50;
  const conversionLifetime = enoughLifetimeData && a.profileViews > 0
    ? ((a.qualifiedLeadCount / a.profileViews) * 100).toFixed(1)
    : null;

  const funnel = [
    { label: "Profile Views", value: a.profileViews, note: "Kisi ne bhi dekha (guests included)" },
    { label: "CTA Clicks", value: a.ctaClicks, note: "Call/WhatsApp button dabaya" },
    { label: "Verified Interactions", value: a.verifiedInteractions, note: "Logged-in user ne dabaya" },
    { label: "Qualified Leads", value: a.qualifiedLeadCount, note: "De-duplicated genuine leads" },
  ];
  const max = Math.max(...funnel.map((f) => f.value), 1);

  const periodViews = trend ? trend.points.reduce((s, p) => s + p.views, 0) : null;
  const periodLeads = trend ? trend.points.reduce((s, p) => s + p.leads, 0) : null;
  const periodClicks = trend ? trend.points.reduce((s, p) => s + p.call_clicks + p.whatsapp_clicks, 0) : null;
  const periodConversion = periodViews !== null && periodLeads !== null && periodViews >= 50
    ? ((periodLeads / periodViews) * 100).toFixed(1)
    : null;
  const conversionDisplay = periodConversion ?? conversionLifetime;

  return (
    <div className="pandit-page">
      <PageHead title="Analytics" sub="Har stage alag hai — CTA click lead nahi hota." />

      <section className="pandit-panel" aria-labelledby="kpi-h">
        <div className="pandit-section__bar">
          <h2 id="kpi-h" className="pandit-section__title" style={{ margin: 0 }}>Overview</h2>
          <PeriodDropdown options={WINDOWS.map(({ id, label }) => ({ id, label }))} value={windowId} onChange={setWindowId} />
        </div>

        <div className="pandit-kpi-row">
          <div className="pandit-kpi">
            <span className="pandit-kpi__label"><span className="pandit-kpi__icon" aria-hidden="true">👁️</span>Profile Views</span>
            <strong className="pandit-kpi__value">{(periodViews ?? a.profileViews).toLocaleString("en-IN")}</strong>
            {trend && <MiniSparkline values={trend.points.map((p) => p.views)} color="var(--pd-chart-view)" />}
          </div>
          <div className="pandit-kpi">
            <span className="pandit-kpi__label"><span className="pandit-kpi__icon" aria-hidden="true">📲</span>CTA Clicks</span>
            <strong className="pandit-kpi__value">{(periodClicks ?? a.ctaClicks).toLocaleString("en-IN")}</strong>
            {trend && <MiniSparkline values={trend.points.map((p) => p.call_clicks + p.whatsapp_clicks)} color={DONUT_COLORS[1]} />}
          </div>
          <div className="pandit-kpi">
            <span className="pandit-kpi__label"><span className="pandit-kpi__icon" aria-hidden="true">🎯</span>Qualified Leads</span>
            <strong className="pandit-kpi__value">{(periodLeads ?? a.qualifiedLeadCount).toLocaleString("en-IN")}</strong>
            {trend && <MiniSparkline values={trend.points.map((p) => p.leads)} color="var(--pd-chart-lead)" />}
          </div>
          <div className="pandit-kpi">
            <span className="pandit-kpi__label"><span className="pandit-kpi__icon" aria-hidden="true">📈</span>Conversion Rate</span>
            <strong className="pandit-kpi__value">{conversionDisplay ? `${conversionDisplay}%` : "—"}</strong>
          </div>
          <div className="pandit-kpi">
            <span className="pandit-kpi__label"><span className="pandit-kpi__icon" aria-hidden="true">✅</span>Verified Interactions</span>
            <strong className="pandit-kpi__value">{a.verifiedInteractions.toLocaleString("en-IN")}</strong>
            <span className="pandit-kpi__hint">All-time</span>
          </div>
        </div>

        {!conversionDisplay && (
          <p className="pandit-note">Conversion rate tab dikhega jab kam se kam 50 profile views ho jaayein.</p>
        )}
      </section>

      <section className="pandit-panel" aria-labelledby="trend-h">
        <h2 id="trend-h" className="pandit-section__title" style={{ marginTop: 0 }}>Daily Performance</h2>
        <p className="pandit-section__note">Y-Axis aur chart type badal kar dekhein — views, leads ya clicks, jis hisaab se dekhna ho.</p>
        {explorerError && <ErrorState message={explorerError} onRetry={loadExplorerData} />}
        {explorerLoading || !trend ? <Loading label="Chart load ho raha hai…" /> : (
          <FieldExplorer
            rows={trend.points}
            dimensions={TREND_DIMENSIONS}
            measures={TREND_MEASURES}
            chartKinds={["line", "bar"]}
            color="var(--pd-chart-lead)"
            defaultMeasureKey="leads"
          />
        )}
      </section>

      <section className="pandit-panel" aria-labelledby="explorer-h">
        <h2 id="explorer-h" className="pandit-section__title" style={{ marginTop: 0 }}>Lead Explorer</h2>
        <p className="pandit-section__note">
          X-Axis, Y-Axis aur chart type — teeno badal kar apne leads ko kisi bhi angle se dekhein. Country devotee ke
          verified phone number se pata chalta hai, city unki profile se — yeh sirf verified qualified leads par
          lagu hota hai, anonymous profile views par kabhi nahi.
        </p>
        {explorerError && <ErrorState message={explorerError} onRetry={loadExplorerData} />}
        {explorerLoading || !detailRows ? <Loading label="Leads load ho rahe hain…" /> : (
          <FieldExplorer
            rows={detailRows}
            dimensions={LEAD_DIMENSIONS}
            measures={LEAD_MEASURES}
            chartKinds={["bar", "line", "pie", "table"]}
            color="var(--pd-chart-lead)"
            defaultDimensionKey="status"
            defaultChartKind="bar"
            emptyMessage="Is period mein koi qualified lead nahi hai."
          />
        )}
      </section>

      <section className="pandit-panel" aria-labelledby="funnel-h">
        <h2 id="funnel-h" className="pandit-section__title" style={{ marginTop: 0 }}>Conversion Funnel</h2>
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
        {conversionLifetime
          ? <p className="pandit-note">Qualified Leads / Profile Views (all-time) = <b>{conversionLifetime}%</b></p>
          : <p className="pandit-note">Conversion rate tab dikhega jab kam se kam 50 profile views ho jaayein.</p>}
      </section>
    </div>
  );
}
