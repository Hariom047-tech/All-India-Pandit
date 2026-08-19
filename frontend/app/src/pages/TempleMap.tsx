import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { useTemples, useServices } from "../hooks/useData";
import { normTemples, normServices } from "../lib/normalize";
import { RatingCompact, RatingRow } from "../components/ui/StarRating";
import { Seo } from "../lib/Seo";

const W = 620, H = 700, PAD = 20;
const LAT0 = 37.2, LAT1 = 7.6, LNG0 = 67.6, LNG1 = 97.8;

function proj(lat: number, lng: number): [number, number] {
  return [
    PAD + ((lng - LNG0) / (LNG1 - LNG0)) * (W - PAD * 2),
    PAD + ((LAT0 - lat) / (LAT0 - LAT1)) * (H - PAD * 2),
  ];
}

const INDIA_OUTLINE: [number, number][] = [
  [34.5, 74.0], [35.5, 77.0], [34.0, 78.5], [32.5, 79.2], [30.4, 81.0], [28.5, 84.0],
  [27.0, 88.0], [27.3, 89.5], [26.8, 92.0], [27.8, 95.5], [27.0, 97.3], [25.5, 95.0],
  [24.0, 94.5], [23.0, 93.4], [22.0, 92.6], [23.5, 91.0], [25.2, 89.8], [26.5, 88.2],
  [25.0, 88.0], [23.0, 88.8], [21.5, 87.0], [19.8, 85.8], [17.7, 83.3], [16.0, 81.5],
  [13.1, 80.3], [11.0, 79.8], [9.3, 79.0], [8.1, 77.5], [9.0, 76.5], [11.5, 75.7],
  [13.5, 74.7], [15.5, 73.8], [18.9, 72.8], [21.5, 72.6], [20.9, 70.3], [22.3, 69.0],
  [23.0, 68.2], [23.9, 68.6], [24.4, 71.0], [26.0, 70.1], [28.0, 70.6], [29.5, 73.5],
  [32.0, 74.5],
];

