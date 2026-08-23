import { useId, useRef, useState } from "react";

/**
 * Shared "which window am I looking at" control. Extracted from what used to
 * be a copy local to Leads.tsx so Dashboard/Analytics/Leads all drive the
 * same pill UI instead of three near-identical implementations drifting
 * apart.
 */
export function PeriodSwitcher({ label, options, value, onChange }: {
  label?: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="pandit-filter" role="group" aria-label={label || "Period"}>
      {label && <span className="pandit-filter__label">{label}</span>}
      <div className="pandit-filter__pills">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`pandit-pill${value === o.id ? " is-active" : ""}`}
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * A single-value version of the same idea: one dropdown instead of a row of
 * pills, for spots where showing every option at once (Daily / Weekly /
 * Monthly side by side) reads as clutter rather than a clear choice.
 */
export function PeriodDropdown({ label, options, value, onChange, id }: {
  label?: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className="pandit-dropdown">
      {label && <label htmlFor={selectId} className="pandit-filter__label">{label}</label>}
      <select
        id={selectId}
        className="pandit-select pandit-select--period"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export interface TrendPoint { date: string; value: number }

const IST = "Asia/Kolkata";
export function shortDate(isoDate: string) {
  // isoDate is a bare YYYY-MM-DD from the backend; anchor to IST noon so no
  // browser timezone can roll it to the adjacent day.
  const d = new Date(`${isoDate}T12:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
}

const W = 320;
const H = 108;
const PAD_X = 6;
const PAD_Y = 10;

/**
 * One measure over time, as a small-multiple line+area chart. Never combined
 * with a second measure on a shared axis — leads and views live on very
 * different scales, so each gets its own chart rather than a dual-axis lie.
 *
 * Single series → no legend box (the caption already names it). Hover/focus
 * shows a crosshair + tooltip; a <details> table keeps every value reachable
 * without a pointer, per the dataviz accessibility baseline.
 */
export function TrendChart({ title, points, color, formatValue = (v: number) => v.toLocaleString("en-IN") }: {
  title: string;
  points: TrendPoint[];
  color: string;
  formatValue?: (v: number) => string;
}) {
  const titleId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: PAD_X + i * stepX,
    y: H - PAD_Y - (p.value / max) * (H - PAD_Y * 2),
    ...p,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const areaPath = coords.length > 1 && last
    ? `${linePath} L${last.x.toFixed(1)},${H - PAD_Y} L${coords[0].x.toFixed(1)},${H - PAD_Y} Z`
    : "";

  const total = points.reduce((s, p) => s + p.value, 0);
  const peak = coords.reduce<typeof coords[number] | null>(
    (best, c) => (best === null || c.value > best.value ? c : best), null,
  );

  function moveTo(clientX: number) {
    const svg = svgRef.current;
    if (!svg || !coords.length) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const relX = ((clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - relX);
      if (d < best) { best = d; nearest = i; }
    });
    setHoverIdx(nearest);
  }

  const active = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <figure className="pandit-trendchart">
      <figcaption id={titleId} className="pandit-trendchart__head">
        <span className="pandit-trendchart__title">{title}</span>
        <span className="pandit-trendchart__total">{formatValue(total)} · {points.length} din</span>
      </figcaption>

      <svg
        ref={svgRef}
        className="pandit-trendchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={titleId}
        aria-description={peak
          ? `Peak ${formatValue(peak.value)} on ${shortDate(peak.date)}`
          : undefined}
        tabIndex={0}
        onMouseMove={(e) => moveTo(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) moveTo(t.clientX); }}
        onTouchEnd={() => setHoverIdx(null)}
        onFocus={() => setHoverIdx((h) => h ?? coords.length - 1)}
        onBlur={() => setHoverIdx(null)}
        onKeyDown={(e) => {
          if (!coords.length) return;
          if (e.key === "ArrowRight") { setHoverIdx((h) => Math.min(coords.length - 1, (h ?? -1) + 1)); e.preventDefault(); }
          if (e.key === "ArrowLeft") { setHoverIdx((h) => Math.max(0, (h ?? coords.length) - 1)); e.preventDefault(); }
          if (e.key === "Escape") setHoverIdx(null);
        }}
      >
        <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} className="pandit-trendchart__grid" />

        {areaPath && <path d={areaPath} fill={color} opacity={0.1} stroke="none" />}
        {coords.length > 1 && (
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {coords.length === 1 && (
          <circle cx={coords[0].x} cy={coords[0].y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
        )}
        {last && (
          <circle cx={last.x} cy={last.y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
        )}

        {active && (
          <>
            <line x1={active.x} y1={PAD_Y} x2={active.x} y2={H - PAD_Y} className="pandit-trendchart__crosshair" />
            <circle cx={active.x} cy={active.y} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>

      <div className="pandit-trendchart__tooltip" role="status" aria-live="polite">
        {active ? <><strong>{formatValue(active.value)}</strong> · {shortDate(active.date)}</> : " "}
      </div>

      <details className="pandit-trendchart__table">
        <summary>Table mein dekhein</summary>
        <div className="pandit-table-wrap">
          <table className="pandit-table">
            <caption className="sr-only">{title} — day by day</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">{title}</th></tr></thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td data-label="Date">{shortDate(p.date)}</td>
                  <td data-label={title}>{formatValue(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * Validated categorical palette, slots 1–3 (see dataviz skill's palette.md —
 * these are the only three slots that clear the all-pairs CVD/contrast
 * gates together; a pie/donut is an all-pairs form since every segment
 * borders every other). A 4th+ category always folds into "Other" in a
 * fixed neutral gray rather than minting an unvalidated 4th hue.
 */
export const DONUT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
export const DONUT_OTHER_COLOR = "#9a988f";

export interface DonutSegment { label: string; value: number; color: string }

/**
 * A simple, glanceable part-to-whole read — what a pandit asked for as "pie
 * chart jaisa kuch". Capped at 3 real categories + "Other", matching the
 * palette's validated ceiling for a form where every slice sits next to
 * every other. For a longer, precise breakdown (all cities, all countries)
 * the ranked bar lists below this chart stay the right form — this is the
 * at-a-glance summary, not the only place the data lives.
 */
export function DonutChart({ title, segments, centerLabel, centerUnit }: {
  title: string;
  segments: DonutSegment[];
  centerLabel: string;
  centerUnit: string;
}) {
  const titleId = useId();
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 42, STROKE = 22, GAP = 3;
  const C = 2 * Math.PI * R;
  const cx = 60, cy = 60;

  let cumulative = 0;
  const arcs = segments.map((s) => {
    const raw = (s.value / total) * C;
    const len = Math.max(0, raw - GAP);
    const dashoffset = -cumulative;
    cumulative += raw;
    return { ...s, len, dashoffset };
  });

  return (
    <figure className="pandit-donut">
      <figcaption id={titleId} className="pandit-donut__title">{title}</figcaption>
      <div className="pandit-donut__body">
        <svg viewBox="0 0 120 120" role="img" aria-labelledby={titleId} className="pandit-donut__svg">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--pd-chart-grid)" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx={cx} cy={cy} r={R} fill="none"
              stroke={a.color} strokeWidth={STROKE}
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
          <text x={cx} y={cy - 3} textAnchor="middle" className="pandit-donut__value">{centerLabel}</text>
          <text x={cx} y={cy + 15} textAnchor="middle" className="pandit-donut__unit">{centerUnit}</text>
        </svg>
        <ul className="pandit-donut__legend">
          {segments.map((s) => (
            <li key={s.label}>
              <span className="pandit-donut__swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="pandit-donut__label">{s.label}</span>
              <strong>{s.value}</strong>
              <span className="pandit-donut__pct">{Math.round((s.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export interface CountryRow { code: string; name: string; count: number }
export interface CityRow { city: string; state: string | null; count: number }

/**
 * Two ranked bar lists (country, city) built from qualified leads only — the
 * country comes from the devotee's verified phone, the city from their own
 * profile. Reuses the existing .pandit-funnel bar visual so it matches the
 * conversion funnel already on this page instead of inventing a new mark.
 */
export function GeoBreakdown({ countries, cities, total, unresolved }: {
  countries: CountryRow[];
  cities: CityRow[];
  total: number;
  unresolved: number;
}) {
  if (total === 0) {
    return (
      <p className="pandit-note">
        Is period mein koi qualified lead nahi hai, isliye location dikhane ke liye abhi kuch nahi hai.
      </p>
    );
  }

  const maxCountry = Math.max(1, ...countries.map((c) => c.count));
  const maxCity = Math.max(1, ...cities.map((c) => c.count));

  const top3 = countries.slice(0, 3);
  const otherCount = countries.slice(3).reduce((s, c) => s + c.count, 0);
  const donutSegments: DonutSegment[] = top3.map((c, i) => ({ label: c.name, value: c.count, color: DONUT_COLORS[i] }));
  if (otherCount > 0) donutSegments.push({ label: "Other", value: otherCount, color: DONUT_OTHER_COLOR });
  const countryTotal = countries.reduce((s, c) => s + c.count, 0);

  return (
    <div className="pandit-geo">
      {donutSegments.length > 0 && (
        <DonutChart
          title="Country Split"
          segments={donutSegments}
          centerLabel={String(countryTotal)}
          centerUnit="leads"
        />
      )}

      <div className="pandit-geo__cols">
        <div>
          <h3 className="pandit-geo__heading">Top Countries</h3>
          <ul className="pandit-funnel">
            {countries.map((c) => (
              <li key={c.code}>
                <div className="pandit-funnel__row">
                  <span className="pandit-funnel__label">{c.name}</span>
                  <strong className="pandit-funnel__value">{c.count}</strong>
                </div>
                <div className="pandit-funnel__bar">
                  <span style={{ width: `${Math.max(4, (c.count / maxCountry) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {unresolved > 0 && (
            <p className="pandit-note">
              {unresolved} lead(s) ka number se country pehchana nahi ja saka.
            </p>
          )}
        </div>
        <div>
          <h3 className="pandit-geo__heading">Top Cities</h3>
          {cities.length === 0 ? (
            <p className="pandit-note">Devotees ne abhi apni profile mein city nahi bhari hai.</p>
          ) : (
            <ul className="pandit-funnel">
              {cities.map((c) => (
                <li key={`${c.city}-${c.state}`}>
                  <div className="pandit-funnel__row">
                    <span className="pandit-funnel__label">{c.city}{c.state ? `, ${c.state}` : ""}</span>
                    <strong className="pandit-funnel__value">{c.count}</strong>
                  </div>
                  <div className="pandit-funnel__bar">
                    <span style={{ width: `${Math.max(4, (c.count / maxCity) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
