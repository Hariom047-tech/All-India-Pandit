import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi, qs, ADMIN_BASE, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";

interface PanditRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  verification_status: string;
  current_tier: string;
  avg_rating: string;
  review_count: number;
  is_featured: boolean;
  is_available: boolean;
  created_at: string;
}

const VERIFY_PILL: Record<string, string> = {
  verified: "admin-pill--green",
  unverified: "admin-pill--gray",
  documents_submitted: "admin-pill--blue",
  under_review: "admin-pill--blue",
  rejected: "admin-pill--red",
};

export default function AdminPandits() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<PanditRow> | null>(null);
  const [search, setSearch] = useState(params.get("search") || "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const verificationStatus = params.get("verificationStatus") || "";
  const tier = params.get("tier") || "";
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      const res = await adminApi.get<Paged<PanditRow>>(
        `/pandits${qs({ search, verificationStatus, tier, page, perPage: 20 })}`,
      );
      setRows(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pandits");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  async function quickVerify(slug: string, action: "approve" | "reject") {
    setBusyId(slug);
    try {
      await adminApi.post(`/pandits/${slug}/verify`, { action });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFeatured(slug: string, next: boolean) {
    setBusyId(slug);
    try {
      await adminApi.post(`/pandits/${slug}/toggle-featured`, { featured: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="admin-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Pandits</h2>
          <p>Verify profiles, feature listings, set subscription tiers, and edit which services, temples and languages each pandit is associated with.</p>
        </div>
        <Link to={`${ADMIN_BASE}/pandits/new`} className="btn btn-gold" style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}>
          + Add New Pandit
        </Link>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <form
          className="admin-toolbar"
          onSubmit={(e) => { e.preventDefault(); updateParam("search", search); }}
        >
          <input className="input" placeholder="Search name or slug…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={verificationStatus} onChange={(e) => updateParam("verificationStatus", e.target.value)}>
            <option value="">All verification states</option>
            <option value="unverified">Unverified</option>
            <option value="documents_submitted">Documents submitted</option>
            <option value="under_review">Under review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="select" value={tier} onChange={(e) => updateParam("tier", e.target.value)}>
            <option value="">All tiers</option>
            <option value="free">Free</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="diamond">Diamond</option>
          </select>
          <button className="btn btn-outline btn-sm" type="submit">Search</button>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} pandits</span>}
        </form>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th><th>City</th><th>Verification</th><th>Tier</th><th>Rating</th><th>Featured</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.data.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td className="muted-cell">{p.city}, {p.state}</td>
                    <td>
                      <span className={`admin-pill ${VERIFY_PILL[p.verification_status] || "admin-pill--gray"}`}>{p.verification_status.replace("_", " ")}</span>
                      {p.verification_status !== "verified" && p.verification_status !== "rejected" && (
                        <span className="row" style={{ gap: 4, marginTop: 6 }}>
                          <button className="btn btn-sm btn-gold" disabled={busyId === p.slug} onClick={() => quickVerify(p.slug, "approve")} style={{ padding: "3px 10px", fontSize: ".72rem" }}>Approve</button>
                          <button className="btn btn-sm btn-ghost" disabled={busyId === p.slug} onClick={() => quickVerify(p.slug, "reject")} style={{ padding: "3px 10px", fontSize: ".72rem" }}>Reject</button>
                        </span>
                      )}
                    </td>
                    <td><span className="admin-pill admin-pill--gold">{p.current_tier}</span></td>
                    <td className="muted-cell">{Number(p.avg_rating).toFixed(1)} ({p.review_count})</td>
                    <td>
                      <button className={`btn btn-sm ${p.is_featured ? "btn-gold" : "btn-outline"}`} disabled={busyId === p.slug} onClick={() => toggleFeatured(p.slug, !p.is_featured)} style={{ padding: "4px 10px", fontSize: ".76rem" }}>
                        <Icon name="sparkles" size={13} /> {p.is_featured ? "Featured" : "Feature"}
                      </button>
                    </td>
                    <td className="row" style={{ gap: 6 }}>
                      <Link className="btn btn-outline btn-sm" to={`${ADMIN_BASE}/pandits/${p.slug}`}>Edit</Link>
                      <Link className="btn btn-outline btn-sm" to={`${ADMIN_BASE}/pandits/${p.slug}/analytics`}>Analytics</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No pandits matched.</div>
          )}
        </div>

        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}>
            <Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} />
          </div>
        )}
      </div>
    </>
  );
}
