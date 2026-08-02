import { useEffect, useState } from "react";
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
    document.title = `${s.name} — PanditConnect`;
  }, [s]);

  const pandits = panditsForService(s.id);
  const temples = templesForService(s.id);
  const related = services.filter((x) => x.id !== s.id && x.cat === s.cat).slice(0, 4);
  const meta = getServiceMeta(s.id);

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "samagri", label: "Samagri" },
    { key: "muhurat", label: "Muhurat" },
    { key: "pandits", label: "Pandits" },
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

                {/* Benefits Grid */}
                <div className="sd-card">
                  <h2 className="sd-card__title">
                    <span className="sd-card__title-icon">✨</span>
                    Benefits
                  </h2>
                  <div className="sd-benefits">
                    {meta.benefits.map((b) => (
                      <div className="sd-benefit" key={b.title}>
                        <div className="sd-benefit__icon">{b.icon}</div>
                        <div className="sd-benefit__label">{b.title}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Puja Process */}
                <div className="sd-card">
                  <h2 className="sd-card__title">
                    <span className="sd-card__title-icon">📋</span>
                    Puja Process
                  </h2>
                  <div className="sd-process">
                    {meta.process.map((p, i) => (
                      <div className="sd-step" key={p.step}>
                        <div className="sd-step__badge">{p.step}</div>
                        {i < meta.process.length - 1 && <div className="sd-step__line" />}
                        <div className="sd-step__content">
                          <h4 className="sd-step__title">{p.title}</h4>
                          <p className="sd-step__desc">{p.desc}</p>
                        </div>
                      </div>
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
                <div className="sd-sidebar-card">
                  <h3 className="sd-sidebar-card__title">
                    <Icon name="clock" size={18} /> Today's Best Muhurat
                  </h3>
                  {panchang.auspicious.slice(0, 3).map((m) => (
                    <div className="muhurat-row" key={m.k}>
                      <span>{m.k}</span><span className="time-chip">{m.v}</span>
                    </div>
                  ))}
                  <div className="muhurat-row">
                    <span>Avoid — Rahu Kaal</span>
                    <span className="time-chip time-chip--bad">{panchang.inauspicious[0].v}</span>
                  </div>
                  <Link className="btn btn-gold btn-block" to="/panchang" style={{ marginTop: 14 }}>
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
                  <div className="grid g-2">{pandits.slice(0, 8).map((p, i) => <PanditCard p={p} key={p.id} index={i} />)}</div>
                  {pandits.length > 8 && (
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
            <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginBottom: 26 }}>Related services</h2>
            <div className="grid g-4">{related.map((r, i) => <ServiceCard s={r} key={r.id} index={i} />)}</div>
          </div>
        </section>

      </div>
    </div>
  );
}
