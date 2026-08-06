import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Icon } from "../lib/icons";
import { festivals, panchang } from "../data/content";
import { SacredBackground } from "../components/ui/SacredBackground";
import "../styles/festivals.css";

type CatFilter = "all" | "tyohar" | "vrat" | "jayanti";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function Festivals() {
  const [filter, setFilter] = useState<CatFilter>("all");

  // Group festivals by month (YYYY-MM format)
  const groupedFestivals = useMemo(() => {
    const grouped = new Map<number, typeof festivals>();

    festivals.forEach((f) => {
      // Apply filter
      if (filter !== "all" && f.cat !== filter) return;

      const dateObj = new Date(f.date);
      const monthIndex = dateObj.getMonth();

      if (!grouped.has(monthIndex)) {
        grouped.set(monthIndex, []);
      }
      grouped.get(monthIndex)!.push(f);
    });

    // Sort months, then sort within months
    const sortedMap = new Map(
      Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])
    );
    sortedMap.forEach((arr) => {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });

    return sortedMap;
  }, [filter]);

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ======================== HERO ======================== */}
        <section className="fc-hero">
          <div className="shell">
            <div className="fc-hero-inner text-c" style={{ padding: "80px 0 50px" }}>
              <span className="eyebrow" style={{ display: "inline-block", marginBottom: 16 }}>Hindu Calendar 2026</span>
              <h1 style={{ fontFamily: "var(--font-head)", fontSize: "clamp(2.4rem, 5vw, 3.8rem)", color: "var(--text)", marginBottom: 16 }}>
                Festivals & Vrats
              </h1>
              <p className="muted" style={{ fontSize: "1.1rem", maxWidth: 600, margin: "0 auto" }}>
                Auspicious dates, muhurats, and vrat timings for the year 2026. Stay connected to your spiritual roots.
              </p>
            </div>
          </div>
        </section>

        {/* ======================== MAIN CONTENT ======================== */}
        <section className="section" style={{ paddingTop: 10, paddingBottom: 60 }}>
          <div className="shell">
            <div className="fc-layout">
              
              {/* LEFT: MAIN LIST */}
              <div className="fc-main">
                
                {/* FILTERS */}
                <div className="fc-filters">
                  {[
                    { id: "all", label: "All" },
                    { id: "tyohar", label: "Major Tyohars" },
                    { id: "vrat", label: "Vrats & Fasts" },
                    { id: "jayanti", label: "Jayantis" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      className={`fc-filter-btn ${filter === f.id ? "active" : ""}`}
                      onClick={() => setFilter(f.id as CatFilter)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* FESTIVAL LIST BY MONTH */}
                <div className="fc-months">
                  {Array.from(groupedFestivals.entries()).length === 0 ? (
                    <div className="text-c muted" style={{ padding: "60px 20px" }}>
                      No festivals found for this category.
                    </div>
                  ) : (
                    Array.from(groupedFestivals.entries()).map(([monthIndex, items]) => (
                      <div className="fc-month-group" key={monthIndex} id={`month-${monthIndex}`}>
                        <div className="fc-month-header">
                          <h2 className="fc-month-title">{MONTH_NAMES[monthIndex]} 2026</h2>
                          <div className="fc-month-line" />
                        </div>
                        
                        <div className="fc-festival-list">
                          {items.map((f, i) => {
                            const dateObj = new Date(f.date);
                            const dayName = dateObj.toLocaleDateString("en-IN", { weekday: "long" });
                            const dayNum = dateObj.getDate();
                            
                            return (
                              <motion.div 
                                className="fc-fest-card" 
                                key={f.name + i}
                                initial={{ opacity: 0, y: 15 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                              >
                                <div className="fc-fest-datebox">
                                  <span className="fc-fest-dayname">{dayName}</span>
                                  <span className="fc-fest-daynum">{dayNum}</span>
                                </div>
                                
                                <div className="fc-fest-info">
                                  <h3 className="fc-fest-name">{f.name}</h3>
                                  <div className="fc-fest-meta">
                                    {f.tithi && <span className="fc-meta-item"><Icon name="moon" size={14} /> {f.tithi}</span>}
                                    {f.muhurat && <span className="fc-meta-item"><Icon name="clock" size={14} /> {f.muhurat}</span>}
                                  </div>
                                  <p className="fc-fest-note">{f.note}</p>
                                </div>

                                {f.serviceId && (
                                  <div className="fc-fest-action">
                                    <Link to={`/services/${f.serviceId}`} className="btn btn-outline btn-sm">
                                      Book Pandit
                                    </Link>
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RIGHT: SIDEBAR */}
              <aside className="fc-sidebar">
                <div className="fc-sidebar-card">
                  <h3 className="fc-sidebar-title">Today's Panchang</h3>
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

                <div className="fc-sidebar-card" style={{ background: "linear-gradient(135deg, #fffcf5, #fff8e7)", border: "1px dashed var(--gold)" }}>
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
