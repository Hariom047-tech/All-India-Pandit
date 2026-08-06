import { useState, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { motion } from "framer-motion";
import { pandits, stats, panditDisplayName } from "../../data/content";
import { CountUp } from "../ui/CountUp";
import { useLang } from "../../lib/i18n";
import "./HeroAstrotalk.css";

const STAT_KEYS = ["home.statPandits", "home.statTemples", "home.statCeremonies", "home.statCities"];

export function HeroAstrotalk() {
  const { t, lang } = useLang();
  // Grab top 3 pandits for the hero circles
  const top3 = [...pandits].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 3);

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
          
          {/* Left: Text Content */}
          <div className="hero-astro__content">
            <motion.div 
              className="hero-astro__badge"
              initial={{ opacity: 1, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <span className="hero-astro__badge-dot" />
              1,240+ {t("home.heroBadge")}
              <div className="hero-astro__badge-avatars">
                {top3.map((p, i) => (
                  <img key={p.id} src={p.img} alt="" style={{ zIndex: 3 - i }} />
                ))}
              </div>
            </motion.div>

            <motion.h1 
              className="hero-astro__title"
              initial={{ opacity: 1, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {t("home.heroTitle1")} <br />
              <span className="gold-text">{t("home.heroTitleGold")}</span> {t("home.heroTitlePlatform")}
            </motion.h1>

            <motion.ul
              className="hero-astro__list"
              initial={{ opacity: 1, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
            >
              <li>
                <div className="hero-astro__check"><Icon name="check" size={14} /></div>
                {t("home.heroCheck1")}
              </li>
              <li>
                <div className="hero-astro__check"><Icon name="check" size={14} /></div>
                {t("home.heroCheck2")}
              </li>
            </motion.ul>

            <motion.div
              className="hero-astro__cta"
              initial={{ opacity: 1, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Link to="/pandits" className="btn btn-gold btn-lg btn-pill">
                {t("home.heroCta")} <Icon name="arrow-right" size={18} />
              </Link>
            </motion.div>
          </div>

          {/* Right: Circular Portraits */}
          <div className="hero-astro__visual">
            <div className="hero-astro__circles">
              {top3.map((p, i) => {
                const pos = order[i]; // 0, 1, or 2
                return (
                  <motion.div 
                    key={p.id}
                    layout 
                    className={`hero-astro__circle pos-${pos}`}
                    initial={{ opacity: 1, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  >
                    <img src={p.img} alt={panditDisplayName(p, lang)} />
                  </motion.div>
                );
              })}
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
