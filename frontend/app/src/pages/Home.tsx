import { Link } from "react-router-dom";
import { HeroAstrotalk } from "../components/hero/HeroAstrotalk";
import { SacredBackground } from "../components/ui/SacredBackground";
import { Icon } from "../lib/icons";
import { Reveal } from "../components/ui/Reveal";
import { PanditCard } from "../components/ui/PanditCard";
import { TempleCard } from "../components/ui/TempleCard";
import { StarRow } from "../components/ui/StarRating";
import { onImgError } from "../lib/format";
import { pandits, temples, reviews, festivals } from "../data/content";
import { motion } from "framer-motion";
import "../styles/home-sections.css";



export default function Home() {
  const topPandits = [...pandits].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 8);
  const popularTemples = [...temples].sort((a, b) => b.reviews - a.reviews).slice(0, 6);
  const testimonials = reviews.slice(0, 3);

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <HeroAstrotalk />

        {/* ================================ USP ================================ */}
        <section className="section section--tight">
        <div className="shell">
          <Reveal className="usp-band row-between">
            <div>
              <h2 style={{ fontSize: "clamp(1.3rem,2.4vw,1.7rem)" }}>
                Hum booking nahi karvate — hum <span className="gold-text">connection</span> karvate hain
              </h2>
              <p className="muted" style={{ marginTop: 8, maxWidth: 640 }}>
                Every other platform sits between you and the pandit ji and keeps 20–30%. We are a directory: you find, you compare, you call. Pandit ji keeps 100% of their dakshina.
              </p>
            </div>
            <Link className="btn btn-outline" to="/about">Why we are different</Link>
          </Reveal>
        </div>
      </section>

      {/* ============================== SERVICES ============================== */}
      <section className="section" style={{ position: "relative", overflow: "hidden" }}>
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <h2 className="section-title">Our Sacred Services</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">From daily aarti to a seven-day Bhagwat Katha — 33 rituals with samagri lists and muhurat guidance.</p>
          
          <div className="hp-services-grid">
            {/* 1. Havan / Yagna (Wide) */}
            <Link to="/services/havan-yagna" className="hp-service-tile wide">
              <img src="/assets/img/services/tiles/havan.jpg" alt="Havan Yagna" className="hp-service-tile__img" />
              <div className="hp-service-tile__overlay" />
              <div className="hp-service-tile__content">
                <h3 className="hp-service-tile__title">Havan / Yagna</h3>
                <p className="hp-service-tile__desc">Purification ritual with sacred fire and Vedic mantras for peace and prosperity.</p>
                <div className="hp-service-tile__link">Find Pandits <Icon name="arrow-right" size={16} /></div>
              </div>
            </Link>

            {/* 2. Ganesh Puja (Regular) */}
            <Link to="/services/ganesh-puja" className="hp-service-tile regular">
              <img src="/assets/img/services/tiles/ganesh.jpg" alt="Ganesh Puja" className="hp-service-tile__img" />
              <div className="hp-service-tile__overlay" />
              <div className="hp-service-tile__content">
                <h3 className="hp-service-tile__title">Ganesh Puja</h3>
                <p className="hp-service-tile__desc">Obstacle-removing first puja.</p>
                <div className="hp-service-tile__link">Find Pandits <Icon name="arrow-right" size={16} /></div>
              </div>
            </Link>

            {/* 3. Wedding Ceremony (Regular) */}
            <Link to="/services/wedding" className="hp-service-tile regular">
              <img src="/assets/img/services/tiles/wedding.jpg" alt="Wedding Ceremony" className="hp-service-tile__img" />
              <div className="hp-service-tile__overlay" />
              <div className="hp-service-tile__content">
                <h3 className="hp-service-tile__title">Wedding Ceremony</h3>
                <p className="hp-service-tile__desc">Complete Vedic Vivah sanskar.</p>
                <div className="hp-service-tile__link">Find Pandits <Icon name="arrow-right" size={16} /></div>
              </div>
            </Link>

            {/* 4. Satyanarayan Katha (Wide) */}
            <Link to="/services/satyanarayan-katha" className="hp-service-tile wide">
              <img src="/assets/img/services/tiles/satyanarayan.jpg" alt="Satyanarayan Katha" className="hp-service-tile__img" />
              <div className="hp-service-tile__overlay" />
              <div className="hp-service-tile__content">
                <h3 className="hp-service-tile__title">Satyanarayan Katha</h3>
                <p className="hp-service-tile__desc">Blessings, truth, and prosperity for the family. Ideal for full moon days.</p>
                <div className="hp-service-tile__link">Find Pandits <Icon name="arrow-right" size={16} /></div>
              </div>
            </Link>
          </div>

          <div className="text-c" style={{ marginTop: 36 }}>
            <Link className="btn btn-gold btn-lg" to="/services">See all services</Link>
          </div>
        </div>
      </section>

      {/* =========================== FEATURED PANDITS =========================== */}
      <section className="section">
        <div className="shell">
          <div className="row-between" style={{ marginBottom: 34, flexWrap: "wrap" }}>
            <div>
              <span className="eyebrow">Top rated this month</span>
              <h2 className="section-title section-title--left" style={{ marginTop: 8 }}>Featured Pandit Ji</h2>
            </div>
            <Link className="btn btn-outline" to="/pandits">All 500+ pandits</Link>
          </div>
          <div className="grid g-3">
            {topPandits.map((p, i) => <PanditCard p={p} key={p.id} index={i} />)}
          </div>
        </div>
      </section>



      {/* =========================== POPULAR TEMPLES =========================== */}
      <section className="section" style={{ position: "relative" }}>
        <img src="/assets/img/lotus.svg" className="watermark watermark--tr" alt="" style={{ width: 260 }} />
        <div className="shell">
          <div className="row-between" style={{ marginBottom: 34, flexWrap: "wrap" }}>
            <div>
              <span className="eyebrow">Temple first</span>
              <h2 className="section-title section-title--left" style={{ marginTop: 8 }}>Popular Temples</h2>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <Link className="btn btn-ghost" to="/temple-map">On the map</Link>
              <Link className="btn btn-outline" to="/temples">All temples</Link>
            </div>
          </div>
          <div className="grid g-3">
            {popularTemples.map((t, i) => <TempleCard t={t} key={t.id} index={i} />)}
          </div>
        </div>
      </section>

      {/* ============================ AI + PANCHANG ============================ */}
      <section className="section" style={{ position: "relative", overflow: "hidden" }}>
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <div className="hp-duo-grid">
            {/* ── AI Pooja Guide Card ── */}
            <motion.div
              className="hp-feature-card hp-feature-card--primary"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] as const }}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
            >
              <div className="hp-feature-card__glow" />
              <div className="hp-feature-card__icon-wrap">
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Icon name="sparkles" size={36} />
                </motion.div>
              </div>
              <h3 className="hp-feature-card__title">Not sure which pooja you need?</h3>
              <p className="hp-feature-card__text">
                Describe your situation in Hindi or English — <em>"naya flat liya hai"</em>, <em>"ghar mein bimari chal rahi hai"</em> — and our Pooja Guide suggests the ritual traditionally recommended, with the pandits who perform it.
              </p>
              <Link className="btn btn-gold hp-feature-card__btn" to="/ai-recommender">
                <Icon name="sparkles" size={17} /> Ask the Pooja Guide
              </Link>
              {/* corner om decoration */}
              <svg className="hp-feature-card__deco" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--gold)" }}>
                <path d="M35 75c-8-4-14-12-14-22 0-14 12-24 26-24 10 0 18 5 22 13" />
                <path d="M69 42c3 5 4 10 3 16-2 14-16 22-30 18" />
                <path d="M50 25c0-8 6-14 12-14s10 5 10 10c0 4-3 7-7 7" />
                <circle cx="78" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
            </motion.div>

            {/* ── Panchang Card ── */}
            <motion.div
              className="hp-feature-card hp-feature-card--secondary"
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] as const, delay: 0.12 }}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
            >
              <div className="hp-feature-card__glow hp-feature-card__glow--alt" />
              <div className="hp-feature-card__icon-wrap hp-feature-card__icon-wrap--alt">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Icon name="calendar" size={36} />
                </motion.div>
              </div>
              <h3 className="hp-feature-card__title">Panchang &amp; Shubh Muhurat</h3>
              <p className="hp-feature-card__text">
                Today's tithi, nakshatra, Rahu Kaal and Abhijit muhurat — plus a muhurat finder for any ritual. No need to search another site.
              </p>
              <Link className="btn btn-outline hp-feature-card__btn" to="/panchang">
                <Icon name="calendar" size={17} /> Open today's Panchang
              </Link>
              {/* corner trishul decoration */}
              <svg className="hp-feature-card__deco" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: "var(--gold)" }}>
                <path d="M50 95 L50 25" />
                <path d="M50 25 L50 5" /><path d="M46 10 L50 2 L54 10" />
                <path d="M50 30 C40 28, 28 20, 25 8" /><path d="M22 14 L25 5 L29 13" />
                <path d="M50 30 C60 28, 72 20, 75 8" /><path d="M71 13 L75 5 L78 14" />
              </svg>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================= FESTIVALS ============================= */}
      <section className="section section--tight hp-fest-section" style={{ position: "relative", overflow: "hidden" }}>
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <div className="row-between" style={{ marginBottom: 28, flexWrap: "wrap" }}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <span className="eyebrow">Hindu Calendar</span>
              <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginTop: 6 }}>Upcoming Festivals</h2>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
              <Link className="btn btn-outline" to="/panchang"><Icon name="calendar" size={16} /> Full calendar</Link>
            </motion.div>
          </div>

          <div className="hp-fest-circles">
            {festivals.slice(0, 7).map((f, i) => (
              <motion.div
                className="hp-fest-circle"
                key={f.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              >
                <div className="hp-fest-circle__img-wrap">
                  <img src={f.img} alt={f.name} className="hp-fest-circle__img" />
                </div>
                <h4 className="hp-fest-circle__name">{f.name}</h4>
              </motion.div>
            ))}
          </div>
        </div>
        {/* golden shimmer line at bottom */}
        <div className="hp-fest-shimmer-line" />
      </section>

      {/* ============================ TESTIMONIALS ============================ */}
      <section className="section">
        <div className="shell">
          <h2 className="section-title">Devotees Ki Zubani</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <div className="grid g-3" style={{ marginTop: 40 }}>
            {testimonials.map((r, i) => (
              <Reveal className="card quote" key={r.name} delay={i * 0.06}>
                <StarRow rating={r.rating} size={18} />
                <p>{r.text}</p>
                <div className="row">
                  <span className="avatar-ring avatar-ring--sm" style={{ width: 44, height: 44 }}>
                    <img src="/assets/img/pandit-placeholder.svg" alt="" onError={onImgError("pandit")} />
                  </span>
                  <span>
                    <strong style={{ fontFamily: "var(--font-head)", fontSize: ".95rem" }}>{r.name}</strong>
                    <span className="muted" style={{ display: "block", fontSize: ".82rem" }}>{r.city} · {r.service}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      </div>
    </div>
  );
}
