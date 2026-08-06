import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { panchang, festivals, services, cities, service as getService } from "../data/content";
import { useLang } from "../lib/i18n";
import "../styles/panchang.css";

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function Panchang() {
  const { t } = useLang();
  const today = useMemo(() => new Date(), []);
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow" | "custom">("today");
  const [customDate, setCustomDate] = useState("");
  const [selectedCity, setSelectedCity] = useState("Varanasi");
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [mfService, setMfService] = useState(services[0].id);
  const [mfDate, setMfDate] = useState("");
  const [mfCity, setMfCity] = useState(cities[0]);
  const [result, setResult] = useState<{ s: typeof services[0]; when: string; city: string } | null>(null);

  /* Choghadiya data — quality/name kept as translation keys so the table
     re-renders in Hindi without duplicating the time-slot data */
  const dayChoghadiya = [
    { time: "05:58 – 07:29", name: "Amrit", qualityKey: "qualityExcellent", type: "good" },
    { time: "07:29 – 09:00", name: "Kaal", qualityKey: "qualityInauspicious", type: "bad" },
    { time: "09:00 – 10:31", name: "Shubh", qualityKey: "qualityGood", type: "good" },
    { time: "10:31 – 12:02", name: "Rog", qualityKey: "qualityInauspicious", type: "bad" },
    { time: "12:02 – 13:33", name: "Udveg", qualityKey: "qualityInauspicious", type: "bad" },
    { time: "13:33 – 15:04", name: "Char", qualityKey: "qualityGood", type: "good" },
    { time: "15:04 – 16:35", name: "Labh", qualityKey: "qualityGood", type: "good" },
    { time: "16:35 – 19:04", name: "Amrit", qualityKey: "qualityExcellent", type: "good" },
  ];
  const nightChoghadiya = [
    { time: "19:04 – 20:35", name: "Rog", qualityKey: "qualityInauspicious", type: "bad" },
    { time: "20:35 – 22:06", name: "Kaal", qualityKey: "qualityInauspicious", type: "bad" },
    { time: "22:06 – 23:37", name: "Labh", qualityKey: "qualityGood", type: "good" },
    { time: "23:37 – 01:08", name: "Udveg", qualityKey: "qualityInauspicious", type: "bad" },
    { time: "01:08 – 02:39", name: "Shubh", qualityKey: "qualityGood", type: "good" },
    { time: "02:39 – 04:10", name: "Amrit", qualityKey: "qualityExcellent", type: "good" },
    { time: "04:10 – 05:41", name: "Char", qualityKey: "qualityGood", type: "good" },
    { time: "05:41 – 05:58", name: "Rog", qualityKey: "qualityInauspicious", type: "bad" },
  ];

  const additionalDetails = [
    { label: t("panchang.detailPaksha"), value: panchang.paksha },
    { label: t("panchang.detailMasa"), value: panchang.masa },
    { label: t("panchang.detailRitu"), value: panchang.ritu },
    { label: t("panchang.detailVikram"), value: panchang.vikram },
    { label: t("panchang.detailShaka"), value: panchang.shaka },
    { label: t("panchang.detailPurnimant"), value: t("panchang.monthShravan") },
    { label: t("panchang.detailAmant"), value: t("panchang.monthShravan") },
    { label: t("panchang.detailSunSign"), value: t("panchang.rashiKarka") },
    { label: t("panchang.detailMoonSign"), value: t("panchang.rashiVrishchik") },
  ];

  const displayDate = useMemo(() => {
    if (activeTab === "tomorrow") { const t = new Date(today); t.setDate(t.getDate() + 1); return t; }
    if (activeTab === "custom" && customDate) return new Date(customDate + "T00:00:00");
    return today;
  }, [activeTab, customDate, today]);

  const formattedDate = displayDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const cal = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
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
    const monthFests = festivals.filter((f) => { const fd = new Date(f.date); return fd.getMonth() === m && fd.getFullYear() === y; });
    return { cells, monthFests, label: cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }, [cursor, today]);

  function onFind(e: React.FormEvent) {
    e.preventDefault();
    const s = getService(mfService)!;
    setResult({ s, when: mfDate, city: mfCity });
    setTimeout(() => document.getElementById("mfResult")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  }

  function ChoghadiyaTable({ data, title, icon }: { data: typeof dayChoghadiya; title: string; icon: string }) {
    return (
      <div className="panch-choghadiya">
        <h4 className="panch-choghadiya__subtitle"><Icon name={icon} size={18} /> {title}</h4>
        <div className="panch-choghadiya__table-wrap glass">
          <table className="panch-choghadiya__table">
            <thead><tr><th>#</th><th>{t("panchang.colTime")}</th><th>{t("panchang.colChoghadiya")}</th><th>{t("panchang.colQuality")}</th></tr></thead>
            <tbody>
              {data.map((row, i) => (
                <tr className="panch-choghadiya__row" key={i}>
                  <td>{i + 1}</td>
                  <td>{row.time}</td>
                  <td className={`panch-choghadiya__cell--${row.type}`}>{row.name}</td>
                  <td><span className={`panch-choghadiya__quality panch-choghadiya__quality--${row.type}`}>{t(`panchang.${row.qualityKey}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="panch-page">
      <div className="panch-page__bg" />

      {/* ═══════ TITLE ═══════ */}
      <div className="panch-top">
        <div className="shell" style={{ textAlign: "center" }}>
          <span className="panch-top__eyebrow">{t("panchang.eyebrow")}</span>
          <h1 className="panch-top__title">{t("panchang.title")}</h1>
        </div>
      </div>

      {/* ═══════ BENTO DASHBOARD ═══════ */}
      <div className="panch-bento">
        <div className="shell">
          {/* Top row: Hero + Sun/Moon */}
          <div className="panch-bento__main">
            {/* Left: Date, Samvat & Nav */}
            <div className="panch-hero-card glass">
              <div className="panch-hero-card__samvat">{panchang.vikram}</div>
              <div className="panch-hero-card__date">{formattedDate}</div>
              <div className="panch-hero-card__location">
                <Icon name="map-pin" size={14} />
                <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                  {cities.map((c) => <option key={c} value={c}>{c}, India</option>)}
                </select>
              </div>
              <div className="panch-hero-card__nav">
                <button className={`panch-hero-card__nav-btn${activeTab === "today" ? " active" : ""}`} onClick={() => setActiveTab("today")}>{t("panchang.today")}</button>
                <button className={`panch-hero-card__nav-btn${activeTab === "tomorrow" ? " active" : ""}`} onClick={() => setActiveTab("tomorrow")}>{t("panchang.tomorrow")}</button>
                <button className={`panch-hero-card__nav-btn${activeTab === "custom" ? " active" : ""}`} onClick={() => setActiveTab("custom")}>
                  {t("panchang.pickDate")}
                  {activeTab === "custom" && (
                    <input type="date" className="panch-hero-card__date-input" value={customDate} onChange={(e) => setCustomDate(e.target.value)} onClick={(e) => e.stopPropagation()} />
                  )}
                </button>
              </div>
              <div className="panch-hero-card__details">
                <div className="panch-hero-card__detail">
                  <span className="panch-hero-card__detail-label">{t("panchang.masa")}</span>
                  <span className="panch-hero-card__detail-value">{panchang.masa}</span>
                </div>
                <div className="panch-hero-card__detail">
                  <span className="panch-hero-card__detail-label">{t("panchang.paksha")}</span>
                  <span className="panch-hero-card__detail-value">{panchang.paksha}</span>
                </div>
                <div className="panch-hero-card__detail">
                  <span className="panch-hero-card__detail-label">{t("panchang.ritu")}</span>
                  <span className="panch-hero-card__detail-value">{panchang.ritu}</span>
                </div>
                <div className="panch-hero-card__detail">
                  <span className="panch-hero-card__detail-label">{t("panchang.shakaSamvat")}</span>
                  <span className="panch-hero-card__detail-value">{panchang.shaka}</span>
                </div>
              </div>
            </div>

            {/* Right: Sun & Moon Timings */}
            <div className="panch-sun-moon glass">
              <div className="panch-sun-moon__title">{t("panchang.sunMoonTimings")}</div>
              {[
                { label: t("panchang.sunrise"), time: panchang.sunrise, icon: "sun", mod: "sunrise" },
                { label: t("panchang.sunset"), time: panchang.sunset, icon: "sun", mod: "sunset" },
                { label: t("panchang.moonrise"), time: panchang.moonrise, icon: "moon", mod: "moonrise" },
                { label: t("panchang.moonset"), time: panchang.moonset, icon: "moon", mod: "moonset" },
              ].map((item) => (
                <div className="panch-sun-moon__item" key={item.label}>
                  <div className={`panch-sun-moon__icon panch-sun-moon__icon--${item.mod}`}>
                    <Icon name={item.icon} size={18} />
                  </div>
                  <div>
                    <div className="panch-sun-moon__label">{item.label}</div>
                    <div className="panch-sun-moon__time">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Five Panchang Elements */}
          <div className="panch-five-row">
            {[
              { icon: "calendar", label: t("panchang.tithi"), value: panchang.tithi, time: "05:58 AM – 03:26 AM" },
              { icon: "star", label: t("panchang.nakshatra"), value: panchang.nakshatra, time: "12:14 AM – 01:48 AM+" },
              { icon: "sparkles", label: t("panchang.yoga"), value: panchang.yoga, time: "08:02 AM – 06:36 AM+" },
              { icon: "om", label: t("panchang.karana"), value: panchang.karana, time: "05:58 AM – 04:12 PM" },
              { icon: "sun", label: t("panchang.vaar"), value: panchang.vaar, time: t("panchang.fullDay") },
            ].map((item) => (
              <div className="panch-five-card glass" key={item.label}>
                <div className="panch-five-card__icon"><Icon name={item.icon} size={20} /></div>
                <div className="panch-five-card__label">{item.label}</div>
                <div className="panch-five-card__value">{item.value}</div>
                <div className="panch-five-card__time">{item.time}</div>
              </div>
            ))}
          </div>

          {/* Auspicious / Inauspicious */}
          <div className="panch-timings-row">
            <div className="panch-timing-card panch-timing-card--good glass">
              <div className="panch-timing-card__header">
                <Icon name="check-circle" size={18} /> {t("panchang.auspiciousTimings")}
              </div>
              <div className="panch-timing-card__body">
                {panchang.auspicious.map((m) => (
                  <div className="panch-timing-row" key={m.k}>
                    <span className="panch-timing-row__name">{m.k}</span>
                    <span className="panch-timing-row__time panch-timing-row__time--good">{m.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panch-timing-card panch-timing-card--bad glass">
              <div className="panch-timing-card__header">
                <Icon name="alert-circle" size={18} /> {t("panchang.inauspiciousTimings")}
              </div>
              <div className="panch-timing-card__body">
                {panchang.inauspicious.map((m) => (
                  <div className="panch-timing-row" key={m.k}>
                    <span className="panch-timing-row__name">{m.k}</span>
                    <span className="panch-timing-row__time panch-timing-row__time--bad">{m.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ ADDITIONAL DETAILS ═══════ */}
      <div className="panch-section">
        <div className="shell">
          <h2 className="panch-section__title">{t("panchang.calendarDetailsTitle")}</h2>
          <p className="panch-section__sub">{t("panchang.calendarDetailsSub")}</p>
          <div className="panch-details-grid">
            {additionalDetails.map((d) => (
              <div className="panch-detail-item glass" key={d.label}>
                <div className="panch-detail-item__label">{d.label}</div>
                <div className="panch-detail-item__value">{d.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ CHOGHADIYA ═══════ */}
      <div className="panch-section">
        <div className="shell">
          <h2 className="panch-section__title">{t("panchang.choghadiyaTitle")}</h2>
          <p className="panch-section__sub">{t("panchang.choghadiyaSub")}</p>
          <ChoghadiyaTable data={dayChoghadiya} title={t("panchang.dayChoghadiya")} icon="sun" />
          <ChoghadiyaTable data={nightChoghadiya} title={t("panchang.nightChoghadiya")} icon="moon" />
        </div>
      </div>

      {/* ═══════ CALENDAR + FESTIVALS ═══════ */}
      <div className="panch-section">
        <div className="shell">
          <h2 className="panch-section__title">{t("panchang.calendarTitle")}</h2>
          <p className="panch-section__sub">{t("panchang.calendarSub")}</p>
          <div className="panch-cal-wrap">
            <div className="panch-calendar glass">
              <div className="panch-calendar__header">
                <button className="panch-calendar__nav-btn" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                  <Icon name="chevron-left" size={14} />
                </button>
                <h3>{cal.label}</h3>
                <button className="panch-calendar__nav-btn" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>
              <div className="panch-calendar__grid">
                {[t("panchang.daySun"), t("panchang.dayMon"), t("panchang.dayTue"), t("panchang.dayWed"), t("panchang.dayThu"), t("panchang.dayFri"), t("panchang.daySat")].map((d) => (
                  <div className="panch-calendar__day-header" key={d}>{d}</div>
                ))}
                {cal.cells.map((c, i) => (
                  <div key={i} className={`panch-calendar__day${c.out ? " panch-calendar__day--outside" : ""}${c.today ? " panch-calendar__day--today" : ""}${c.fest ? " panch-calendar__day--festival" : ""}`} title={c.fest}>
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="panch-fest-sidebar glass">
              <h3>{t("panchang.festivalsThisMonth")}</h3>
              {cal.monthFests.length
                ? cal.monthFests.map((f) => (
                    <div className="panch-fest-row" key={f.name}>
                      <div>
                        <div className="panch-fest-row__name">{f.name}</div>
                        <div className="panch-fest-row__note">{f.note}</div>
                      </div>
                      <span className="panch-fest-row__date">{f.label}</span>
                    </div>
                  ))
                : <p style={{ color: "var(--text-2)" }}>{t("panchang.noFestivalThisMonth")}</p>}
              <Link className="btn btn-outline btn-block" to="/services?cat=festival" style={{ marginTop: 16 }}>
                {t("panchang.festivalPujas")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ MUHURAT FINDER ═══════ */}
      <div className="panch-section">
        <div className="shell">
          <h2 className="panch-section__title" style={{ textAlign: "center" }}>{t("panchang.muhuratFinderTitle")}</h2>
          <p className="panch-section__sub" style={{ textAlign: "center" }}>{t("panchang.muhuratFinderSub")}</p>
          <div className="panch-finder glass">
            <form className="panch-finder__form" onSubmit={onFind}>
              <div>
                <label htmlFor="mfService">{t("panchang.ritualCeremony")}</label>
                <select id="mfService" value={mfService} onChange={(e) => setMfService(e.target.value)}>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mfDate">{t("panchang.date")}</label>
                <input type="date" id="mfDate" value={mfDate} onChange={(e) => setMfDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mfCity">{t("panchang.city")}</label>
                <select id="mfCity" value={mfCity} onChange={(e) => setMfCity(e.target.value)}>
                  {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </form>
            <button className="btn btn-gold btn-block" type="button" onClick={onFind} style={{ marginTop: 16 }}>
              <Icon name="search" size={16} /> {t("panchang.findMuhurat")}
            </button>
            {result && (
              <div className="panch-finder__result" id="mfResult">
                <h3 style={{ fontSize: "1.1rem", fontFamily: "var(--font-head)", color: "var(--gold-deep)", marginBottom: 8 }}>
                  {t("panchang.muhuratFor", { service: result.s.name })}
                </h3>
                <p style={{ color: "var(--text-2)", margin: "4px 0 12px", fontSize: "0.88rem" }}>
                  {result.when ? new Date(result.when).toDateString() : t("panchang.today")} · {result.city} · {t("panchang.duration")}: {result.s.dur}
                </p>
                {panchang.auspicious.slice(0, 3).map((m) => (
                  <div className="panch-timing-row" key={m.k}>
                    <span className="panch-timing-row__name">{m.k}</span>
                    <span className="panch-timing-row__time panch-timing-row__time--good">{m.v}</span>
                  </div>
                ))}
                <div className="panch-timing-row">
                  <span className="panch-timing-row__name">{t("panchang.avoidRahuKaal")}</span>
                  <span className="panch-timing-row__time panch-timing-row__time--bad">{panchang.inauspicious[0].v}</span>
                </div>
                <Link className="btn btn-gold" style={{ marginTop: 14 }} to={`/pandits?service=${result.s.id}`}>
                  <Icon name="users" size={16} /> {t("panchang.findPanditsFor", { service: result.s.name })}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ NOTE ═══════ */}
      <div className="panch-section">
        <div className="shell">
          <div className="panch-note glass">
            <strong>{t("panchang.accuracyNoteTitle")}</strong>{" "}
            {t("panchang.accuracyNoteText")}{" "}
            <Link to="/pandits?service=kundali" style={{ color: "var(--gold-deep)", fontWeight: 600 }}>
              {t("panchang.accuracyNoteLink")}
            </Link>.
          </div>
        </div>
      </div>
    </div>
  );
}
