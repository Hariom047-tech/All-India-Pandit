import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, ADMIN_BASE } from "../lib/adminApi";
import { Icon } from "../../lib/icons";

interface Stats {
  totalUsers: number;
  totalPandits: number;
  totalTemples: number;
  pendingVerifications: number;
  flaggedReviews: number;
  todayInquiries: number;
  pendingInquiries: number;
  monthRevenue: number;
  activeSubscriptions: number;
  todaySignups: number;
}

interface Activity {
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  admin_name: string;
}

const CARDS: { key: keyof Stats; label: string; icon: string; warn?: boolean; money?: boolean }[] = [
  { key: "totalPandits", label: "Total Pandits", icon: "users" },
  { key: "totalTemples", label: "Total Temples", icon: "temple" },
  { key: "totalUsers", label: "Total Users", icon: "user" },
  { key: "pendingVerifications", label: "Pending Verifications", icon: "shield-check", warn: true },
  { key: "flaggedReviews", label: "Flagged Reviews", icon: "alert-circle", warn: true },
  { key: "pendingInquiries", label: "Pending Inquiries", icon: "inbox", warn: true },
  { key: "todayInquiries", label: "Inquiries Today", icon: "message-circle" },
  { key: "todaySignups", label: "Signups Today", icon: "sparkles" },
  { key: "activeSubscriptions", label: "Active Subscriptions", icon: "credit-card" },
  { key: "monthRevenue", label: "Revenue This Month", icon: "trending-up", money: true },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminApi.dashboardStats(), adminApi.recentActivity()])
      .then(([s, a]) => {
        setStats(s as unknown as Stats);
        setActivity(a as Activity[]);
      })
      .catch((err) => setError(err.message || "Failed to load dashboard"));
  }, []);

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Overview</h2>
          <p>Real counts from Postgres — nothing here is illustrative.</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      {!stats ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="admin-stat-grid">
          {CARDS.map((c) => (
            <div className={`admin-stat-card${c.warn && Number(stats[c.key]) > 0 ? " admin-stat-card--warn" : ""}`} key={c.key}>
              <div className="row-between">
                <span className="admin-stat-card__label">{c.label}</span>
                <Icon name={c.icon} size={16} />
              </div>
              <div className="admin-stat-card__value">
                {c.money ? `₹${Number(stats[c.key]).toLocaleString("en-IN")}` : Number(stats[c.key]).toLocaleString("en-IN")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid g-2" style={{ alignItems: "start", gap: 18 }}>
        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>Quick actions</h2>
          </div>
          <div className="admin-panel__body stack" style={{ gap: 10 }}>
            <Link className="btn btn-outline btn-block" to={`${ADMIN_BASE}/pandits?verificationStatus=documents_submitted`}><Icon name="shield-check" size={16} /> Review pending pandit verifications</Link>
            <Link className="btn btn-outline btn-block" to={`${ADMIN_BASE}/reviews?isFlagged=true`}><Icon name="alert-circle" size={16} /> Review flagged reviews</Link>
            <Link className="btn btn-outline btn-block" to={`${ADMIN_BASE}/inquiries?status=new`}><Icon name="inbox" size={16} /> View new inquiries</Link>
            <Link className="btn btn-outline btn-block" to={`${ADMIN_BASE}/temples`}><Icon name="temple" size={16} /> Add or edit a temple</Link>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel__head">
            <h2>Recent admin activity</h2>
          </div>
          <div className="admin-table-wrap">
            {activity.length ? (
              <table className="admin-table">
                <thead><tr><th>Action</th><th>By</th><th>When</th></tr></thead>
                <tbody>
                  {activity.slice(0, 10).map((a, i) => (
                    <tr key={i}>
                      <td>{a.action.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="muted-cell">{a.admin_name}</td>
                      <td className="muted-cell">{new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="admin-empty">No admin activity logged yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
