import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/Auth";
import "../pandit.css";

const NAV = [
  { to: "/pandit/dashboard", label: "Dashboard", icon: "🏠", end: true },
  { to: "/pandit/dashboard/leads", label: "My Leads", icon: "📞" },
  { to: "/pandit/dashboard/profile", label: "My Profile", icon: "👤" },
  { to: "/pandit/dashboard/services", label: "Services", icon: "🪔" },
  { to: "/pandit/dashboard/availability", label: "Availability", icon: "📅" },
  { to: "/pandit/dashboard/reviews", label: "Reviews", icon: "⭐" },
  { to: "/pandit/dashboard/analytics", label: "Analytics", icon: "📊" },
  { to: "/pandit/dashboard/plan", label: "My Plan", icon: "💎" },
  { to: "/pandit/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export function PanditLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // A drawer that survives navigation traps the user behind an overlay on
  // mobile — close it whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function onLogout() {
    logout();
    navigate("/pandit-login", { replace: true });
  }

  return (
    <div className="pandit-shell">
      <header className="pandit-topbar">
        <button
          className="pandit-topbar__menu"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="Menu kholein"
          aria-expanded={drawerOpen}
          aria-controls="pandit-sidebar"
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="pandit-topbar__brand">PanditSuggest</span>
        <span className="pandit-topbar__spacer" />
        <span className="pandit-topbar__who" title={user?.email}>{user?.full_name || "Pandit Ji"}</span>
      </header>

      {drawerOpen && (
        <div className="pandit-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="pandit-sidebar"
        className={`pandit-sidebar${drawerOpen ? " pandit-sidebar--open" : ""}`}
      >
        <div className="pandit-sidebar__head">
          <span className="pandit-sidebar__om" aria-hidden="true">🕉️</span>
          <div>
            <strong>{user?.full_name || "Pandit Ji"}</strong>
            <small>Pandit Dashboard</small>
          </div>
        </div>

        <nav className="pandit-nav" aria-label="Dashboard navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `pandit-nav__item${isActive ? " is-active" : ""}`}
            >
              <span className="pandit-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button className="pandit-nav__item pandit-nav__item--logout" onClick={onLogout}>
            <span className="pandit-nav__icon" aria-hidden="true">🚪</span>
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <main className="pandit-main">
        <Outlet />
      </main>
    </div>
  );
}
