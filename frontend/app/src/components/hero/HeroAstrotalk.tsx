import { useState, useEffect, useMemo, Fragment } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { usePandits, useStats, useHomeHero } from "../../hooks/useData";
import { normPandits } from "../../lib/normalize";
import { CountUp } from "../ui/CountUp";
import { useLang } from "../../lib/i18n";
import "./HeroAstrotalk.css";
import "../ui/DataState.css";

const STAT_KEYS = ["home.statPandits", "home.statTemples", "home.statCeremonies", "home.statCities"];

export function HeroAstrotalk() {
  const { t, lang } = useLang();
  const { data: rawPandits } = usePandits({ perPage: 20 });
  const { data: rawStats } = useStats();
  const pandits = useMemo(() => normPandits(rawPandits), [rawPandits]);
  const stats = rawStats?.length ? rawStats : [
    { icon: "users", num: "500+", label: "Verified Pandits" },
    { icon: "temple", num: "100+", label: "Temples Listed" },
    { icon: "award", num: "50+", label: "Cities Covered" },
    { icon: "star", num: "10K+", label: "Happy Families" },
  ];

  /**
   * Hero circles come from admin-uploaded images (Admin Panel -> Home Page).
   *
   * They used to be the three highest-ranked pandits, which quietly made the
   * front page a side effect of the ranking algorithm — promoting a pandit
   * changed the homepage, and every pandit's face was published there without
   * them choosing it. The top-3 pandits remain the fallback so the hero is
   * never empty before an admin uploads anything.
   */
  const { data: heroImages } = useHomeHero();
  const top3 = useMemo(
    () => [...pandits].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 3),
    [pandits],
  );

  const circles = useMemo(() => {
    if (heroImages?.length) {
      return heroImages.slice(0, 3).map((h) => ({
        key: h.id, src: h.image_url, alt: h.alt_text || "",
      }));
    }
    return top3.map((p) => ({
      key: p.id, src: p.img, alt: lang === "hi" && p.nameHi ? p.nameHi : p.name,
    }));
  }, [heroImages, top3, lang]);

  // order[i] is the visual position (0: center, 1: left, 2: right) for the i-th pandit in top3.
  const [order, setOrder] = useState([0, 1, 2]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Shift array: left -> right -> center -> left
      setOrder(prev => [prev[1], prev[2], prev[0]]);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="hero-astro">
      <div className="shell">
        <div className="hero-astro__grid">
          
          {/* Left: Text Content
              These four elements are the first meaningful content on the
              page — the H1 is the measured mobile LCP element (Phase 12
              baseline, docs/SEO_ARCHITECTURE.md). They were previously
              wrapped in framer-motion entrance fades (initial opacity:0,
              animate to opacity:1), which meant nothing here painted until
              React mounted AND framer-motion's JS initialized AND the
              transition resolved — a JS-gated delay on exactly the content
              LCP measures, for a purely decorative one-time fade-in. Plain
              elements now: content is visible in the very first paint,
              gated only on CSS/fonts, not on a JS animation engine. */}
          <div className="hero-astro__content">
            <div className="hero-astro__badge">
              <span className="hero-astro__badge-dot" />
              1,240+ {t("home.heroBadge")}
              <div className="hero-astro__badge-avatars">
                {circles.map((c, i) => (
                  <img key={c.key} src={c.src} alt="" style={{ zIndex: 3 - i }} />
                ))}
              </div>
            </div>

            <h1 className="hero-astro__title">
              {t("home.heroTitle1")} <br />
              <span className="gold-text">{t("home.heroTitleGold")}</span> {t("home.heroTitlePlatform")}
            </h1>

            <ul className="hero-astro__list">
              <li>
                <div className="hero-astro__check"><Icon name="check" size={14} /></div>
                {t("home.heroCheck1")}
              </li>
              <li>
                <div className="hero-astro__check"><Icon name="check" size={14} /></div>
                {t("home.heroCheck2")}
              </li>
            </ul>

            <div className="hero-astro__cta">
              <Link to="/pandits" className="btn btn-gold btn-lg btn-pill">
                {t("home.heroCta")} <Icon name="arrow-right" size={18} />
              </Link>
            </div>
          </div>

          {/* Right: Circular Portraits */}
          <div className="hero-astro__visual">
            <div className="hero-astro__circles">
              {circles.length
                ? circles.map((c, i) => {
                    const pos = order[i]; // 0: center, 1: left, 2: right
                    return (
                      <div key={c.key} className={`hero-astro__circle pos-${pos}`}>
                        <img src={c.src} alt={c.alt} fetchPriority={pos === 0 ? "high" : undefined} />
                      </div>
                    );
                  })
                // Same 3 positions, filled with a shimmer placeholder instead
                // of an <img> — first paint shouldn't wait on usePandits()/
                // useHomeHero() any more than the rest of this hero does.
                : [0, 1, 2].map((pos) => (
                    <div key={pos} className={`hero-astro__circle pos-${pos}`} aria-hidden="true">
                      <div className="ds-skeleton" style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
                    </div>
                  ))}
            </div>
          </div>
          
        </div>
      </div>

      {/* Stats Row */}
      <div className="hero-astro__stats-row">
        <div className="shell hero-astro__stats-inner">
          {stats.map((s, index) => (
            <div className="hero-astro__stat" key={s.label}>
              <div className="hero-astro__stat-num">
                <CountUp raw={s.num} />
              </div>
              <div className="hero-astro__stat-label">{t(STAT_KEYS[index])}</div>
              {index < stats.length - 1 && <div className="hero-astro__stat-divider" />}
            </div>
          ))}
        </div>
      </div>

      {/* Live Ticker */}
      <div className="hero-astro__ticker">
        <div className="hero-astro__ticker-track">
          <div className="hero-astro__ticker-content">
            {[0, 1].map((dup) => (
              <Fragment key={dup}>
                <span className="ticker-item"><span className="ticker-dot" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker1") }} /> <span className="ticker-time">· {t("home.tickerJustNow")}</span></span>
                <span className="ticker-item"><span className="ticker-dot ticker-dot--gold" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker2") }} /> <span className="ticker-time">· {t("home.ticker2minAgo")}</span></span>
                <span className="ticker-item"><span className="ticker-dot" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker3") }} /> <span className="ticker-time">· {t("home.ticker5minAgo")}</span></span>
                <span className="ticker-item"><span className="ticker-dot ticker-dot--gold" /> <span dangerouslySetInnerHTML={{ __html: t("home.ticker4") }} /> <span className="ticker-time">· {t("home.ticker12minAgo")}</span></span>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
