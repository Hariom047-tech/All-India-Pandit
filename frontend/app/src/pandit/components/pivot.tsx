import { useId, useMemo, useRef, useState } from "react";
import { EmptyState } from "../pages/_shared";
import { DonutChart, DONUT_COLORS, DONUT_OTHER_COLOR, shortDate } from "./charts";

/**
 * The "change any field, see it reshape" engine behind Analytics' explorer
 * sections — a pandit picks a dimension for X, a measure for Y and a chart
 * type, exactly like swapping fields on a PowerBI visual. One aggregation
 * function + one renderer serves every combination instead of a fixed chart
 * per metric.
 */

export interface PivotDimension<T> {
  key: string;
  label: string;
  accessor: (row: T) => string;
  /** Fixed axis order (chronological dates, Mon..Sun, 00..23 hours) instead
   *  of ranking by value — zero-fills any bucket absent from this row set,
   *  same convention as the trend endpoint's zero-filled days. */
  fixedOrder?: string[] | ((rows: T[]) => string[]);
  formatKey?: (key: string) => string;
}

export interface PivotMeasure<T> {
  key: string;
  label: string;
  aggregate: (rows: T[]) => number;
  format?: (v: number) => string;
  /** Overrides the explorer's default series color for this one measure —
   *  lets "Profile Views" stay blue and "Qualified Leads" stay gold even
   *  though they share one field picker. */
  color?: string;
}

export interface PivotGroup { key: string; label: string; value: number }

const OTHER_KEY = "__other__";

/**
 * `rankByValue` bypasses a dimension's fixedOrder (chronological dates,
 * Mon..Sun, 00..23) and instead ranks by value + caps to `capTop` + "Other".
 * Pie always needs this — a zero-filled 90-day axis rendered as a pie would
 * be 90 slices with only the first 3 colored, not the validated top-3+Other
 * read; part-to-whole has no meaningful "chronological" pie order anyway.
 */
export function aggregatePivot<T>(
  rows: T[], dimension: PivotDimension<T>, measure: PivotMeasure<T>,
  opts: { capTop?: number; rankByValue?: boolean } = {},
): PivotGroup[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const k = dimension.accessor(row);
    const arr = buckets.get(k);
    if (arr) arr.push(row); else buckets.set(k, [row]);
  }

  if (dimension.fixedOrder && !opts.rankByValue) {
    const order = typeof dimension.fixedOrder === "function" ? dimension.fixedOrder(rows) : dimension.fixedOrder;
    return order.map((k) => ({
      key: k,
      label: dimension.formatKey ? dimension.formatKey(k) : k,
      value: measure.aggregate(buckets.get(k) ?? []),
    }));
  }

  let groups: PivotGroup[] = [...buckets.entries()].map(([key, rs]) => ({
    key, label: dimension.formatKey ? dimension.formatKey(key) : key, value: measure.aggregate(rs),
  }));
  groups.sort((a, b) => b.value - a.value);

  if (opts.capTop && groups.length > opts.capTop) {
    const top = groups.slice(0, opts.capTop);
    const otherValue = groups.slice(opts.capTop).reduce((s, g) => s + g.value, 0);
    if (otherValue > 0) top.push({ key: OTHER_KEY, label: "Other", value: otherValue });
    groups = top;
  }
  return groups;
}

/** A compact, non-interactive trend line for a KPI tile — no axis, no
 *  tooltip, just the shape. The full interactive read lives in the
 *  explorer charts below. */
export function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2 || values.every((v) => v === values[0])) return null;
  const W = 72, H = 26;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const stepX = W / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="pandit-kpi__spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface SeriesPoint { key: string; label: string; value: number }

const W = 320, H = 128, PAD_X = 14, PAD_Y = 12;

/**
 * One measure over an ordered or ranked x-axis, as either a line+area or a
 * column chart — the "Line"/"Bar" chart-type toggle in an explorer renders
 * through this single component so switching types never re-derives data,
 * only the mark. Same hover/keyboard/table-fallback interaction contract as
 * the Dashboard's TrendChart, generalised to any label (not just dates).
 */
