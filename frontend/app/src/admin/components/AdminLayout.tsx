import { useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { useAdminAuth } from "../lib/AdminAuth";
import { ADMIN_BASE } from "../lib/adminApi";

const NAV: { group: string; items: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  {
    group: "Overview",
    items: [{ to: ADMIN_BASE, label: "Dashboard", icon: "layout-dashboard", end: true }],
  },
  {
    group: "Directory",
    items: [
      { to: `${ADMIN_BASE}/pandits`, label: "Pandits", icon: "users" },
      { to: `${ADMIN_BASE}/temples`, label: "Temples", icon: "temple" },
      { to: `${ADMIN_BASE}/services`, label: "Services", icon: "diya" },
    ],
  },
  {
    group: "Engagement",
    items: [
      { to: `${ADMIN_BASE}/reviews`, label: "Reviews", icon: "star" },
      { to: `${ADMIN_BASE}/inquiries`, label: "Inquiries", icon: "inbox" },
      { to: `${ADMIN_BASE}/users`, label: "Users", icon: "user" },
    ],
  },
  {
    group: "Platform",
    items: [
      { to: `${ADMIN_BASE}/analytics`, label: "Analytics", icon: "bar-chart" },
      { to: `${ADMIN_BASE}/leads`, label: "Lead Distribution", icon: "trending-up" },
      { to: `${ADMIN_BASE}/security`, label: "Security", icon: "shield-check" },
      { to: `${ADMIN_BASE}/settings`, label: "Settings", icon: "settings" },
    ],
  },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";
}

export function AdminLayout() {
  const { user, loading, logout } = useAdminAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to={`${ADMIN_BASE}/login`} replace state={{ from: location.pathname }} />;

  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className={`admin-sidebar${navOpen ? " is-open" : ""}`}>
          <div className="admin-sidebar__brand">
            <img src="/assets/img/logo.svg" alt="" />
            <span>Pandit<span className="gold-text">Connect</span></span>
            <span className="admin-sidebar__badge">Admin</span>
          </div>
          <nav className="admin-nav">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="admin-nav__group">{g.group}</div>
                {g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "is-active" : "")} onClick={() => setNavOpen(false)}>
                    <Icon name={n.icon} size={17} />
                    {n.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="admin-sidebar__foot">
            <div className="admin-user-chip">
              <span className="admin-user-chip__avatar">{initials(user.fullName || user.email)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="admin-user-chip__name" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.fullName || user.email}</span>
                <span className="admin-user-chip__role">{user.role.replace("_", " ")}</span>
              </span>
            </div>
            <button className="btn btn-outline btn-sm btn-block" style={{ marginTop: 10 }} onClick={logout}>
              <Icon name="x" size={15} /> Sign out
            </button>
          </div>
        </aside>

        {navOpen && <div className="scrim is-open" onClick={() => setNavOpen(false)} style={{ zIndex: 90 }} />}

        <div className="admin-main">
          <div className="admin-topbar">
            <button className="admin-nav-toggle nav-toggle" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <Icon name="menu" />
            </button>
            <div>
              <h1>Admin Panel</h1>
              <div className="admin-topbar__crumb">Manage the whole PanditSuggest directory from here</div>
            </div>
          </div>
          <div className="admin-content">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
