import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "../../lib/icons";
import { useAuth } from "../../lib/Auth";
import { useLang } from "../../lib/i18n";

const NAV = [
  { to: "/", labelKey: "nav.home" },
  { to: "/temples", labelKey: "nav.temples" },
  { to: "/pandits", labelKey: "nav.pandits" },
  { to: "/services", labelKey: "nav.services" },
  { to: "/panchang", labelKey: "nav.panchang" },
  { to: "/blog", labelKey: "nav.blog" },
];

const NAV_EXTRA = [
  { to: "/pandit-ji", labelKey: "nav.panditJiAi", suffix: " 🔱", icon: "sparkles" },
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
      <img src="/assets/img/logo-suggest.svg" alt="PanditSuggest Logo" style={{ objectFit: 'contain' }} width={40} height={40} />
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

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.ul
            className="ls-dropdown"
            role="listbox"
            aria-label="Language"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
          </motion.ul>
        )}
      </AnimatePresence>
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

          {/* ── MOBILE: hamburger on LEFT ── */}
          <button
            className="nav-toggle nav-toggle--left"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="drawer"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>

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
            {/* Desktop-only buttons */}
            <Link
              className="btn btn-sm hdr-desktop-only"
              to="/pandit-ji"
              style={{
                background: "linear-gradient(135deg, #f3d47d, #d4a017)",
                color: "white",
                border: "none",
                boxShadow: "0 4px 14px rgba(212,160,23,0.3)",
                animation: "pc-pulse 2s infinite"
              }}
            >
              🔱 {t("nav.panditJiAi")}
            </Link>
            <style>{`
              @keyframes pc-pulse {
                0% { box-shadow: 0 0 0 0 rgba(212,160,23,0.6); }
                70% { box-shadow: 0 0 0 8px rgba(212,160,23,0); }
                100% { box-shadow: 0 0 0 0 rgba(212,160,23,0); }
              }
            `}</style>
            {!loading && (
              <Link className="btn btn-outline btn-sm hdr-desktop-only" style={{ marginLeft: '8px' }} to={user ? "/dashboard" : "/login"}>
                <Icon name="user" size={17} /> {user ? t("nav.myProfile") : t("nav.login")}
              </Link>
            )}

            {/* Language switcher — visible on all screen sizes */}
            <LangSwitch />

            {/* Profile circle — mobile only */}
            <Link
              to={user ? "/dashboard" : "/login"}
              className="hdr-profile-btn"
              aria-label={user ? "My profile" : "Login"}
            >
              <Icon name="user" size={18} />
            </Link>

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

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="scrim is-open"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="drawer is-open"
              id="drawer"
              aria-label="Menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
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
                {[...NAV.map((n) => ({ ...n, icon: undefined as string | undefined, suffix: undefined as string | undefined })), ...NAV_EXTRA].map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "is-active" : "")} onClick={() => setOpen(false)}>
                    {n.icon ? <Icon name={n.icon} size={19} /> : null}
                    {t(n.labelKey)}{n.suffix || ""}
                  </NavLink>
                ))}
              </nav>
              <Link className="btn btn-gold btn-block" to="/ai-recommender" style={{ marginTop: 22 }} onClick={() => setOpen(false)}>
                <Icon name="sparkles" size={18} /> {t("nav.whichPoojaDoINeed")}
              </Link>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
