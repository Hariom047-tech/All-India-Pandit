import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { motion } from "framer-motion";
import { pandits, stats } from "../../data/content";
import { CountUp } from "../ui/CountUp";
import "./HeroAstrotalk.css";

export function HeroAstrotalk() {
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
              1,240+ pandits online now
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
              India's most trusted <br />
              <span className="gold-text">pandit connection</span> platform
            </motion.h1>

            <motion.ul 
              className="hero-astro__list"
              initial={{ opacity: 1, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
            >
              <li>
                <div className="hero-astro__check"><Icon name="check" size={14} /></div>
                Talk directly — No middlemen, 100% Dakshina to Pandit ji
              </li>
              <li>
                <div className="hero-astro__check"><Icon name="check" size={14} /></div>
                Verified Profiles — Video KYC & Vedic qualification audits
              </li>
            </motion.ul>

            <motion.div 
              className="hero-astro__cta"
              initial={{ opacity: 1, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Link to="/pandits" className="btn btn-gold btn-lg btn-pill">
                Find a Pandit <Icon name="arrow-right" size={18} />
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
                    <img src={p.img} alt={p.name} />
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
              <div className="hero-astro__stat-label">{s.label}</div>
              {index < stats.length - 1 && <div className="hero-astro__stat-divider" />}
            </div>
          ))}
        </div>
      </div>

      {/* Live Ticker */}
      <div className="hero-astro__ticker">
        <div className="hero-astro__ticker-track">
          <div className="hero-astro__ticker-content">
            <span className="ticker-item"><span className="ticker-dot"/> <b>Rahul</b> from Mumbai booked Satyanarayan Pooja with <b>Pt. Ram Naresh</b> <span className="ticker-time">· just now</span></span>
            <span className="ticker-item"><span className="ticker-dot ticker-dot--gold"/> <b>Neha</b> from Hyderabad contacted <b>Acharya Prem</b> <span className="ticker-time">· 2 min ago</span></span>
            <span className="ticker-item"><span className="ticker-dot"/> <b>Vikram</b> from Delhi booked Griha Pravesh with <b>Pt. Sharma</b> <span className="ticker-time">· 5 min ago</span></span>
            <span className="ticker-item"><span className="ticker-dot ticker-dot--gold"/> <b>Priya</b> from Pune left a 5-star review for <b>Pt. Mishra</b> <span className="ticker-time">· 12 min ago</span></span>
            {/* Duplicate for infinite loop */}
            <span className="ticker-item"><span className="ticker-dot"/> <b>Rahul</b> from Mumbai booked Satyanarayan Pooja with <b>Pt. Ram Naresh</b> <span className="ticker-time">· just now</span></span>
            <span className="ticker-item"><span className="ticker-dot ticker-dot--gold"/> <b>Neha</b> from Hyderabad contacted <b>Acharya Prem</b> <span className="ticker-time">· 2 min ago</span></span>
            <span className="ticker-item"><span className="ticker-dot"/> <b>Vikram</b> from Delhi booked Griha Pravesh with <b>Pt. Sharma</b> <span className="ticker-time">· 5 min ago</span></span>
            <span className="ticker-item"><span className="ticker-dot ticker-dot--gold"/> <b>Priya</b> from Pune left a 5-star review for <b>Pt. Mishra</b> <span className="ticker-time">· 12 min ago</span></span>
          </div>
        </div>
      </div>
    </section>
  );
}
