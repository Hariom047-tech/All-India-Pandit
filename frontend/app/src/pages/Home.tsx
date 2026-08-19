import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HeroAstrotalk } from "../components/hero/HeroAstrotalk";
import { SacredBackground } from "../components/ui/SacredBackground";
import { Icon } from "../lib/icons";
import { PanditCard } from "../components/ui/PanditCard";
import { TempleCard } from "../components/ui/TempleCard";
import { ReviewCard } from "../components/ui/ReviewCard";

import { usePandits, useTemples, useServices, useReviews, useFaqs } from "../hooks/useData";
import { normPandits, normTemples, normServices, normReviews } from "../lib/normalize";
import { useFairRanking, useReportExposure } from "../lib/api";
import { useLang } from "../lib/i18n";
import "../styles/home-sections.css";
import { serviceEmoji } from "../lib/serviceEmoji";
import { Seo } from "../lib/Seo";
import { useStructuredData, organizationSchema, websiteSchema, webPageSchema, organizationId, faqPageSchema } from "../lib/structuredData";

/**
 * Home-local replacement for the shared `Reveal`/`whileInView` framer-motion
 * pattern used below the fold on this page — deliberately NOT a change to
 * the shared `components/ui/Reveal.tsx` (used sitewide, e.g. About.tsx);
 * that's a separate, bigger-blast-radius decision. This one keeps Home's
 * own bundle free of framer-motion (Phase 12, docs/SEO_ARCHITECTURE.md) —
 * Home is eagerly loaded (not route-split), so anything it imports is on
 * the critical path for every visit, and none of this below-the-fold,
 * scroll-triggered decoration needs to be there.
 */