export function SeriesChart({ title, points, color, mode = "line", formatValue = (v: number) => v.toLocaleString("en-IN") }: {
  title: string;
  points: SeriesPoint[];
  color: string;
  mode?: "line" | "bar";
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

  const barWidth = points.length > 0 ? Math.max(4, Math.min(26, ((W - PAD_X * 2) / points.length) * 0.62)) : 0;
  const showAxisLabels = points.length > 0 && points.length <= 9;

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
  const viewBoxH = H + (showAxisLabels ? 16 : 0);

  return (
    <figure className="pandit-trendchart pandit-pivotchart">
      <figcaption id={titleId} className="pandit-trendchart__head">
        <span className="pandit-trendchart__title">{title}</span>
        <span className="pandit-trendchart__total">{formatValue(total)} total · {points.length} {points.length === 1 ? "item" : "items"}</span>
      </figcaption>

      <svg
        ref={svgRef}
        className="pandit-trendchart__svg pandit-pivotchart__svg"
        viewBox={`0 0 ${W} ${viewBoxH}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={titleId}
        aria-description={peak ? `Peak ${formatValue(peak.value)} at ${peak.label}` : undefined}
        tabIndex={points.length ? 0 : -1}
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

        {mode === "line" ? (
          <>
            {areaPath && <path d={areaPath} fill={color} opacity={0.1} stroke="none" />}
            {coords.length > 1 && (
              <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {coords.length === 1 && (
              <circle cx={coords[0].x} cy={coords[0].y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
            )}
            {last && coords.length > 1 && (
              <circle cx={last.x} cy={last.y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
            )}
            {active && (
              <>
                <line x1={active.x} y1={PAD_Y} x2={active.x} y2={H - PAD_Y} className="pandit-trendchart__crosshair" />
                <circle cx={active.x} cy={active.y} r={5} fill={color} stroke="#fff" strokeWidth={2} />
              </>
            )}
          </>
        ) : (
          coords.map((c, i) => (
            <rect
              key={c.key}
              x={c.x - barWidth / 2}
              y={c.y}
              width={barWidth}
              height={Math.max(0, H - PAD_Y - c.y)}
              rx={2}
              fill={color}
              opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.5}
            />
          ))
        )}

        {showAxisLabels && coords.map((c, i) => (
          <text
            key={c.key} x={c.x} y={H + 11}
            textAnchor={i === 0 ? "start" : i === coords.length - 1 ? "end" : "middle"}
            className="pandit-trendchart__axislabel"
          >
            {c.label.length > 8 ? `${c.label.slice(0, 7)}…` : c.label}
          </text>
        ))}
      </svg>

      <div className="pandit-trendchart__tooltip" role="status" aria-live="polite">
        {active ? <><strong>{formatValue(active.value)}</strong> · {active.label}</> : " "}
      </div>

      <details className="pandit-trendchart__table">
        <summary>Table mein dekhein</summary>
        <div className="pandit-table-wrap">
          <table className="pandit-table">
            <caption className="sr-only">{title} — value by item</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key}>
                  <td data-label="Item">{p.label}</td>
                  <td data-label="Value">{formatValue(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** The "Table" chart type — same data, always-open (not a collapsed
 *  accessibility fallback like the one inside SeriesChart), because in an
 *  explorer the table IS one of the visuals a pandit can pick. */
export function GroupTable({ dimLabel, measureLabel, groups, formatValue }: {
  dimLabel: string;
  measureLabel: string;
  groups: PivotGroup[];
  formatValue: (v: number) => string;
}) {
  return (
    <div className="pandit-table-wrap">
      <table className="pandit-table">
        <caption className="sr-only">{measureLabel} by {dimLabel}</caption>
        <thead><tr><th scope="col">{dimLabel}</th><th scope="col">{measureLabel}</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td data-label={dimLabel}>{g.label}</td>
              <td data-label={measureLabel}>{formatValue(g.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ChartKind = "bar" | "line" | "pie" | "table";
const CHART_KIND_LABEL: Record<ChartKind, string> = { bar: "Bar", line: "Line", pie: "Pie", table: "Table" };

/**
 * The explorer itself: a toolbar (X-Axis field, Y-Axis field, chart-type
 * toggle — hidden when there's only one option, so the single-dimension
 * "Daily Performance" explorer just shows a Y-Axis + type picker) driving
 * one PivotChart render. This is the concrete "change columns, see any
 * chart" mechanic asked for.
 */
export function FieldExplorer<T>({
  rows, dimensions, measures, chartKinds, color, note, emptyMessage,
  defaultDimensionKey, defaultMeasureKey, defaultChartKind,
}: {
  rows: T[];
  dimensions: PivotDimension<T>[];
  measures: PivotMeasure<T>[];
  chartKinds?: ChartKind[];
  color: string;
  note?: string;
  emptyMessage?: string;
  defaultDimensionKey?: string;
  defaultMeasureKey?: string;
  defaultChartKind?: ChartKind;
}) {
  const kinds = chartKinds ?? ["bar", "line", "pie", "table"];
  const [dimKey, setDimKey] = useState(defaultDimensionKey ?? dimensions[0].key);
  const [measureKey, setMeasureKey] = useState(defaultMeasureKey ?? measures[0].key);
  const [chartKind, setChartKind] = useState<ChartKind>(defaultChartKind ?? kinds[0]);

  const dimension = dimensions.find((d) => d.key === dimKey) ?? dimensions[0];
  const measure = measures.find((m) => m.key === measureKey) ?? measures[0];
  const formatValue = measure.format ?? ((v: number) => v.toLocaleString("en-IN"));
  const seriesColor = measure.color ?? color;

  const groups = useMemo(
    () => aggregatePivot(rows, dimension, measure, chartKind === "pie"
      ? { capTop: 3, rankByValue: true }
      : { capTop: 7 }),
    [rows, dimension, measure, chartKind],
  );
  const total = groups.reduce((s, g) => s + g.value, 0);

  return (
    <div className="pandit-explorer">
      <div className="pandit-explorer__toolbar">
        {dimensions.length > 1 && (
          <label className="pandit-dropdown">
            <span className="pandit-filter__label">X-Axis</span>
            <select className="pandit-select pandit-select--period" value={dimKey} onChange={(e) => setDimKey(e.target.value)}>
              {dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
        )}
        {measures.length > 1 && (
          <label className="pandit-dropdown">
            <span className="pandit-filter__label">Y-Axis</span>
            <select className="pandit-select pandit-select--period" value={measureKey} onChange={(e) => setMeasureKey(e.target.value)}>
              {measures.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
        )}
        {kinds.length > 1 && (
          <div className="pandit-filter" role="group" aria-label="Chart type">
            <span className="pandit-filter__label">Chart</span>
            <div className="pandit-filter__pills">
              {kinds.map((k) => (
                <button
                  key={k} type="button"
                  className={`pandit-pill${chartKind === k ? " is-active" : ""}`}
                  aria-pressed={chartKind === k}
                  onClick={() => setChartKind(k)}
                >{CHART_KIND_LABEL[k]}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {note && <p className="pandit-section__note">{note}</p>}

      {rows.length === 0 ? (
        <EmptyState title={emptyMessage ?? "Abhi is period mein data nahi hai."} />
      ) : chartKind === "table" ? (
        <GroupTable dimLabel={dimension.label} measureLabel={measure.label} groups={groups} formatValue={formatValue} />
      ) : chartKind === "pie" ? (
        <DonutChart
          title={`${measure.label} by ${dimension.label}`}
          segments={groups.map((g, i) => ({
            label: g.label,
            value: g.value,
            color: g.key === OTHER_KEY ? DONUT_OTHER_COLOR : DONUT_COLORS[i] ?? DONUT_OTHER_COLOR,
          }))}
          centerLabel={formatValue(total)}
          centerUnit="total"
        />
      ) : (
        <SeriesChart
          title={`${measure.label} by ${dimension.label}`}
          points={groups.map((g) => ({ key: g.key, label: g.label, value: g.value }))}
          color={seriesColor}
          mode={chartKind}
          formatValue={formatValue}
        />
      )}
    </div>
  );
}

export { shortDate };
