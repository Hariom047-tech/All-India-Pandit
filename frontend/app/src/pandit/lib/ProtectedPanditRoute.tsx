import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/Auth";

/**
 * One guard for the whole /pandit surface, rather than a role check
 * copy-pasted into nine page components — the copy-pasted version is the one
 * that eventually gets forgotten on a newly added page.
 *
 * This is UX only. It decides what to RENDER, never what data is allowed out:
 * every /me/* endpoint independently re-derives the pandit from the bearer
 * session, and Postgres RLS refuses cross-pandit rows regardless. Someone who
 * bypasses this component in devtools gets an empty, 401-ing shell.
 */
export function ProtectedPanditRoute() {
  const { loading, isAuthenticated, isPandit, isActive } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="pandit-boot" role="status" aria-live="polite">
        <div className="pandit-boot__spinner" />
        <span>Dashboard load ho raha hai…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/pandit-login" replace state={{ from: location.pathname }} />;
  }

  if (!isPandit) {
    return (
      <div className="pandit-denied">
        <h1>Access nahi hai</h1>
        <p>Yeh dashboard sirf registered Pandit Ji accounts ke liye hai.</p>
        <div className="pandit-denied__actions">
          <a className="pandit-btn pandit-btn--primary" href="/">Home par jaayein</a>
          <a className="pandit-btn pandit-btn--ghost" href="/pandit-login">Pandit login</a>
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="pandit-denied">
        <h1>Account active nahi hai</h1>
        <p>Aapka account abhi active nahi hai. Kripya support se sampark karein.</p>
        <a className="pandit-btn pandit-btn--primary" href="/contact">Contact Support</a>
      </div>
    );
  }

  return <Outlet />;
}
