import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { adminApi } from "../lib/adminApi";

interface UserProfile {
  id: string; email: string | null; phone: string | null; full_name: string; status: string;
  city: string | null; state: string | null; country: string | null;
  email_verified: boolean; phone_verified: boolean;
  last_login_at: string | null; login_count: number; created_at: string;
  reviewCount: number; inquiryCount: number;
}
interface ActivityEvent {
  id: string; eventType: string; sourceSurface: string | null; timestamp: string;
  pandit: { slug: string; name: string } | null;
  temple: string | null; service: string | null;
  location: { country: string | null; region: string | null; city: string | null; market: string | null };
  qualifiedLeadId: string | null; deviceType: string | null;
}
interface ActivityResponse {
  user: { id: string; name: string };
  summary: {
    totalSessions: number; panditProfilesViewed: number; chatClicks: number; callClicks: number;
    qualifiedLeads: number; inquiries: number; reviews: number; aiInteractions: number;
  };
  timeline: ActivityEvent[];
  total: number;
}

const EVENT_LABEL: Record<string, string> = {
  LOGIN: "Logged in", LOGOUT: "Logged out",
  PANDIT_PROFILE_VIEW: "Viewed Pandit profile",
  PANDIT_CHAT_CLICK: "Clicked Chat", PANDIT_CALL_CLICK: "Clicked Call",
  AI_RECOMMENDATION: "AI recommendation shown", SEARCH: "Searched",
  TEMPLE_VIEW: "Viewed temple", SERVICE_VIEW: "Viewed service",
  INQUIRY_SUBMITTED: "Submitted inquiry", QUALIFIED_LEAD_CREATED: "Qualified lead created",
  REVIEW_CREATED: "Left a review",
};

export default function AdminUserDetail() {
  const { id } = useParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      adminApi.get<UserProfile>(`/users/${id}`),
      adminApi.get<ActivityResponse>(`/users/${id}/activity?perPage=50`),
    ])
      .then(([p, a]) => { setProfile(p); setActivity(a); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load user"));
  }, [id]);

  if (error) return <div className="admin-login__error">{error}</div>;
  if (!profile) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>{profile.full_name}</h2>
          <p>{profile.email ? `${profile.email} · ` : ""}Joined {new Date(profile.created_at).toLocaleDateString("en-IN")}</p>
        </div>
        <Link to="/admin-panel/users" className="btn btn-outline btn-sm">← Back to Users</Link>
      </div>

      <div className="admin-panel" style={{ marginBottom: 18 }}>
        <div className="admin-panel__head"><h2>Profile</h2></div>
        <div className="admin-panel__body">
          <div className="grid g-4" style={{ gap: 14 }}>
            <div><span className="admin-stat-card__label">Mobile</span><div>{profile.phone || "—"} {profile.phone_verified && <span className="admin-pill admin-pill--green">Verified</span>}</div></div>
            <div><span className="admin-stat-card__label">Email</span><div>{profile.email || "—"} {profile.email_verified && <span className="admin-pill admin-pill--green">Verified</span>}</div></div>
            <div><span className="admin-stat-card__label">Location</span><div>{[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "Unknown"}</div></div>
            <div><span className="admin-stat-card__label">Status</span><div><span className={`admin-pill ${profile.status === "active" ? "admin-pill--green" : "admin-pill--red"}`}>{profile.status}</span></div></div>
            <div><span className="admin-stat-card__label">Last login</span><div>{profile.last_login_at ? new Date(profile.last_login_at).toLocaleString("en-IN") : "Never"}</div></div>
            <div><span className="admin-stat-card__label">Login count</span><div>{profile.login_count}</div></div>
          </div>
        </div>
      </div>

      {!activity ? <p className="muted">Loading activity…</p> : (
        <>
          <div className="admin-stat-grid" style={{ marginBottom: 18 }}>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Sessions</span><div className="admin-stat-card__value">{activity.summary.totalSessions}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Pandit Profiles Viewed</span><div className="admin-stat-card__value">{activity.summary.panditProfilesViewed}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Chat Clicks</span><div className="admin-stat-card__value">{activity.summary.chatClicks}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Call Clicks</span><div className="admin-stat-card__value">{activity.summary.callClicks}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Qualified Leads</span><div className="admin-stat-card__value">{activity.summary.qualifiedLeads}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Inquiries</span><div className="admin-stat-card__value">{activity.summary.inquiries}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">Reviews</span><div className="admin-stat-card__value">{activity.summary.reviews}</div></div>
            <div className="admin-stat-card"><span className="admin-stat-card__label">AI Interactions</span><div className="admin-stat-card__value">{activity.summary.aiInteractions}</div></div>
          </div>

          <div className="admin-panel">
            <div className="admin-panel__head"><h2>Activity timeline ({activity.total})</h2></div>
            <div className="admin-table-wrap">
              {activity.timeline.length ? (
                <table className="admin-table">
                  <thead><tr><th>When</th><th>Event</th><th>Pandit</th><th>Location</th><th>Source</th><th>Lead?</th></tr></thead>
                  <tbody>
                    {activity.timeline.map((e) => (
                      <tr key={e.id}>
                        <td className="muted-cell">{new Date(e.timestamp).toLocaleString("en-IN")}</td>
                        <td>{EVENT_LABEL[e.eventType] || e.eventType}</td>
                        <td>{e.pandit ? <Link to={`/admin-panel/pandits/${e.pandit.slug}/analytics`}>{e.pandit.name}</Link> : "—"}</td>
                        <td className="muted-cell">{[e.location.city, e.location.market].filter(Boolean).join(" · ") || "Unknown"}</td>
                        <td className="muted-cell">{e.sourceSurface || "—"}</td>
                        <td>{e.qualifiedLeadId ? <span className="admin-pill admin-pill--green">Qualified</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="admin-empty">No activity recorded yet for this account.</div>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
