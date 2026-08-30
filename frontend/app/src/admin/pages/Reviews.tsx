import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { StarRow } from "../../components/ui/StarRating";
import { Pager } from "../../components/ui/Pager";

interface ReviewRow {
  id: string;
  reviewable_type: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_approved: boolean;
  is_flagged: boolean;
  flag_reason: string | null;
  author: string;
  created_at: string;
}

export default function AdminReviews() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<ReviewRow> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isFlagged = params.get("isFlagged") || "";
  const isApproved = params.get("isApproved") || "";
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      setRows(await adminApi.get<Paged<ReviewRow>>(`/reviews${qs({ isFlagged, isApproved, page, perPage: 20 })}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviews");
    }
  }

  useEffect(() => { load(); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  async function moderate(id: string, action: "approve" | "reject" | "delete") {
    setBusyId(id);
    try {
      await adminApi.post(`/reviews/${id}/moderate`, { action });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Reviews</h2>
          <p>Approve, reject or delete devotee reviews on pandits and temples.</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <div className="admin-toolbar">
          <select className="select" value={isFlagged} onChange={(e) => updateParam("isFlagged", e.target.value)}>
            <option value="">All reviews</option>
            <option value="true">Flagged only</option>
          </select>
          <select className="select" value={isApproved} onChange={(e) => updateParam("isApproved", e.target.value)}>
            <option value="">Any approval state</option>
            <option value="true">Approved</option>
            <option value="false">Pending / rejected</option>
          </select>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} reviews</span>}
        </div>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Review</th><th>Rating</th><th>Author</th><th>Type</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ maxWidth: 320 }}>
                      {r.title && <strong style={{ display: "block" }}>{r.title}</strong>}
                      <span className="muted-cell">{r.body}</span>
                      {r.is_flagged && <div className="admin-pill admin-pill--red" style={{ marginTop: 6 }}>flagged: {r.flag_reason || "unspecified"}</div>}
                    </td>
                    <td><StarRow rating={r.rating} size={13} /></td>
                    <td className="muted-cell">{r.author}</td>
                    <td className="muted-cell">{r.reviewable_type}</td>
                    <td><span className={`admin-pill ${r.is_approved ? "admin-pill--green" : "admin-pill--gray"}`}>{r.is_approved ? "approved" : "pending"}</span></td>
                    <td className="row" style={{ gap: 6 }}>
                      <button className="btn btn-gold btn-sm" disabled={busyId === r.id} onClick={() => moderate(r.id, "approve")} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Approve</button>
                      <button className="btn btn-outline btn-sm" disabled={busyId === r.id} onClick={() => moderate(r.id, "reject")} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Reject</button>
                      <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => { if (confirm("Delete this review?")) moderate(r.id, "delete"); }} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No reviews matched.</div>
          )}
        </div>
        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}><Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} /></div>
        )}
      </div>
    </>
  );
}
