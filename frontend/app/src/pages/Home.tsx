import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { HeroAstrotalk } from "../components/hero/HeroAstrotalk";
import { SacredBackground } from "../components/ui/SacredBackground";
import { Icon } from "../lib/icons";
import { Reveal } from "../components/ui/Reveal";
import { PanditCard } from "../components/ui/PanditCard";
import { TempleCard } from "../components/ui/TempleCard";
import { ReviewCard } from "../components/ui/ReviewCard";
import { pandits, temples, reviews, festivals, services } from "../data/content";
import { useFairRanking } from "../lib/api";
import { useLang } from "../lib/i18n";
import { motion } from "framer-motion";
import "../styles/home-sections.css";



export default function Home() {
  const { t } = useLang();
  const fairScores = useFairRanking();
  // Fairness score folds rating/reviews/verification in already (it's built
  // on the same rank_score) — once it loads, it fully replaces this sort so
  // same-tier pandits actually rotate through the featured slots instead of
  // the same handful always winning on raw rating.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 620);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 620);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const topPandits = [...pandits]
    .sort((a, b) => {
      if (fairScores) {
        const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
        if (diff) return diff;
      }
      return b.rating - a.rating || b.reviews - a.reviews;
    })
    .slice(0, isMobile ? 8 : 6);
  const popularTemples = [...temples].sort((a, b) => b.reviews - a.reviews).slice(0, isMobile ? 8 : 9);


  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <HeroAstrotalk />

        {/* ============================== SERVICES ============================== */}
      <section className="section" style={{ position: "relative", overflow: "hidden" }}>
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <h2 className="section-title">{t("home.servicesTitle")}</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">{t("home.servicesSub")}</p>
          
          <div className="hp-services-grid">
            {services
              .filter(s => s.priority !== undefined)
              .sort((a, b) => (b.priority || 0) - (a.priority || 0))
              .slice(0, 6)
              .map((s) => (
                <Link to={`/services/${s.id}`} key={s.id} className="hp-service-tile regular">
                  <img src={s.img} alt={s.name} className="hp-service-tile__img" />
                  <div className="hp-service-tile__overlay" />
                  <div className="hp-service-tile__content">
                    <h3 className="hp-service-tile__title">{s.name}</h3>
                    <p className="hp-service-tile__desc">{s.desc.substring(0, 80)}...</p>
                    <div className="hp-service-tile__link">{t("home.findPandits")} <Icon name="arrow-right" size={16} /></div>
                  </div>
                </Link>
            ))}
          </div>

          <div className="text-c" style={{ marginTop: 36 }}>
            <Link className="btn btn-gold btn-lg" to="/services">{t("home.seeAllServices")}</Link>
          </div>
        </div>
      </section>

      {/* =========================== FEATURED PANDITS =========================== */}
      <section className="section">
        <div className="shell">
          <div className="row-between" style={{ marginBottom: 34, flexWrap: "wrap" }}>
            <div>
              <span className="eyebrow">{t("home.featuredEyebrow")}</span>
              <h2 className="section-title section-title--left" style={{ marginTop: 8 }}>{t("home.featuredTitle")}</h2>
            </div>
          </div>
          <div className="grid g-3 hp-cards-2up">
            {topPandits.map((p, i) => <PanditCard p={p} key={p.id} index={i} />)}
          </div>
          <div className="text-c" style={{ marginTop: 32 }}>
            <Link className="btn btn-outline" to="/pandits">{t("home.allPandits")}</Link>
          </div>
        </div>
      </section>



      {/* ==================== ONLINE HAVAN & PUJA SEVA ==================== */}
      <section className="ohp-section">

        {/* ——— HERO HEADER ——— */}
        <div className="ohp-hero">
          <div className="ohp-hero-bg" />
          <div className="shell ohp-hero-inner">
            <Reveal>
              <span className="eyebrow">{t("ohp.eyebrow")}</span>
              <h2 className="ohp-hero-title">{t("ohp.heroTitle")}</h2>
              <p className="ohp-hero-sub">{t("ohp.heroSub")}</p>
            </Reveal>
          </div>
        </div>

        {/* ——— HOW IT WORKS ——— */}
        <div className="ohp-steps-wrap">
          <div className="shell">
            <h3 className="ohp-heading">{t("ohp.howItWorks")}</h3>
            <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>

            <div className="ohp-steps">
              {[
                { num: "①", icon: "om", title: t("ohp.step1Title"), desc: t("ohp.step1Desc") },
                { num: "②", icon: "edit", title: t("ohp.step2Title"), desc: t("ohp.step2Desc") },
                { num: "③", icon: "video", title: t("ohp.step3Title"), desc: t("ohp.step3Desc") },
                { num: "④", icon: "heart", title: t("ohp.step4Title"), desc: t("ohp.step4Desc") },
              ].map((s, i) => (
                <motion.div className="ohp-step" key={i}
                  initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}>
                  <div className="ohp-step-circle"><span>{s.num}</span></div>
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ——— POPULAR PUJAS ——— */}
        <div className="ohp-pujas-wrap">
          <div className="shell">
            <h3 className="ohp-heading">{t("ohp.popularPujas")}</h3>
            <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>

            <div className="ohp-puja-grid">
              {[
                { id: "havan-yagna", emoji: "🔥", name: t("ohp.puja1Name"), desc: t("ohp.puja1Desc"), dur: t("ohp.puja1Dur") },
                { id: "kaal-sarp", emoji: "🐍", name: t("ohp.puja2Name"), desc: t("ohp.puja2Desc"), dur: t("ohp.puja2Dur") },
                { id: "navgrah-shanti", emoji: "🪐", name: t("ohp.puja3Name"), desc: t("ohp.puja3Desc"), dur: t("ohp.puja3Dur") },
                { id: "mahamrityunjay", emoji: "🕉️", name: t("ohp.puja4Name"), desc: t("ohp.puja4Desc"), dur: t("ohp.puja4Dur") },
              ].map((p, i) => (
                <motion.div className="ohp-puja-card" key={i}
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}>
                  <span className="ohp-puja-emoji">{p.emoji}</span>
                  <h4 className="ohp-puja-name">{p.name}</h4>
                  <p className="ohp-puja-desc">{p.desc}</p>
                  <div className="ohp-puja-meta">
                    <span className="ohp-puja-dur"><Icon name="clock" size={13} /> {p.dur}</span>
                    <span className="ohp-puja-live">● {t("ohp.live")}</span>
                  </div>
                  <Link className="btn btn-gold btn-sm ohp-puja-btn" to={`/services/${p.id}`}>{t("ohp.enquire")}</Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ——— SANKALP INFO ——— */}
        <div className="ohp-sankalp-wrap">
          <div className="shell">
            <Reveal>
              <div className="ohp-sankalp-card">
                <h3 className="ohp-heading" style={{ marginBottom: 6 }}>{t("ohp.sankalpInfo")}</h3>
                <p className="ohp-sankalp-subtitle">{t("ohp.sankalpSubtitle")}</p>

                <div className="ohp-sankalp-grid">
                  <ul className="ohp-sankalp-list">
                    <li><Icon name="user" size={15} /> <span>{t("ohp.sankalpFullName")}</span></li>
                    <li><Icon name="user" size={15} /> <span>{t("ohp.sankalpFatherName")}</span></li>
                    <li><Icon name="star" size={15} /> <span>{t("ohp.sankalpGotra")}</span></li>
                  </ul>
                  <ul className="ohp-sankalp-list">
                    <li><Icon name="check-circle" size={15} /> <span>{t("ohp.sankalpPurpose")}</span></li>
                    <li><Icon name="map-pin" size={15} /> <span>{t("ohp.sankalpCity")}</span></li>
                    <li><Icon name="phone" size={15} /> <span>{t("ohp.sankalpWhatsapp")}</span></li>
                  </ul>
                </div>

                <div className="ohp-sankalp-help">
                  {t("ohp.sankalpHelp")}
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* ——— WHAT YOU RECEIVE ——— */}
        <div className="ohp-receive-wrap">
          <div className="shell">
            <h3 className="ohp-heading">{t("ohp.whatYouReceive")}</h3>
            <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>

            <div className="ohp-receive-row">
              {[
                { icon: "video", label: t("ohp.receive1") },
                { icon: "check-circle", label: t("ohp.receive2") },
                { icon: "heart", label: t("ohp.receive3") },
                { icon: "play-circle", label: t("ohp.receive4") },
                { icon: "award", label: t("ohp.receive5") },
                { icon: "package", label: t("ohp.receive6") },
              ].map((r, i) => (
                <motion.div className="ohp-receive-item" key={i}
                  initial={{ opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }} transition={{ duration: 0.35, delay: i * 0.06 }}>
                  <div className="ohp-receive-icon"><Icon name={r.icon} size={22} /></div>
                  <span>{r.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* =========================== POPULAR TEMPLES =========================== */}
      <section className="section" style={{ position: "relative" }}>
        <img src="/assets/img/lotus.svg" className="watermark watermark--tr" alt="" style={{ width: 260 }} />
        <div className="shell">
          <div className="row-between" style={{ marginBottom: 34, flexWrap: "wrap" }}>
            <div>
              <span className="eyebrow">{t("home.templesEyebrow")}</span>
              <h2 className="section-title section-title--left" style={{ marginTop: 8 }}>{t("home.templesTitle")}</h2>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <Link className="btn btn-ghost" to="/temple-map">{t("home.onTheMap")}</Link>
              <Link className="btn btn-outline" to="/temples">{t("home.allTemples")}</Link>
            </div>
          </div>
          <div className="grid g-3 hp-cards-2up">
            {popularTemples.map((t, i) => <TempleCard t={t} key={t.id} index={i} />)}
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
              <span className="eyebrow">{t("home.festivalsEyebrow")}</span>
              <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.5rem,2.6vw,2rem)", marginTop: 6 }}>{t("home.festivalsTitle")}</h2>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
              <Link className="btn btn-outline" to="/festivals"><Icon name="calendar" size={16} /> {t("home.fullCalendar")}</Link>
            </motion.div>
          </div>

          <div className="hp-fest-circles">
            {festivals.filter(f => f.img).slice(0, 7).map((f, i) => (
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

      {/* ============================ ADVANCED TESTIMONIALS CAROUSEL ============================ */}
      <section className="hp-reviews-section">
        {/* The 3D transparent Pandit background */}
        <div className="hp-reviews-bg" />
        
        <div className="hp-reviews-header">
          <h2 className="section-title">{t("home.testimonialsTitle")}</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
        </div>

        <div className="hp-reviews-carousel">
          {reviews.map((r) => (
            <ReviewCard key={r.name} r={r} />
          ))}
        </div>
      </section>


      </div>
    </div>
  );
}
