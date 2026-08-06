import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../lib/icons";
import { services, panditsForService, templesForService, panchang } from "../data/content";
import { getServiceMeta } from "../data/serviceMeta";
import { PanditCard } from "../components/ui/PanditCard";
import { ServiceCard } from "../components/ui/ServiceCard";
import { EmptyState } from "../components/ui/ReviewCard";
import { useEnquiryModal } from "../components/ui/EnquiryModal";
import { SacredBackground } from "../components/ui/SacredBackground";

type Tab = "overview" | "samagri" | "muhurat" | "pandits" | "reviews";

export default function ServiceDetail() {
  const { id } = useParams();
  const s = services.find((x) => x.id === id) || services[0];
  const openEnquiry = useEnquiryModal();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    document.title = `${s.name} — PanditSuggest`;
  }, [s]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 620);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 620);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const pandits = panditsForService(s.id);
  const temples = templesForService(s.id);
  const allRelated = services.filter((x) => x.id !== s.id && x.cat === s.cat);
  const related = allRelated.slice(0, isMobile ? 6 : 4);
  const hasMoreRelated = allRelated.length > (isMobile ? 6 : 4);
  const meta = getServiceMeta(s.id);

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "pandits", label: "Pandits" },
    { key: "samagri", label: "Samagri" },
    { key: "muhurat", label: "Muhurat" },
    { key: "reviews", label: "Reviews" },
  ];

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ======================== SPLIT HERO ======================== */}
        <section className="sd-hero">
          <div className="shell">
            <div className="sd-hero__grid">
              {/* Left: Image */}
              <div className="sd-hero__img-wrap">
                <img src={meta.heroImg} alt={s.name} className="sd-hero__img" />
                <div className="sd-hero__img-overlay" />
              </div>

              {/* Right: Info Card */}
              <div className="sd-hero__info">
                <h1 className="sd-hero__title">{s.name}</h1>
                <div className="sd-hero__rating">
                  <span className="sd-hero__star">★</span>
                  <strong>4.9</strong>
                  <span className="sd-hero__reviews">(2,450+ reviews)</span>
                </div>
                <p className="sd-hero__tagline">{meta.tagline}</p>

                <div className="sd-hero__highlights">
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">⏱</span>
                    <span>Duration: {s.dur}</span>
                  </div>
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">📿</span>
                    <span>Complete Samagri Kit Included</span>
                  </div>
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">🔥</span>
                    <span>Includes Havan & Vastu Shanti</span>
                  </div>
                  <div className="sd-hero__hl-row">
                    <span className="sd-hero__hl-icon">👨‍🦳</span>
                    <span>Verified Vedic Pandits</span>
                  </div>
                </div>

                <button
                  className="sd-hero__cta"
                  onClick={() => openEnquiry({ service: s.id })}
                >
                  Connect with Pandit — Free Consultation
                </button>
                <p className="sd-hero__cta-sub">{s.pandits} verified pandits available near you</p>
              </div>
            </div>
          </div>
        </section>

        {/* ======================== TAB NAV ======================== */}
        <nav className="sd-tabs">
          <div className="shell">
            <div className="sd-tabs__list">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`sd-tabs__btn ${activeTab === t.key ? "sd-tabs__btn--active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* ======================== TAB CONTENT ======================== */}

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell sd-content-grid">
              <div className="sd-main">
                {/* Spiritual Significance */}
                <div className="sd-card">
                  <h2 className="sd-card__title">
                    <span className="sd-card__title-icon">🕉️</span>
                    Spiritual Significance
                  </h2>
                  <p className="sd-card__text">{s.desc}</p>
                  <p className="sd-card__text" style={{ marginTop: 12 }}>
                    This sacred ceremony has been performed for centuries in the Hindu tradition. It is believed to purify the space, remove negative energies, and invite divine blessings for everyone involved. The mantras chanted during the puja create powerful vibrations that bring peace and positive energy.
                  </p>
                </div>

                {/* Benefits — Premium Scroll Strip */}
                <div className="sd-benefits-section">
                  <div className="sd-benefits-header">
                    <h2 className="sd-card__title" style={{ margin: 0 }}>
                      <span className="sd-card__title-icon">✨</span>
                      Benefits
                    </h2>
                    <span className="sd-benefits-count">{meta.benefits.length} blessings</span>
                  </div>
                  <div className="sd-benefits-strip">
                    {meta.benefits.map((b) => (
                      <div className="sd-benefit-chip" key={b.title}>
                        <div className="sd-benefit-chip__glow" />
                        <div className="sd-benefit-chip__icon">{b.icon}</div>
                        <span className="sd-benefit-chip__label">{b.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Puja Process — Sacred Journey Timeline ── */}
                <div className="sd-journey-wrap">
                  {/* Warm cream + golden glow background */}
                  <div className="sd-journey-bg" />
                  <div className="sd-journey-glow" />

                  <div className="sd-journey-head">
                    <span className="sd-journey-head__icon">🪔</span>
                    <div>
                      <h2 className="sd-journey-title">Sacred Journey</h2>
                      <p className="sd-journey-sub">{meta.process.length} steps · Complete Vidhi</p>
                    </div>
                  </div>

                  <div className="sd-journey-steps">
                    {meta.process.map((p, i) => (
                      <motion.div
                        className="sd-journey-step"
                        key={p.step}
                        initial={{ opacity: 0, x: -28 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-30px" }}
                        transition={{ duration: 0.55, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {/* Connector line */}
                        {i < meta.process.length - 1 && (
                          <motion.div
                            className="sd-journey-connector"
                            initial={{ scaleY: 0 }}
                            whileInView={{ scaleY: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: i * 0.12 + 0.3 }}
                            style={{ transformOrigin: "top" }}
                          />
                        )}

                        {/* Badge */}
                        <motion.div
                          className="sd-journey-badge"
                          initial={{ scale: 0, rotate: -30 }}
                          whileInView={{ scale: 1, rotate: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.12, type: "spring", stiffness: 200 }}
                        >
                          <span className="sd-journey-badge__num">{p.step}</span>
                          <div className="sd-journey-badge__ring" />
                        </motion.div>

                        {/* Content card */}
                        <motion.div
                          className="sd-journey-card"
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: i * 0.12 + 0.1 }}
                          whileHover={{ scale: 1.02 }}
                        >
                          <h4 className="sd-journey-card__title">{p.title}</h4>
                          <p className="sd-journey-card__desc">{p.desc}</p>
                          <span className="sd-journey-card__step-label">Step {p.step} of {meta.process.length}</span>
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* FAQ */}
                <div className="sd-card">
                  <h2 className="sd-card__title">
                    <span className="sd-card__title-icon">❓</span>
                    Frequently Asked Questions
                  </h2>
                  <div className="sd-faq">
                    {meta.faq.map((f, i) => (
                      <div className={`sd-faq__item ${openFaq === i ? "sd-faq__item--open" : ""}`} key={i}>
                        <button className="sd-faq__q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                          <span>{f.q}</span>
                          <Icon name={openFaq === i ? "chevron-up" : "chevron-down"} size={18} />
                        </button>
                        {openFaq === i && <p className="sd-faq__a">{f.a}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDEBAR */}
              <aside className="sd-sidebar">
                {/* Today's Best Muhurat */}
                <div className="sd-sidebar-card sd-muhurat-card">
                  <div className="sd-muhurat-header">
                    <span className="sd-muhurat-header__icon">🕉️</span>
                    <div>
                      <h3 className="sd-muhurat-title">Today's Muhurat</h3>
                      <p className="sd-muhurat-date">Aaj ka shubh samay</p>
                    </div>
                  </div>

                  <div className="sd-muhurat-tiles">
                    {panchang.auspicious.slice(0, 3).map((m, i) => (
                      <div className="sd-muhurat-tile sd-muhurat-tile--good" key={m.k}>
                        <span className="sd-muhurat-tile__icon">{["🌅", "☀️", "🌤️"][i]}</span>
                        <div className="sd-muhurat-tile__info">
                          <span className="sd-muhurat-tile__name">{m.k}</span>
                          <span className="sd-muhurat-tile__time">{m.v}</span>
                        </div>
                        <span className="sd-muhurat-tile__badge">Shubh</span>
                      </div>
                    ))}
                    <div className="sd-muhurat-tile sd-muhurat-tile--bad">
                      <span className="sd-muhurat-tile__icon">⚠️</span>
                      <div className="sd-muhurat-tile__info">
                        <span className="sd-muhurat-tile__name">Rahu Kaal</span>
                        <span className="sd-muhurat-tile__time">{panchang.inauspicious[0].v}</span>
                      </div>
                      <span className="sd-muhurat-tile__badge sd-muhurat-tile__badge--bad">Avoid</span>
                    </div>
                  </div>

                  <Link className="btn btn-gold btn-block" to="/panchang" style={{ marginTop: 16 }}>
                    <Icon name="calendar" size={16} /> Open full Panchang
                  </Link>
                </div>

                {/* Need Help */}
                <div className="sd-sidebar-card sd-sidebar-card--help">
                  <h3 className="sd-sidebar-card__title">Need Help?</h3>
                  <p className="muted" style={{ margin: "8px 0 14px", fontSize: ".88rem" }}>
                    Get answers from our expert team about this puja.
                  </p>
                  <a href="tel:+919876543210" className="btn btn-gold btn-block">
                    <Icon name="phone" size={16} /> Contact Us
                  </a>
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* SAMAGRI TAB */}
        {activeTab === "samagri" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell" style={{ maxWidth: 860 }}>
              <div className="sd-card">
                <h2 className="sd-card__title">
                  <span className="sd-card__title-icon">📿</span>
                  Required Samagri for {s.name}
                </h2>
                <p className="muted" style={{ margin: "8px 0 20px" }}>
                  Standard list — confirm with pandit ji who arranges what. Many pandits bring the full kit for a small extra amount.
                </p>
                <div className="sd-samagri-grid">
                  {s.samagri.map((x) => (
                    <div className="sd-samagri-item" key={x}>
                      <span className="sd-samagri-check">✓</span>
                      <span>{x}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 22 }} onClick={() => window.print()}>
                  <Icon name="download" size={16} /> Print / save this list
                </button>
              </div>
            </div>
          </section>
        )}

        {/* MUHURAT TAB */}
        {activeTab === "muhurat" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell" style={{ maxWidth: 660 }}>
              <div className="sd-card">
                <h2 className="sd-card__title">
                  <span className="sd-card__title-icon">🗓️</span>
                  Best Muhurat for {s.name}
                </h2>
                <p className="muted" style={{ margin: "8px 0 20px" }}>
                  Timings shown for today. A pandit ji will calculate the exact muhurat from your city and sankalp.
                </p>
                {panchang.auspicious.map((m) => (
                  <div className="muhurat-row" key={m.k}>
                    <span>{m.k}</span><span className="time-chip">{m.v}</span>
                  </div>
                ))}
                <div className="muhurat-row">
                  <span>Avoid — Rahu Kaal</span>
                  <span className="time-chip time-chip--bad">{panchang.inauspicious[0].v}</span>
                </div>
                <Link className="btn btn-gold btn-block" to="/panchang" style={{ marginTop: 22 }}>
                  <Icon name="calendar" size={17} /> Open full Panchang
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* PANDITS TAB */}
        {activeTab === "pandits" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell">
              <h2 className="section-title" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 32 }}>
                Pandits who perform {s.name}
              </h2>
              {pandits.length ? (
                <>
                  <div className="grid g-2 grid-2up-mobile">{pandits.slice(0, 6).map((p, i) => <PanditCard p={p} key={p.id} index={i} />)}</div>
                  {pandits.length > 6 && (
                    <div className="text-c" style={{ marginTop: 26 }}>
                      <Link className="btn btn-outline" to={`/pandits?service=${s.id}`}>See all {pandits.length} pandits</Link>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState msg="No pandit has listed this service yet. Try the directory or send an enquiry." />
              )}
            </div>
          </section>
        )}

        {/* REVIEWS TAB */}
        {activeTab === "reviews" && (
          <section className="section" style={{ paddingTop: 48 }}>
            <div className="shell" style={{ maxWidth: 660 }}>
              <div className="sd-card text-c" style={{ padding: "50px 30px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>⭐</div>
                <h2 style={{ fontSize: "1.4rem", marginBottom: 8 }}>4.9 out of 5</h2>
                <p className="muted">Based on 2,450+ devotees who performed {s.name}</p>
                <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 40 }}>
                  <div><strong style={{ fontSize: "1.6rem", color: "var(--gold-deep)" }}>{s.pandits}</strong><br /><span className="muted">Pandits</span></div>
                  <div><strong style={{ fontSize: "1.6rem", color: "var(--gold-deep)" }}>{temples.length}</strong><br /><span className="muted">Temples</span></div>
                  <div><strong style={{ fontSize: "1.6rem", color: "var(--gold-deep)" }}>2,450+</strong><br /><span className="muted">Bookings</span></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ======================== RELATED SERVICES ======================== */}
        <section className="section section--cream">
          <div className="shell">
            <div className="row-between" style={{ marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
              <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 0 }}>Related services</h2>
              {hasMoreRelated && (
                <Link className="btn btn-outline btn-sm" to="/services">See All</Link>
              )}
            </div>
            <div className={`grid g-4${isMobile ? " hp-cards-2up svc-2up" : ""}`}>
              {related.map((r, i) => <ServiceCard s={r} key={r.id} index={i} />)}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