const path = INDIA_OUTLINE.map(([lat, lng], i) => {
  const [x, y] = proj(lat, lng);
  return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(" ") + "Z";

export default function TempleMap() {
  const { data: rawTemples } = useTemples({ perPage: 50 });
  const { data: rawServices } = useServices();
  const temples = useMemo(() => normTemples(rawTemples), [rawTemples]);
  const services = useMemo(() => normServices(rawServices), [rawServices]);

  const [stateFilter, setStateFilter] = useState("");
  const [svcFilter, setSvcFilter] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pop, setPop] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Record<string, SVGGElement | null>>({});

  const usedStates = useMemo(() => [...new Set(temples.map(t => t.state))].sort(), [temples]);
  const usedServices = useMemo(() => services.filter(s => temples.some(t => t.services.includes(s.id))), [services, temples]);

  const list = useMemo(
    () => temples.filter((t) => (!stateFilter || t.state === stateFilter) && (!svcFilter || t.services.includes(svcFilter))),
    [temples, stateFilter, svcFilter],
  );

  const active = activeId ? temples.find((t) => t.id === activeId) : null;

  function openPop(id: string) {
    setActiveId(id);
    const wrap = wrapRef.current?.getBoundingClientRect();
    const mk = markerRefs.current[id]?.getBoundingClientRect();
    if (!wrap || !mk) return;
    const left = Math.min(Math.max(8, mk.left - wrap.left - 125), wrap.width - 258);
    const top = Math.min(mk.top - wrap.top + 22, wrap.height - 210);
    setPop({ left, top });
  }

  return (
    <>
      <Seo
        title="Temple Map — Explore Temples Across India"
        description="An interactive map of temples across India. Find one near you and see the Pandits and puja services associated with it."
        path="/temple-map"
      />
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tr" alt="" />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> Temple Map</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>Temple Map of Bharat</h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">Markers are placed from each temple's real coordinates. Click one to see who is available there.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="shell">
          <div className="result-bar">
            <span><strong>{list.length}</strong> temples on the map</span>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <label className="row" style={{ gap: 8 }}>
                <span className="muted">State</span>
                <select className="select" style={{ width: "auto", padding: "9px 40px 9px 14px" }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                  <option value="">All states</option>
                  {usedStates.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="row" style={{ gap: 8 }}>
                <span className="muted">Service</span>
                <select className="select" style={{ width: "auto", padding: "9px 40px 9px 14px" }} value={svcFilter} onChange={(e) => setSvcFilter(e.target.value)}>
                  <option value="">All services</option>
                  {usedServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="split split--narrow">
            <div
              className="map-wrap"
              id="mapWrap"
              ref={wrapRef}
              onClick={(e) => {
                if (!(e.target as Element).closest(".marker") && !(e.target as Element).closest(".map-pop")) {
                  setActiveId(null);
                  setPop(null);
                }
              }}
            >
              <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of listed temples across India">
                <defs>
                  <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
                    <path d="M40 0H0v40" fill="none" stroke="#e8d5b7" strokeWidth={0.6} />
                  </pattern>
                </defs>
                <rect width={W} height={H} fill="url(#grid)" opacity={0.5} />
                <path className="land" d={path} />
                {list.map((t) => {
                  const [x, y] = proj(t.lat, t.lng);
                  return (
                    <g
                      key={t.id}
                      ref={(el) => { markerRefs.current[t.id] = el; }}
                      className={`marker${activeId === t.id ? " is-active" : ""}`}
                      transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
                      role="button"
                      tabIndex={0}
                      aria-label={t.name}
                      onClick={(e) => { e.stopPropagation(); openPop(t.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPop(t.id); } }}
                    >
                      <circle className="pin" r={7} />
                      <circle className="pip" r={2.6} />
                    </g>
                  );
                })}
              </svg>

              {active && pop && (
                <div className="map-pop is-open" role="dialog" aria-label="Temple details" style={{ left: pop.left, top: pop.top }}>
                  <strong style={{ fontFamily: "var(--font-head)", fontSize: "1rem" }}>{active.name}</strong>
                  <span className="meta-line" style={{ marginTop: 5 }}><Icon name="map-pin" size={14} /> {active.city}, {active.state}</span>
                  <span className="row" style={{ marginTop: 8 }}><RatingRow rating={active.rating} /></span>
                  <span className="badge-gold" style={{ marginTop: 8 }}>{active.pandits} pandits available</span>
                  <Link className="btn btn-gold btn-sm btn-block" style={{ marginTop: 12 }} to={`/temples/${active.id}`}>Explore temple</Link>
                </div>
              )}

              <div className="map-legend">
                <span className="row" style={{ gap: 7 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--gold)", display: "inline-block" }} /> Listed temple</span>
                <span className="row" style={{ gap: 7 }}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#c0392b", display: "inline-block" }} /> Selected</span>
                <span className="muted">Outline is a simplified silhouette — see the note below.</span>
              </div>
            </div>

            <aside className="stack" style={{ gap: 12, maxHeight: 760, overflowY: "auto", paddingRight: 4 }} aria-label="Temple list">
              {list.map((t) => (
                <div key={t.id} className="map-item" role="button" tabIndex={0} aria-label={`Show ${t.name} on the map`} onClick={() => openPop(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPop(t.id); } }}>
                  <strong>{t.name}</strong>
                  <span className="meta-line" style={{ marginTop: 4 }}><Icon name="map-pin" size={14} /> {t.city}, {t.state}</span>
                  <span className="row" style={{ marginTop: 6 }}>
                    <RatingCompact rating={t.rating} />
                    <span className="badge-gold">{t.pandits} pandits</span>
                  </span>
                </div>
              ))}
            </aside>
          </div>

          <div className="usp-band" style={{ marginTop: 28 }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong style={{ fontFamily: "var(--font-head)", color: "var(--text)" }}>About this map:</strong>{" "}
              markers use each temple's actual latitude and longitude, so relative positions are correct. The country outline is a
              hand-simplified silhouette drawn from the same projection — it is deliberately not a survey-accurate boundary.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
