import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";

interface InquiryRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
  created_at: string;
  message: string | null;
  pandit_slug: string;
  pandit_name: string;
  temple: string | null;
  service: string | null;
}

interface InquiryDetail extends InquiryRow {
  preferred_date: string | null;
  preferred_time: string | null;
  contact_method: string | null;
  contacted_at: string | null;
}

const STATUS_PILL: Record<string, string> = { new: "admin-pill--blue", seen: "admin-pill--gray", replied: "admin-pill--gold", completed: "admin-pill--green", expired: "admin-pill--red" };
const CONTACT_METHOD_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", phone_call: "Phone call", in_app_message: "In-app message", email: "Email",
};

function DetailItem({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "admin-detail-grid--full" : undefined}>
      <span className="admin-detail-item__label">{label}</span>
      <span className="admin-detail-item__value">{value}</span>
    </div>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminInquiries() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<InquiryRow> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<InquiryDetail | null>(null);

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

  async function openDetail(id: string) {
    setError("");
    try {
      setDetail(await adminApi.get<InquiryDetail>(`/inquiries/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inquiry");
    }
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
              <thead><tr><th>Devotee</th><th>Message</th><th>Pandit</th><th>Service / temple</th><th>Status</th><th>Received</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.full_name}</strong><div className="muted-cell">{i.phone}</div></td>
                    <td className="muted-cell" style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {i.message || "—"}
                    </td>
                    <td className="muted-cell">{i.pandit_name}</td>
                    <td className="muted-cell">{[i.service, i.temple].filter(Boolean).join(" · ") || "—"}</td>
                    <td>
                      <select className="select" value={i.status} disabled={busyId === i.id} onChange={(e) => setStatus(i.id, e.target.value)} style={{ padding: "6px 28px 6px 10px", fontSize: ".78rem" }}>
                        {["new", "seen", "replied", "completed", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span className={`admin-pill ${STATUS_PILL[i.status] || "admin-pill--gray"}`} style={{ marginLeft: 8 }}>{i.status}</span>
                    </td>
                    <td className="muted-cell">{new Date(i.created_at).toLocaleDateString("en-IN")}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => openDetail(i.id)}>View</button></td>
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

      <Modal open={detail !== null} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <div style={{ padding: 24 }}>
            <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 4, paddingRight: 40 }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem" }}>{detail.full_name}</h3>
              <span className={`admin-pill ${STATUS_PILL[detail.status] || "admin-pill--gray"}`} style={{ flex: "none" }}>{detail.status}</span>
            </div>
            <p className="muted" style={{ margin: "2px 0 18px", fontSize: ".85rem" }}>
              {formatDateTime(detail.created_at)} · sent to {detail.pandit_name}
            </p>

            <div className="admin-fieldset" style={{ marginBottom: 20 }}>
              <span className="admin-detail-item__label">Message</span>
              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{detail.message || "No message left."}</p>
            </div>

            <div className="admin-detail-grid">
              <DetailItem label="Phone" value={detail.phone} />
              <DetailItem label="Email" value={detail.email || "—"} />
              <DetailItem label="Service / Temple" value={[detail.service, detail.temple].filter(Boolean).join(" · ") || "—"} />
              <DetailItem label="Preferred contact" value={detail.contact_method ? CONTACT_METHOD_LABEL[detail.contact_method] || detail.contact_method : "—"} />
              <DetailItem label="Preferred date" value={detail.preferred_date ? new Date(detail.preferred_date).toLocaleDateString("en-IN") : "—"} />
              <DetailItem label="Preferred time" value={detail.preferred_time || "—"} />
              <DetailItem label="Contacted at" value={formatDateTime(detail.contacted_at)} full />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
