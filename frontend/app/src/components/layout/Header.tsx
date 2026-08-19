import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { useAuth } from "../../lib/Auth";
import { useLang } from "../../lib/i18n";

const NAV = [
  { to: "/", labelKey: "nav.home" },
  { to: "/temples", labelKey: "nav.temples" },
  { to: "/pandits", labelKey: "nav.pandits" },
  { to: "/services", labelKey: "nav.services" },
  { to: "/blog", labelKey: "nav.blog" },
];

// "Pandit Ji AI" (/pandit-ji) was removed: two AI entry points meant two
// different answers to the same question, and only one of them was grounded in
// the knowledge base and real pandit data. The AI Pooja Guide below is the
// single surface now.
const NAV_EXTRA = [
  { to: "/temple-map", labelKey: "nav.templeMap", icon: "map" },
  { to: "/ai-recommender", labelKey: "nav.aiRecommender", icon: "sparkles" },
  { to: "/dashboard", labelKey: "nav.dashboard", icon: "layout-dashboard" },
  { to: "/about", labelKey: "nav.about", icon: "info" },
  { to: "/contact", labelKey: "nav.contact", icon: "mail" },
];

const BOTTOM = [
  { to: "/", labelKey: "nav.home", icon: "diya" },
  { to: "/temples", labelKey: "nav.temples", icon: "temple" },
  { to: "/search", labelKey: "common.search", icon: "search" },
  { to: "/pandits", labelKey: "nav.pandits", icon: "users" },
  { to: "/dashboard", labelKey: "common.profile", icon: "user" },
];

function Brand({ size }: { size?: string }) {
  return (
    <Link className="brand" to="/" aria-label="PanditSuggest home">
      <img src="/assets/img/logo-new.png" alt="PanditSuggest Logo" width={60} height={60} style={{ objectFit: 'contain' }} />
      <span className="brand-name" style={size ? { fontSize: size } : undefined}>
        Pandit <span>Suggest</span>
      </span>
    </Link>
  );
}

/** Astrotalk-style "अA" compact dropdown language switcher */
export function LangSwitch({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`ls-wrap${compact ? " ls-wrap--compact" : ""}`}>
      {/* Trigger pill */}
      <button
        type="button"
        className="ls-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
      >
        <span className="ls-btn__hi">अ</span>
        <span className="ls-btn__en">A</span>
      </button>

      {/* Dropdown — CSS-only transition (base.css's .ls-dropdown/.is-open),
          not framer-motion: this is a simple opacity/transform fade with no
          gesture or layout dependency, and framer-motion's JS was pure
          overhead here — always in the DOM, every page, gating nothing but
          costing initial-bundle weight (Phase 12, docs/SEO_ARCHITECTURE.md). */}
      <ul
        className={`ls-dropdown${open ? " is-open" : ""}`}
        role="listbox"
        aria-label="Language"
      >
        {/* English */}
        <li
          role="option"
          aria-selected={lang === "en"}
          className={`ls-option${lang === "en" ? " ls-option--active" : ""}`}
          onClick={() => { setLang("en"); setOpen(false); }}
        >
          <span className="ls-option__flag">🇮🇳</span>
          <span className="ls-option__label">English</span>
          {lang === "en" && <span className="ls-option__check">✓</span>}
        </li>

        {/* Hindi */}
        <li
          role="option"
          aria-selected={lang === "hi"}
          className={`ls-option${lang === "hi" ? " ls-option--active" : ""}`}
          onClick={() => { setLang("hi"); setOpen(false); }}
        >
          <span className="ls-option__flag">🙏</span>
          <span className="ls-option__label">हिंदी</span>
          {lang === "hi" && <span className="ls-option__check">✓</span>}
        </li>
      </ul>
    </div>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const { t } = useLang();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">

          {/* ── MOBILE: hamburger on LEFT (Removed) ── */}

          <Brand />

          <nav className="main-nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "is-active" : "")}>
                {t(n.labelKey)}
              </NavLink>
            ))}
          </nav>

          {/* RIGHT actions */}
          <div className="header-cta">
            {/* Desktop-only buttons.
                Now points at the AI Pooja Guide — the grounded assistant — not
                the removed /pandit-ji chat. The pulse animation is kept but
                honours prefers-reduced-motion, which the original did not: an
                infinitely pulsing CTA is exactly what that setting is for. */}
            <Link
              className="btn btn-sm hdr-desktop-only hdr-ai-cta"
              to="/ai-recommender"
            >
              <Icon name="sparkles" size={15} /> {t("nav.aiRecommender")}
            </Link>
            <style>{`
              .hdr-ai-cta {
                background: linear-gradient(135deg, #f3d47d, #d4a017);
                color: #fff;
                border: none;
                box-shadow: 0 4px 14px rgba(212,160,23,0.3);
                animation: pc-pulse 2s infinite;
              }
              @keyframes pc-pulse {
                0% { box-shadow: 0 0 0 0 rgba(212,160,23,0.6); }
                70% { box-shadow: 0 0 0 8px rgba(212,160,23,0); }
                100% { box-shadow: 0 0 0 0 rgba(212,160,23,0); }
              }
              @media (prefers-reduced-motion: reduce) {
                .hdr-ai-cta { animation: none; }
              }
            `}</style>
            {!loading && (
              <Link className="btn btn-outline btn-sm hdr-desktop-only" style={{ marginLeft: '8px' }} to={user ? "/dashboard" : "/login"}>
                <Icon name="user" size={17} /> {user ? t("nav.myProfile") : t("nav.login")}
              </Link>
            )}

            {/* Language switcher — visible on all screen sizes */}
            <LangSwitch />

            {/* Profile circle (Removed) */}

            {/* Desktop hamburger (hidden on mobile, replaced by left toggle) */}
            <button
              className="nav-toggle nav-toggle--right"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="drawer"
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
            </button>
          </div>
        </div>
      </header>

      {/* CSS-only transition — base.css's .scrim/.drawer already define the
          full opacity/transform transition (`.drawer.is-open { transform:
          translateX(0) }`, `.scrim.is-open { opacity: 1 }`); framer-motion's
          AnimatePresence here was doing the exact same animation a second
          time, on top of the CSS, purely as JS bundle weight (Phase 12,
          docs/SEO_ARCHITECTURE.md). Always rendered now — off-screen/
          invisible via the same CSS when closed — instead of conditionally
          mounted, matching how the CSS transition was already written. */}
      <div className={`scrim${open ? " is-open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`drawer${open ? " is-open" : ""}`} id="drawer" aria-label="Menu">
        <div className="row-between">
          <Brand size="1.2rem" />
          <button className="nav-toggle" aria-label="Close menu" style={{ display: "flex" }} onClick={() => setOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <LangSwitch />
        </div>
        <nav className="drawer-links">
          {[...NAV.map((n) => ({ ...n, icon: undefined as string | undefined })), ...NAV_EXTRA].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "is-active" : "")} onClick={() => setOpen(false)}>
              {n.icon ? <Icon name={n.icon} size={19} /> : null}
              {t(n.labelKey)}
            </NavLink>
          ))}
        </nav>
        <Link className="btn btn-gold btn-block" to="/ai-recommender" style={{ marginTop: 22 }} onClick={() => setOpen(false)}>
          <Icon name="sparkles" size={18} /> {t("nav.whichPoojaDoINeed")}
        </Link>
      </aside>

      <nav className="bottom-nav" aria-label="Quick navigation">
        <ul>
          {BOTTOM.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "is-active" : "")}>
                <Icon name={n.icon} size={22} />
                <span>{t(n.labelKey)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
