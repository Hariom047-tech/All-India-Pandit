import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "../../lib/icons";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/temples", label: "Temples" },
  { to: "/pandits", label: "Pandits" },
  { to: "/services", label: "Services" },
  { to: "/panchang", label: "Panchang" },
  { to: "/blog", label: "Blog" },
];

const NAV_EXTRA = [
  { to: "/temple-map", label: "Temple Map", icon: "map" },
  { to: "/ai-recommender", label: "AI Pooja Guide", icon: "sparkles" },
  { to: "/dashboard", label: "Pandit Dashboard", icon: "layout-dashboard" },
  { to: "/about", label: "About Us", icon: "info" },
  { to: "/contact", label: "Contact", icon: "mail" },
];

const BOTTOM = [
  { to: "/", label: "Home", icon: "diya" },
  { to: "/temples", label: "Temples", icon: "temple" },
  { to: "/services", label: "Search", icon: "search" },
  { to: "/pandits", label: "Pandits", icon: "users" },
  { to: "/dashboard", label: "Profile", icon: "user" },
];

function Brand({ size }: { size?: string }) {
  return (
    <Link className="brand" to="/" aria-label="PanditConnect home">
      <img src="/assets/img/logo.svg" alt="" width={40} height={40} />
      <span className="brand-name" style={size ? { fontSize: size } : undefined}>
        Pandit<span>Connect</span>
      </span>
    </Link>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);

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
          <Brand />
          <nav className="main-nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "is-active" : "")}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-cta">
            <Link className="btn btn-outline btn-sm" to="/dashboard">
              <Icon name="user" size={17} /> Profile/Login
            </Link>
            <button
              className="nav-toggle"
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
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="row-between">
                <Brand size="1.2rem" />
                <button className="nav-toggle" aria-label="Close menu" style={{ display: "flex" }} onClick={() => setOpen(false)}>
                  <Icon name="x" />
                </button>
              </div>
              <nav className="drawer-links">
                {[...NAV.map((n) => ({ ...n, icon: undefined as string | undefined })), ...NAV_EXTRA].map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "is-active" : "")} onClick={() => setOpen(false)}>
                    {n.icon ? <Icon name={n.icon} size={19} /> : null}
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <Link className="btn btn-gold btn-block" to="/ai-recommender" style={{ marginTop: 22 }} onClick={() => setOpen(false)}>
                <Icon name="sparkles" size={18} /> Which pooja do I need?
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
                <span>{n.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
