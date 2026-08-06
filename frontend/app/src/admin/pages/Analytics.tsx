import { useEffect, useState } from "react";
import { adminApi } from "../lib/adminApi";

interface Overview {
  period: string; newUsers: number; newPandits: number; newReviews: number; newInquiries: number;
  totalProfileViews: number; totalContactClicks: number; totalTempleViews: number;
}
interface TopPandit { slug: string; name: string; avg_rating: string; review_count: number; total_profile_views: number; }
interface TopTemple { slug: string; name: string; avg_rating: string; review_count: number; total_views: number; }
interface TopService { slug: string; name: string; pandit_count?: number; }
interface TopCity { city: string; count?: number; }

export default function AdminAnalytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pandits, setPandits] = useState<TopPandit[]>([]);
  const [temples, setTemples] = useState<TopTemple[]>([]);
  const [services, setServices] = useState<TopService[]>([]);
  const [cities, setCities] = useState<TopCity[]>([]);

  useEffect(() => {
    Promise.all([
      adminApi.get<Overview>("/analytics/overview"),
      adminApi.get<TopPandit[]>("/analytics/top-pandits"),
      adminApi.get<TopTemple[]>("/analytics/top-temples"),
      adminApi.get<TopService[]>("/analytics/top-services"),
      adminApi.get<TopCity[]>("/analytics/top-cities"),
    ]).then(([o, p, t, s, c]) => {
      setOverview(o); setPandits(p); setTemples(t); setServices(s); setCities(c);
    });
  }, []);

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Analytics</h2>
          <p>Platform-wide numbers for the last {overview?.period || "30d"}.</p>
        </div>
      </div>

      {overview && (
        <div className="admin-stat-grid">
          <div className="admin-stat-card"><div className="admin-stat-card__label">New Users</div><div className="admin-stat-card__value">{overview.newUsers}</div></div>
          <div className="admin-stat-card"><div className="admin-stat-card__label">New Pandits</div><div className="admin-stat-card__value">{overview.newPandits}</div></div>
          <div className="admin-stat-card"><div className="admin-stat-card__label">New Reviews</div><div className="admin-stat-card__value">{overview.newReviews}</div></div>
          <div className="admin-stat-card"><div className="admin-stat-card__label">New Inquiries</div><div className="admin-stat-card__value">{overview.newInquiries}</div></div>
          <div className="admin-stat-card"><div className="admin-stat-card__label">Total Profile Views</div><div className="admin-stat-card__value">{Number(overview.totalProfileViews).toLocaleString("en-IN")}</div></div>
          <div className="admin-stat-card"><div className="admin-stat-card__label">Total Contact Clicks</div><div className="admin-stat-card__value">{Number(overview.totalContactClicks).toLocaleString("en-IN")}</div></div>
          <div className="admin-stat-card"><div className="admin-stat-card__label">Total Temple Views</div><div className="admin-stat-card__value">{Number(overview.totalTempleViews).toLocaleString("en-IN")}</div></div>
        </div>
      )}

      <div className="grid g-2" style={{ gap: 18, alignItems: "start" }}>
        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Top pandits by rank</h2></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Pandit</th><th>Rating</th><th>Views</th></tr></thead>
              <tbody>{pandits.map((p) => <tr key={p.slug}><td>{p.name}</td><td className="muted-cell">{Number(p.avg_rating).toFixed(1)} ({p.review_count})</td><td className="muted-cell">{p.total_profile_views}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Top temples by views</h2></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Temple</th><th>Rating</th><th>Views</th></tr></thead>
              <tbody>{temples.map((t) => <tr key={t.slug}><td>{t.name}</td><td className="muted-cell">{Number(t.avg_rating).toFixed(1)} ({t.review_count})</td><td className="muted-cell">{t.total_views}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Top services</h2></div>
          <div className="admin-panel__body row wrap" style={{ gap: 8 }}>
            {services.map((s) => <span key={s.slug} className="admin-pill admin-pill--gold">{s.name}</span>)}
          </div>
        </div>
        <div className="admin-panel">
          <div className="admin-panel__head"><h2>Top cities</h2></div>
          <div className="admin-panel__body row wrap" style={{ gap: 8 }}>
            {cities.map((c) => <span key={c.city} className="admin-pill admin-pill--blue">{c.city}{c.count ? ` (${c.count})` : ""}</span>)}
          </div>
        </div>
      </div>
    </>
  );
}
