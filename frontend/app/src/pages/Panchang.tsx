import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { panchang, festivals, services, cities, service as getService } from "../data/content";

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function Panchang() {
  const today = useMemo(() => new Date(), []);
  const pgDate = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const [mfService, setMfService] = useState(services[0].id);
  const [mfDate, setMfDate] = useState("");
  const [mfCity, setMfCity] = useState(cities[0]);
  const [result, setResult] = useState<{ s: typeof services[0]; when: string; city: string } | null>(null);

  const cal = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const prevDim = new Date(y, m, 0).getDate();
    const cells: { label: number; out?: boolean; today?: boolean; fest?: string }[] = [];
    for (let i = first - 1; i >= 0; i--) cells.push({ label: prevDim - i, out: true });
    for (let d = 1; d <= dim; d++) {
      const fest = festivals.find((f) => f.date === toISO(y, m, d));
      const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      cells.push({ label: d, today: isToday, fest: fest?.name });
    }
    const tail = (7 - ((first + dim) % 7)) % 7;
    for (let k = 1; k <= tail; k++) cells.push({ label: k, out: true });
    const monthFests = festivals.filter((f) => {
      const fd = new Date(f.date);
      return fd.getMonth() === m && fd.getFullYear() === y;
    });
    return { cells, monthFests, label: cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }, [cursor, today]);

  function onFind(e: React.FormEvent) {
    e.preventDefault();
    const s = getService(mfService)!;
    setResult({ s, when: mfDate, city: mfCity });
    setTimeout(() => document.getElementById("mfResult")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  }

  return (
    <>
      <section className="page-hero">
        <img src="/assets/img/mandala.svg" className="watermark watermark--tl" alt="" />
        <img src="/assets/img/mandala.svg" className="watermark watermark--tr" alt="" />
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link> <span>/</span> Panchang</nav>
          <h1 className="section-title" style={{ marginTop: 10 }}>Panchang &amp; Muhurat</h1>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub"><strong>{pgDate}</strong></p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 44 }}>
        <div className="shell">
          <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.4rem,2.4vw,1.9rem)" }}>Aaj ka Panchang</h2>
          <div className="panchang-grid" style={{ marginTop: 22 }}>
            {[["Tithi", panchang.tithi], ["Nakshatra", panchang.nakshatra], ["Yoga", panchang.yoga], ["Karana", panchang.karana], ["Paksha", panchang.paksha], ["Vaar", panchang.vaar], ["Masa", panchang.masa], ["Ritu", panchang.ritu], ["Vikram Samvat", panchang.vikram], ["Shaka Samvat", panchang.shaka]].map(([k, v]) => (
              <div className="pg-item" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
            ))}
          </div>
          <div className="panchang-grid" style={{ marginTop: 16 }}>
            {[["sun", "Sunrise", panchang.sunrise], ["moon", "Sunset", panchang.sunset], ["moon", "Moonrise", panchang.moonrise], ["moon", "Moonset", panchang.moonset]].map(([icon, k, v]) => (
              <div className="pg-item" key={k as string}><div className="k"><Icon name={icon as string} size={13} /> {k}</div><div className="v">{v}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--cream" style={{ paddingTop: 56 }}>
        <div className="shell grid g-2" style={{ alignItems: "start" }}>
          <div className="card card-pad">
            <h3 style={{ fontSize: "1.24rem", color: "var(--gold-deep)" }}>Shubh Muhurat — auspicious</h3>
            <div style={{ marginTop: 10 }}>
              {panchang.auspicious.map((m) => <div className="muhurat-row" key={m.k}><span>{m.k}</span><span className="time-chip">{m.v}</span></div>)}
            </div>
          </div>
          <div className="card card-pad">
            <h3 style={{ fontSize: "1.24rem", color: "#9c3b2e" }}>Ashubh Kaal — avoid</h3>
            <div style={{ marginTop: 10 }}>
              {panchang.inauspicious.map((m) => <div className="muhurat-row" key={m.k}><span>{m.k}</span><span className="time-chip time-chip--bad">{m.v}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2 className="section-title">Shubh Muhurat Finder</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">Pick the ritual, the date and your city — we show the auspicious windows and the pandits who can perform it.</p>

          <form className="card card-pad" style={{ maxWidth: 820, margin: "32px auto 0" }} onSubmit={onFind}>
            <div className="grid g-3" style={{ gap: 16 }}>
              <div>
                <label className="label" htmlFor="mfService">Ritual / ceremony</label>
                <select className="select" id="mfService" value={mfService} onChange={(e) => setMfService(e.target.value)}>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="mfDate">Date</label>
                <input className="input" id="mfDate" type="date" value={mfDate} onChange={(e) => setMfDate(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="mfCity">City</label>
                <select className="select" id="mfCity" value={mfCity} onChange={(e) => setMfCity(e.target.value)}>
                  {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 20 }}>Find shubh muhurat</button>
          </form>

          {result && (
            <div style={{ maxWidth: 820, margin: "0 auto" }} id="mfResult">
              <div className="card card-pad card--cream" style={{ marginTop: 22 }}>
                <h3 style={{ fontSize: "1.16rem" }}>Shubh muhurat for {result.s.name}</h3>
                <p className="muted" style={{ margin: "6px 0 14px" }}>{result.when ? new Date(result.when).toDateString() : "Today"} · {result.city} · duration {result.s.dur}</p>
                {panchang.auspicious.slice(0, 3).map((m) => <div className="muhurat-row" key={m.k}><span>{m.k}</span><span className="time-chip">{m.v}</span></div>)}
                <div className="muhurat-row"><span>Avoid — Rahu Kaal</span><span className="time-chip time-chip--bad">{panchang.inauspicious[0].v}</span></div>
                <Link className="btn btn-gold" style={{ marginTop: 18 }} to={`/pandits?service=${result.s.id}`}><Icon name="users" size={17} /> Find pandits for {result.s.name}</Link>
                <p className="form-note">Indicative timings. A jyotish-trained pandit ji will refine this against your janm kundali and exact location.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section section--cream">
        <div className="shell split split--wide">
          <div className="card card-pad">
            <div className="row-between" style={{ marginBottom: 16 }}>
              <button className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
              <h3 style={{ fontSize: "1.2rem" }}>{cal.label}</h3>
              <button className="btn btn-ghost btn-sm" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
            </div>
            <div className="cal">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="cal-h" key={d}>{d}</div>)}
              {cal.cells.map((c, i) => (
                <div key={i} className={`cal-d${c.out ? " is-out" : ""}${c.today ? " is-today" : ""}`} title={c.fest}>
                  {c.label}
                  {c.fest && <span className="fest-dot" />}
                </div>
              ))}
            </div>
            <p className="form-note">A gold dot marks a festival or vrat day.</p>
          </div>
          <div className="card card-pad">
            <h3 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Festivals this month</h3>
            {cal.monthFests.length
              ? cal.monthFests.map((f) => (
                  <div className="muhurat-row" key={f.name}>
                    <span><strong style={{ fontFamily: "var(--font-head)" }}>{f.name}</strong><span className="muted" style={{ display: "block", fontSize: ".82rem" }}>{f.note}</span></span>
                    <span className="time-chip">{f.label}</span>
                  </div>
                ))
              : <p className="muted">No major festival listed this month.</p>}
            <Link className="btn btn-outline btn-block" to="/services?cat=festival" style={{ marginTop: 20 }}>Festival pujas</Link>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="shell">
          <div className="usp-band">
            <p className="muted" style={{ margin: 0 }}>
              <strong style={{ fontFamily: "var(--font-head)", color: "var(--text)" }}>A note on accuracy:</strong>{" "}
              panchang timings shift with your exact latitude, longitude and sunrise. The figures here are indicative for planning.
              For a sankalp-level muhurat, speak to a jyotish-trained pandit ji —{" "}
              <Link to="/pandits?service=kundali" style={{ color: "var(--gold-deep)", fontWeight: 600 }}>see who offers kundali consultation</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
