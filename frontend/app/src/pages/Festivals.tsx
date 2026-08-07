import { useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../lib/icons";
import { festivals, panchang } from "../data/content";
import { SacredBackground } from "../components/ui/SacredBackground";
import "../styles/festivals.css";

type CatFilter = "all" | "tyohar" | "vrat" | "jayanti";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/** Category badge colors */
const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  tyohar:  { bg: "linear-gradient(135deg, #FFF3E0, #FFE0B2)", text: "#E65100" },
  vrat:    { bg: "linear-gradient(135deg, #E8F5E9, #C8E6C9)", text: "#2E7D32" },
  jayanti: { bg: "linear-gradient(135deg, #E1F5FE, #B3E5FC)", text: "#01579B" },
};

export default function Festivals() {
  const [filter, setFilter] = useState<CatFilter>("all");
  const monthRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Group festivals by month
  const groupedFestivals = useMemo(() => {
    const grouped = new Map<number, typeof festivals>();

    festivals.forEach((f) => {
      if (filter !== "all" && f.cat !== filter) return;
      const dateObj = new Date(f.date);
      const monthIndex = dateObj.getMonth();
      if (!grouped.has(monthIndex)) grouped.set(monthIndex, []);
      grouped.get(monthIndex)!.push(f);
    });

    const sortedMap = new Map(
      Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])
    );
    sortedMap.forEach((arr) => {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });

    return sortedMap;
  }, [filter]);

  // All months that have festivals (for the horizontal month scroller)
  const activeMonths = Array.from(groupedFestivals.keys());

  const scrollToMonth = (mi: number) => {
    monthRefs.current[mi]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ======================== HERO ======================== */}
        <section className="fc-hero">
          <div className="shell">
            <div className="fc-hero-inner text-c" style={{ padding: "80px 0 36px" }}>
              <span className="fc-eyebrow">Hindu Calendar 2026</span>
              <h1 className="fc-title">Festivals & Vrats</h1>
              <p className="fc-subtitle">
                Auspicious dates, muhurats, and vrat timings for the year 2026.
              </p>
            </div>
          </div>
        </section>

        {/* ======================== MAIN CONTENT ======================== */}
        <section className="section" style={{ paddingTop: 0, paddingBottom: 60 }}>
          <div className="shell">

            {/* HORIZONTAL MONTH SCROLLER — quick jump to any month */}
            <div className="fc-month-scroller">
              {activeMonths.map((mi) => (
                <button
                  key={mi}
                  className="fc-month-pill"
                  onClick={() => scrollToMonth(mi)}
                >
                  {MONTH_SHORT[mi]}
                </button>
              ))}
            </div>

            {/* CATEGORY FILTERS */}
            <div className="fc-filters">
              {[
                { id: "all", label: "All", icon: "star" as const },
                { id: "tyohar", label: "Tyohars", icon: "calendar" as const },
                { id: "vrat", label: "Vrats", icon: "moon" as const },
                { id: "jayanti", label: "Jayantis", icon: "user" as const },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`fc-filter-btn ${filter === f.id ? "active" : ""}`}
                  onClick={() => setFilter(f.id as CatFilter)}
                >
                  <Icon name={f.icon} size={14} />
                  {f.label}
                </button>
              ))}
            </div>

            <div className="fc-layout">
              
              {/* LEFT: MAIN LIST */}
              <div className="fc-main">

                {/* FESTIVAL GRID BY MONTH */}
                <div className="fc-months">
                  {Array.from(groupedFestivals.entries()).length === 0 ? (
                    <div className="text-c muted" style={{ padding: "60px 20px" }}>
                      No festivals found for this category.
                    </div>
                  ) : (
                    Array.from(groupedFestivals.entries()).map(([monthIndex, items]) => (
                      <div
                        className="fc-month-group"
                        key={monthIndex}
                        id={`month-${monthIndex}`}
                        ref={(el) => { monthRefs.current[monthIndex] = el; }}
                      >
                        <div className="fc-month-header">
                          <div className="fc-month-icon">
                            <Icon name="calendar" size={18} />
                          </div>
                          <h2 className="fc-month-title">{MONTH_NAMES[monthIndex]} 2026</h2>
                          <div className="fc-month-line" />
                          <span className="fc-month-count">{items.length}</span>
                        </div>

                        {/* 2-COLUMN CARD GRID on mobile */}
                        <div className="fc-card-grid">
                          <AnimatePresence mode="popLayout">
                            {items.map((f, i) => {
                              const dateObj = new Date(f.date);
                              const dayName = dateObj.toLocaleDateString("en-IN", { weekday: "short" });
                              const dayNum = dateObj.getDate();
                              const catColor = (f.cat ? CAT_COLORS[f.cat] : CAT_COLORS.tyohar) || CAT_COLORS.tyohar;

                              return (
                                <motion.div
                                  className={`fc-card ${f.img ? "fc-card--has-img" : ""}`}
                                  key={f.name + i}
                                  layout
                                  initial={{ opacity: 0, scale: 0.92 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.92 }}
                                  transition={{ duration: 0.25, delay: i * 0.04 }}
                                >
                                  {/* Festival image (if any) */}
                                  {f.img && (
                                    <div className="fc-card__img-wrap">
                                      <img src={f.img} alt={f.name} className="fc-card__img" loading="lazy" />
                                      <div className="fc-card__img-overlay" />
                                    </div>
                                  )}

                                  <div className="fc-card__body">
                                    {/* Date badge */}
                                    <div className="fc-card__date-badge">
                                      <span className="fc-card__day-name">{dayName}</span>
                                      <span className="fc-card__day-num">{dayNum}</span>
                                    </div>

                                    {/* Category tag */}
                                    <span
                                      className="fc-card__cat"
                                      style={{ background: catColor.bg, color: catColor.text }}
                                    >
                                      {f.cat === "tyohar" ? "त्योहार" : f.cat === "vrat" ? "व्रत" : "जयंती"}
                                    </span>

                                    {/* Name */}
                                    <h3 className="fc-card__name">{f.name}</h3>

                                    {/* Meta info */}
                                    {f.tithi && (
                                      <p className="fc-card__tithi">
                                        <Icon name="moon" size={12} />
                                        {f.tithi}
                                      </p>
                                    )}

                                    {f.muhurat && (
                                      <p className="fc-card__muhurat">
                                        <Icon name="clock" size={12} />
                                        {f.muhurat}
                                      </p>
                                    )}

                                    {f.note && <p className="fc-card__note">{f.note}</p>}

                                    {/* Book button */}
                                    {f.serviceId && (
                                      <Link to={`/services/${f.serviceId}`} className="fc-card__book-btn">
                                        Book Pandit
                                      </Link>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RIGHT: SIDEBAR */}
              <aside className="fc-sidebar">
                <div className="fc-sidebar-card glass">
                  <h3 className="fc-sidebar-title">
                    <Icon name="moon" size={18} /> Today's Panchang
                  </h3>
                  <div className="fc-panchang-row">
                    <span>Tithi</span>
                    <strong>{panchang.tithi}</strong>
                  </div>
                  <div className="fc-panchang-row">
                    <span>Nakshatra</span>
                    <strong>{panchang.nakshatra}</strong>
                  </div>
                  <div className="fc-panchang-row">
                    <span>Yoga</span>
                    <strong>{panchang.yoga}</strong>
                  </div>
                  <Link to="/panchang" className="btn btn-gold btn-block" style={{ marginTop: 20 }}>
                    <Icon name="calendar" size={16} /> View Full Panchang
                  </Link>
                </div>

                <div className="fc-sidebar-card fc-sidebar-card--cta">
                  <h3 className="fc-sidebar-title" style={{ color: "var(--gold-deep)" }}>Need a Pandit Ji?</h3>
                  <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 16 }}>
                    Book verified Vedic pandits for any festival, vrat, or special occasion.
                  </p>
                  <Link to="/services" className="btn btn-outline btn-block">
                    Explore All Services
                  </Link>
                </div>
              </aside>

            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
