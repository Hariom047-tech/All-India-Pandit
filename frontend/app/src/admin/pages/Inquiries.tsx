import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";

interface InquiryRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
  created_at: string;
  pandit_slug: string;
  pandit_name: string;
  temple: string | null;
  service: string | null;
}

const STATUS_PILL: Record<string, string> = { new: "admin-pill--blue", seen: "admin-pill--gray", replied: "admin-pill--gold", completed: "admin-pill--green", expired: "admin-pill--red" };

export default function AdminInquiries() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<InquiryRow> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const status = params.get("status") || "";
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      setRows(await adminApi.get<Paged<InquiryRow>>(`/inquiries${qs({ status, page, perPage: 25 })}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inquiries");
    }
  }

  useEffect(() => { load(); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  async function setStatus(id: string, next: string) {
    setBusyId(id);
    try { await adminApi.put(`/inquiries/${id}/status`, { status: next }); await load(); } finally { setBusyId(null); }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Inquiries</h2>
          <p>Every enquiry sent to a pandit through the site, across all profiles.</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <div className="admin-toolbar">
          <select className="select" value={status} onChange={(e) => updateParam("status", e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="seen">Seen</option>
            <option value="replied">Replied</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </select>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} inquiries</span>}
        </div>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Devotee</th><th>Pandit</th><th>Service / temple</th><th>Status</th><th>Received</th></tr></thead>
              <tbody>
                {rows.data.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.full_name}</strong><div className="muted-cell">{i.phone}</div></td>
                    <td className="muted-cell">{i.pandit_name}</td>
                    <td className="muted-cell">{[i.service, i.temple].filter(Boolean).join(" · ") || "—"}</td>
                    <td>
                      <select className="select" value={i.status} disabled={busyId === i.id} onChange={(e) => setStatus(i.id, e.target.value)} style={{ padding: "6px 28px 6px 10px", fontSize: ".78rem" }}>
                        {["new", "seen", "replied", "completed", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span className={`admin-pill ${STATUS_PILL[i.status] || "admin-pill--gray"}`} style={{ marginLeft: 8 }}>{i.status}</span>
                    </td>
                    <td className="muted-cell">{new Date(i.created_at).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No inquiries matched.</div>
          )}
        </div>
        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}><Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} /></div>
        )}
      </div>
    </>
  );
}
