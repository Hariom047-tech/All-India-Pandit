import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../lib/icons";
import { services } from "../data/content";
import { EmptyState } from "../components/ui/ReviewCard";
import { SacredBackground } from "../components/ui/SacredBackground";
import { HeroTicker } from "../components/ui/HeroTicker";


const MOST_BOOKED = [
  { cat: "life", label: "Life Events", img: "/assets/img/services/cat-life.jpg", pandits: 186 },
  { cat: "daily", label: "Daily Pooja", img: "/assets/img/services/cat-daily.jpg", pandits: 257 },
  { cat: "festival", label: "Festival Specials", img: "/assets/img/services/cat-festival.jpg", pandits: 251 },
  { cat: "shanti", label: "Shanti Remedies", img: "/assets/img/services/cat-shanti.jpg", pandits: 167 },
];

export default function Services() {
  const [query] = useState("");

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (query && !`${s.name} ${s.tag} ${s.desc}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query]);

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ======================== HERO ======================== */}
        <section className="sp-hero">
          <div className="shell">
            <div className="sp-hero__grid">
              <div className="sp-hero__content">
                <h1 className="sp-hero__title">
                  Divine rituals, <br />
                  <span className="gold-text">delivered with devotion</span>
                </h1>
                <ul className="sp-hero__list">
                  <li>
                    <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                    Complete vidhi with all samagri — nothing for you to arrange
                  </li>
                  <li>
                    <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                    From griha pravesh to shanti path — every ritual your family needs
                  </li>
                  <li>
                    <div className="sp-hero__check"><Icon name="check" size={14} /></div>
                    Transparent pricing, no hidden costs — book with complete peace of mind
                  </li>
                </ul>
                <div className="sp-hero__cta">
                  <Link to="/pandits" className="btn btn-gold btn-lg btn-pill">
                    Book a Service <Icon name="arrow-right" size={18} />
                  </Link>
                </div>
              </div>
              <div className="sp-hero__img-wrap">
                <img src="/assets/img/services/pandit-hero.jpg" alt="Pandit performing puja" className="sp-hero__img" />
                <div className="sp-hero__glow" />
              </div>
            </div>
          </div>

          {/* Scrolling ticker */}
          <HeroTicker />
        </section>

        {/* ======================== MOST BOOKED ======================== */}
        <section className="section" style={{ paddingTop: 40, paddingBottom: 30 }}>
          <div className="shell">
            <h2 className="sp-section-title">Most Booked Services</h2>
            <div className="sp-booked-row">
              {MOST_BOOKED.map((mb) => (
                <div
                  key={mb.cat}
                  className="sp-booked-card"
                >
                  <img src={mb.img} alt={mb.label} className="sp-booked-card__img" />
                  <div className="sp-booked-card__overlay" />
                  <span className="sp-booked-card__badge">⭐ Popular</span>
                  <div className="sp-booked-card__bottom">
                    <h4 className="sp-booked-card__name">{mb.label}</h4>
                    <div className="sp-booked-card__meta">
                      <span className="sp-booked-card__stars">★★★★★</span>
                      <span>{mb.pandits} Pandits</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ======================== ALL SERVICES GRID ======================== */}
        <section className="section" style={{ paddingTop: 10, paddingBottom: 50 }}>
          <div className="shell">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 className="sp-section-title" style={{ margin: 0 }}>All Services</h2>
              <span className="muted" style={{ fontSize: ".92rem" }}>{filtered.length} services found</span>
            </div>

            {filtered.length ? (
              <div className="sp-all-grid">
                {filtered.map((s) => (
                  <Link
                    to={`/pandits?service=${s.id}`}
                    className="sp-all-card"
                    key={s.id}
                  >
                    <img src="/assets/img/services/griha-pravesh-hero.jpg" alt={s.name} className="sp-all-card__img" />
                    <div className="sp-all-card__overlay" />
                    <div className="sp-all-card__bottom">
                      <h4 className="sp-all-card__name">{s.name}</h4>
                      <p className="sp-all-card__tag">{s.tag}</p>
                      <div className="sp-all-card__meta">
                        <span><Icon name="clock" size={13} /> {s.dur}</span>
                        <span><Icon name="users" size={13} /> {s.pandits} Pandits</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState msg="No service matched. Try the AI Pooja Guide if you are unsure what you need." />
            )}
          </div>
        </section>

        {/* ======================== TRUST FOOTER ======================== */}
        <section className="sp-trust-footer">
          <div className="shell">
            <div className="sp-trust-footer__inner">
              <p className="sp-trust-footer__text">
                Join <strong>10,000+</strong> families who found their perfect pandit through PanditConnect
              </p>
              <div className="sp-trust-footer__badges">
                <span className="sp-trust-badge">🛡️ Verified Pandits</span>
                <span className="sp-trust-badge">✅ Authentic Rituals</span>
                <span className="sp-trust-badge">⭐ 4.9 Rating</span>
                <span className="sp-trust-badge">🇮🇳 Pan-India</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