function InViewFade({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: "0px 0px -60px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`ohp-reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Same accordion pattern as Contact.tsx's FaqItem — kept as its own local
 *  copy rather than extracted into a shared component, matching how small,
 *  page-specific pieces like this already work elsewhere in this codebase. */
function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`acc-item${open ? " is-open" : ""}`}>
      <button className="acc-q" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{q}</span><Icon name="chevron-down" />
      </button>
      <div className="acc-a" style={{ maxHeight: open ? 420 : 0 }}>
        <p>{a}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useLang();
  const fairScores = useFairRanking();
  const { data: rawFaqs } = useFaqs();
  const displayFaqs = rawFaqs || [];
  useStructuredData([
    organizationSchema(),
    websiteSchema(),
    webPageSchema({
      path: "/", name: "PanditSuggest — Connect with Trusted Pandits Across India",
      aboutId: organizationId(),
    }),
    faqPageSchema(displayFaqs, "/"),
  ]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 620);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 620);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /* ── Fetch data from API ── */
  const { data: rawPandits } = usePandits({ perPage: 20 });
  const { data: rawTemples } = useTemples({ perPage: 20, sort: "reviews" });
  const { data: rawServices } = useServices();
  const { data: rawReviews } = useReviews();

  const pandits = useMemo(() => normPandits(rawPandits), [rawPandits]);
  const temples = useMemo(() => normTemples(rawTemples), [rawTemples]);
  const services = useMemo(() => normServices(rawServices), [rawServices]);
  const featuredServices = useMemo(
    () => services.filter((s) => s.popular).slice(0, 6),
    [services],
  );

  /**
   * The "Popular Pujas" strip in the online-havan section.
   *
   * Was four hardcoded cards whose names, descriptions and durations lived in
   * the i18n dictionary (ohp.puja1Name … puja4Dur) — editing one meant a code
   * change and a redeploy, and the four slugs were fixed regardless of what
   * the database actually contained.
   *
   * Admin owns it now through two flags already on every service:
   *   "Online puja / havan available"  → eligible for this strip
   *   "Mark as popular"                → sorted to the front
   */
  const onlinePujas = useMemo(() => {
    const online = services.filter((s) => s.onlineAvailable);
    return [...online]
      .sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)))
      .slice(0, 4);
  }, [services]);
  const reviews = useMemo(() => normReviews(rawReviews), [rawReviews]);

  const topPandits = useMemo(() => {
    return [...pandits]
      .sort((a, b) => {
        if (fairScores) {
          const diff = (fairScores.get(b.id) ?? -Infinity) - (fairScores.get(a.id) ?? -Infinity);
          if (diff) return diff;
        }
        return b.rating - a.rating || b.reviews - a.reviews;
      })
      .slice(0, isMobile ? 8 : 6);
  }, [pandits, fairScores, isMobile]);

  // The featured strip is a real impression — 6-8 pandits above the fold on the
  // busiest page on the site. Not counting it would let whoever lands here
  // accumulate free visibility.
  useReportExposure(topPandits.map((p) => p.id));

  const popularTemples = useMemo(() =>
    [...temples].sort((a, b) => b.reviews - a.reviews).slice(0, isMobile ? 8 : 9),
  [temples, isMobile]);

  return (
    <div className="hp-sacred-section" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <Seo
        title="PanditSuggest — Connect with Trusted Pandits Across India"
        description="Discover verified Pandits for puja, havan and anushthan at temples, online, or at your home. Browse temples, compare Pandit profiles by city and language, and contact them directly on WhatsApp or call — no middleman, no commission."
        path="/"
      />
      <SacredBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <HeroAstrotalk />

        {/* ============================== WHAT IS PANDITSUGGEST ============================== */}
        {/* Visible-HTML explanation of the platform for a first-time visitor
            (and a non-JS crawler) — the homepage previously jumped straight
            from hero to cards with nothing explaining what the site actually
            is (master SEO prompt Part 11, docs/SEO_ARCHITECTURE.md §16). */}
        <section className="section" style={{ position: "relative" }}>
          <div className="shell">
            <span className="eyebrow">What is PanditSuggest</span>
            <h2 className="section-title section-title--left" style={{ fontSize: "clamp(1.6rem,2.8vw,2.2rem)", marginTop: 10, maxWidth: 760 }}>
              Find and talk to a real Pandit — no middleman
            </h2>
            <p className="section-sub" style={{ textAlign: "left", maxWidth: 760, margin: "16px 0 0" }}>
              PanditSuggest is a directory of verified Pandits and temples across India — not a booking agent.
              Every profile is real: document-checked, video-verified, and confirmed with the temple where the
              pandit ji actually serves. Browse temples, compare Pandits by city, language and experience, and
              contact the one you choose directly on WhatsApp or by phone. You agree the vidhi, the date and the
              dakshina between yourselves — we never take a cut, and we never assign someone you didn't pick.
              {" "}<Link to="/how-it-works" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>See how it works →</Link>
            </p>

            <div className="grid g-4 hp-whatis-grid" style={{ marginTop: 32 }}>
              <Link to="/pandits" className="card card-pad">
                <Icon name="users" size={28} />
                <h3 className="hp-whatis-card__title">Find Pandits</h3>
                <p className="muted hp-whatis-card__desc">Verified profiles by city, language and specialization.</p>
              </Link>
              <Link to="/temples" className="card card-pad">
                <Icon name="temple" size={28} />
                <h3 className="hp-whatis-card__title">Explore Temples</h3>
                <p className="muted hp-whatis-card__desc">Real temples with photos, timings and the Pandits who serve them.</p>
              </Link>
              <Link to="/services" className="card card-pad">
                <Icon name="sparkles" size={28} />
                <h3 className="hp-whatis-card__title">Puja &amp; Havan Services</h3>
                <p className="muted hp-whatis-card__desc">What each ritual involves, and who performs it near you.</p>
              </Link>
              <Link to="/ai-recommender" className="card card-pad">
                <Icon name="sparkles" size={28} />
                <h3 className="hp-whatis-card__title">AI Recommender</h3>
                <p className="muted hp-whatis-card__desc">Not sure which puja you need? Describe your situation and get a starting point.</p>
              </Link>
            </div>
          </div>
        </section>

        {/* ============================== SERVICES ============================== */}
      <section className="section" style={{ position: "relative", overflow: "hidden" }}>
        <div className="shell" style={{ position: "relative", zIndex: 1 }}>
          <h2 className="section-title">{t("home.servicesTitle")}</h2>
          <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
          <p className="section-sub">{t("home.servicesSub")}</p>
          
          <div className="hp-services-grid">
            {/* `priority` only ever existed on the bundled content.ts records —
                the API does not return it, so this filter silently emptied the
                entire grid once the site read from the database. Admin-managed
                "Mark as popular" drives it now, falling back to the first six
                services so the section is never blank. */}
            {(featuredServices.length ? featuredServices : services.slice(0, 6))
              .map((s) => (
                <Link to={`/services/${s.id}`} key={s.id} className="hp-service-tile regular">
                  <img src={s.img} alt={s.name} className="hp-service-tile__img" loading="lazy" />
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
            {topPandits.map((p, i) => <PanditCard p={p} key={p.id} index={i} sourceSurface="home" />)}
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
            <InViewFade>
              <span className="eyebrow">{t("ohp.eyebrow")}</span>
              <h2 className="ohp-hero-title">{t("ohp.heroTitle")}</h2>
              <p className="ohp-hero-sub">{t("ohp.heroSub")}</p>
            </InViewFade>
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
                <InViewFade className="ohp-step" delay={i * 100} key={i}>
                  <div className="ohp-step-circle"><span>{s.num}</span></div>
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                </InViewFade>
              ))}
            </div>
          </div>
        </div>

        {/* ——— POPULAR PUJAS (admin-managed) ——— */}
        {onlinePujas.length > 0 && (
        <div className="ohp-pujas-wrap">
          <div className="shell">
            <h3 className="ohp-heading">{t("ohp.popularPujas")}</h3>
            <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>

            <div className="ohp-puja-grid">
              {onlinePujas.map((s, i) => (
                <InViewFade className="ohp-puja-card" delay={i * 80} key={s.id}>
                  {s.img
                    ? <img className="ohp-puja-img" src={s.img} alt={s.name} loading="lazy" />
                    : <span className="ohp-puja-emoji">{serviceEmoji(s.icon)}</span>}
                  <h4 className="ohp-puja-name">{s.name}</h4>
                  {(s.tag || s.desc) && (
                    <p className="ohp-puja-desc">{s.tag || s.desc}</p>
                  )}
                  <div className="ohp-puja-meta">
                    {s.dur && <span className="ohp-puja-dur"><Icon name="clock" size={13} /> {s.dur}</span>}
                    <span className="ohp-puja-live">● {t("ohp.live")}</span>
                  </div>
                  <Link className="btn btn-gold btn-sm ohp-puja-btn" to={`/services/${s.id}`}>
                    Inquire Now
                  </Link>
                </InViewFade>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* ——— SANKALP INFO ——— */}
        <div className="ohp-sankalp-wrap">
          <div className="shell">
            <InViewFade>
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
            </InViewFade>
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
                <InViewFade className="ohp-receive-item" delay={i * 60} key={i}>
                  <div className="ohp-receive-icon"><Icon name={r.icon} size={22} /></div>
                  <span>{r.label}</span>
                </InViewFade>
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

      {/* ============================ FAQ ============================ */}
      {displayFaqs.length > 0 && (
        <section className="section section--cream" id="faq">
          <div className="shell" style={{ maxWidth: 860 }}>
            <h2 className="section-title">Frequently Asked Questions</h2>
            <svg className="ornament" viewBox="0 0 190 16" aria-hidden="true"><path d="M6 8h64M120 8h64" fill="none" stroke="#d4a017" strokeWidth="1.6" /><path d="M84 8l11-6 11 6-11 6z" fill="none" stroke="#d4a017" strokeWidth="1.6" /></svg>
            <div style={{ marginTop: 34 }}>
              {displayFaqs.map((f, i) => <FaqItem q={f.q} a={f.a} key={f.q} defaultOpen={i === 0} />)}
            </div>
          </div>
        </section>
      )}

      </div>
    </div>
  );
}
