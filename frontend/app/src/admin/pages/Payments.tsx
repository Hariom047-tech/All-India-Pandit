import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";
import { useAdminAuth } from "../lib/AdminAuth";

interface PaymentRow {
  id: string;
  pandit_slug: string;
  pandit_name: string;
  amount: string;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded" | "cancelled";
  gateway: string;
  invoice_number: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PaymentDetail extends PaymentRow {
  plan_name_snapshot: string | null;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  gateway_refund_id: string | null;
  failure_code: string | null;
  failure_description: string | null;
  refund_amount: string | null;
  refunded_at: string | null;
}

const STATUS_PILL: Record<string, string> = {
  completed: "admin-pill--green", pending: "admin-pill--blue",
  failed: "admin-pill--red", refunded: "admin-pill--gray", cancelled: "admin-pill--gray",
};
const STATUS_LABEL: Record<string, string> = {
  completed: "Successful", pending: "Pending", failed: "Failed", refunded: "Refunded", cancelled: "Cancelled",
};

function DetailItem({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "admin-detail-grid--full" : undefined}>
      <span className="admin-detail-item__label">{label}</span>
      <span className={`admin-detail-item__value${mono ? " admin-detail-item__value--mono" : ""}`}>{value}</span>
    </div>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Consumes GET /admin/payments + GET /admin/payments/:id + POST
 * /admin/payments/:id/refund — all already built on the backend, never
 * previously wired to any frontend page. Refund is super_admin-gated on
 * the backend route itself; the button here is hidden for a plain admin
 * to match (see Security.tsx / Settings.tsx's inline role-check convention).
 */
export default function AdminPayments() {
  const { user } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<PaymentRow> | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  const status = params.get("status") || "";
  const page = Number(params.get("page") || 1);
  const canRefund = user?.role === "super_admin";

  async function load() {
    try {
      const res = await adminApi.get<Paged<PaymentRow>>(`/payments${qs({ status, page, perPage: 25 })}`);
      setRows(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
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
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  async function openDetail(id: string) {
    setError("");
    try {
      const d = await adminApi.get<PaymentDetail>(`/payments/${id}`);
      setDetail(d);
      setRefundAmount(d.amount);
      setRefundReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment detail");
    }
  }

  async function submitRefund() {
    if (!detail) return;
    setRefunding(true); setError("");
    try {
      const updated = await adminApi.post<PaymentDetail>(`/payments/${detail.id}/refund`, {
        amount: Number(refundAmount), reason: refundReason.trim() || undefined,
      });
      setDetail(updated);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setRefunding(false);
    }
  }

  return (
    <>
      <div className="admin-page-head">
        <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Payments</h2>
        <p>Every payment_transactions row — successful, pending, failed and refunded.</p>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => e.preventDefault()}>
          <select className="select" value={status} onChange={(e) => updateParam("status", e.target.value)}>
            <option value="">All statuses</option>
            <option value="completed">Successful</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} payments</span>}
        </form>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th><th>Pandit</th><th>Amount</th><th>Status</th><th>Invoice</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.data.map((p) => (
                  <tr key={p.id}>
                    <td className="muted-cell">{formatDateTime(p.created_at)}</td>
                    <td><strong>{p.pandit_name}</strong><div className="muted-cell">{p.pandit_slug}</div></td>
                    <td>₹{Number(p.amount).toLocaleString("en-IN")}</td>
                    <td><span className={`admin-pill ${STATUS_PILL[p.status]}`}>{p.status}</span></td>
                    <td className="muted-cell">{p.invoice_number || "—"}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => openDetail(p.id)}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No payments matched.</div>
          )}
        </div>

        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}>
            <Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} />
          </div>
        )}
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)}>
        {detail && (
          <div style={{ padding: 24 }}>
            <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 4, paddingRight: 40 }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem" }}>Payment Detail</h3>
              <span className={`admin-pill ${STATUS_PILL[detail.status]}`} style={{ flex: "none" }}>{STATUS_LABEL[detail.status]}</span>
            </div>
            <p className="muted" style={{ margin: "2px 0 18px", fontSize: ".85rem" }}>
              {detail.invoice_number || "No invoice number"}
            </p>

            <div className="admin-hero-amount">
              <span className="admin-hero-amount__label">Amount</span>
              <div className="admin-hero-amount__value">₹{Number(detail.amount).toLocaleString("en-IN")}</div>
              {detail.plan_name_snapshot && <div className="admin-hero-amount__sub">{detail.plan_name_snapshot} plan</div>}
            </div>

            <div className="admin-detail-grid" style={{ marginBottom: 20 }}>
              <DetailItem label="Pandit" value={detail.pandit_name || "—"} />
              {detail.pandit_slug && <DetailItem label="Slug" value={detail.pandit_slug} mono />}
              <DetailItem label="Paid At" value={formatDateTime(detail.paid_at)} />
              <DetailItem label="Gateway" value={detail.gateway || "—"} />
              <DetailItem label="Razorpay Order" value={detail.gateway_order_id || "—"} mono full />
              <DetailItem label="Razorpay Payment" value={detail.gateway_payment_id || "—"} mono full />
            </div>

            {detail.status === "failed" && (
              <div className="admin-refund-note admin-refund-note--fail">
                <strong>{detail.failure_code || "Payment failed"}</strong>
                {detail.failure_description && <div className="muted-cell" style={{ marginTop: 4 }}>{detail.failure_description}</div>}
              </div>
            )}

            {detail.refund_amount && (
              <div className="admin-refund-note admin-refund-note--ok">
                <strong>₹{Number(detail.refund_amount).toLocaleString("en-IN")} refunded</strong>
                <div className="muted-cell" style={{ marginTop: 4 }}>
                  {formatDateTime(detail.refunded_at)} · {detail.gateway_refund_id ? `Razorpay ref: ${detail.gateway_refund_id}` : "recorded manually, no gateway configured"}
                </div>
              </div>
            )}

            {detail.status === "completed" && (
              canRefund ? (
                <div className="admin-fieldset" style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Issue refund</div>
                  <div className="admin-form-grid">
                    <div className="admin-field">
                      <label>Amount (₹)</label>
                      <input className="input" type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                    </div>
                    <div className="admin-field">
                      <label>Reason</label>
                      <input className="input" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Devotee requested / duplicate charge / …" />
                    </div>
                  </div>
                  <button className="btn btn-outline" style={{ marginTop: 12 }} disabled={refunding} onClick={submitRefund}>
                    {refunding ? "Processing…" : "Refund via Razorpay"}
                  </button>
                  <p className="muted" style={{ fontSize: ".78rem", marginTop: 10 }}>
                    Calls Razorpay's real refund API when this environment has gateway keys configured; otherwise records the refund in our own records only.
                  </p>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: ".85rem", marginTop: 16 }}>Refunds require a super_admin account.</p>
              )
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
