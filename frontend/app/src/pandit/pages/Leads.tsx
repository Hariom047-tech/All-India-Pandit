import { useCallback, useEffect, useState } from "react";
import { panditApi, patchLeadStatus, type Lead, type LeadStatus } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, EmptyState, formatLeadTime, METHOD_LABEL, STATUS_LABEL } from "./_shared";

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All" },
];
const METHODS = [
  { id: "all", label: "All" },
  { id: "call", label: "Call" },
  { id: "whatsapp", label: "WhatsApp" },
];
const STATUSES: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "viewed", label: "Viewed" },
  { id: "contacted", label: "Contacted" },
  { id: "completed", label: "Completed" },
];

const PAGE_SIZE = 20;

/**
 * Qualified leads only — a raw CTA click never appears here.
 *
 * This is the ONE screen that shows a devotee's name and verified mobile,
 * because it is the one place the pandit needs to act on the contact. The
 * devotee was told at press time that this would be shared. Profile views
 * remain anonymous everywhere.
 */
export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("30d");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    panditApi.leads({ page, limit: PAGE_SIZE, period, method, status })
      .then((res) => { setLeads(res.data); setTotal(res.total); })
      .catch(() => setError("Leads load nahi ho payin."))
      .finally(() => setLoading(false));
  }, [page, period, method, status]);

  useEffect(load, [load]);

  // Any filter change invalidates the current page number.
  useEffect(() => { setPage(1); }, [period, method, status]);

  async function changeStatus(lead: Lead, next: LeadStatus) {
    setSavingId(lead.id);
    const previous = lead.status;
    setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, status: next } : l)));
    try {
      await patchLeadStatus(lead.id, next);
    } catch {
      // Roll the optimistic update back rather than leaving a lie on screen.
      setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, status: previous } : l)));
      setError("Status update nahi ho paya.");
    } finally {
      setSavingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="pandit-page">
      <PageHead title="My Leads" sub="Sirf verified users ki genuine leads yahan dikhti hain." />

      <div className="pandit-filters">
        <FilterGroup label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <FilterGroup label="Type" options={METHODS} value={method} onChange={setMethod} />
        <FilterGroup label="Status" options={STATUSES} value={status} onChange={setStatus} />
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? <Loading label="Leads load ho rahi hain…" /> : leads.length === 0 ? (
        <EmptyState
          title="Abhi koi nayi verified lead nahi hai."
          sub="Jaise hi verified user aapko contact karega, lead yahan dikhegi."
        />
      ) : (
        <>
          {/* Desktop: table. Mobile: the same rows as cards (CSS switches). */}
          <div className="pandit-table-wrap">
            <table className="pandit-table">
              <caption className="sr-only">Qualified leads</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Method</th>
                  <th scope="col">Date/Time</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td data-label="User">{l.contact_name || "Devotee"}</td>
                    <td data-label="Mobile">
                      {l.contact_phone
                        ? <a href={`tel:${l.contact_phone}`} className="pandit-link">{l.contact_phone}</a>
                        : "—"}
                    </td>
                    <td data-label="Method">
                      {METHOD_LABEL[l.first_contact_method]}
                      {l.interaction_count > 1 && (
                        <span className="pandit-chip" title="Isi user ke repeat contacts">
                          ×{l.interaction_count}
                        </span>
                      )}
                    </td>
                    <td data-label="Date/Time">{formatLeadTime(l.created_at)}</td>
                    <td data-label="Status">
                      <span className={`pandit-badge pandit-badge--${l.status}`}>
                        {STATUS_LABEL[l.status]}
                      </span>
                    </td>
                    <td data-label="Action">
                      <div className="pandit-rowactions">
                        {/* Actions can only use the phone stored WITH the lead —
                            no arbitrary number can be injected from the client. */}
                        {l.contact_phone && (
                          <>
                            <a className="pandit-btn pandit-btn--sm" href={`tel:${l.contact_phone}`}>Call</a>
                            <a
                              className="pandit-btn pandit-btn--sm"
                              href={`https://wa.me/${l.contact_phone.replace(/[^\d]/g, "")}`}
                              target="_blank" rel="noopener noreferrer"
                            >WhatsApp</a>
                          </>
                        )}
                        <select
                          className="pandit-select"
                          aria-label={`Status for ${l.contact_name || "lead"}`}
                          value={l.status}
                          disabled={savingId === l.id}
                          onChange={(e) => changeStatus(l, e.target.value as LeadStatus)}
                        >
                          {Object.entries(STATUS_LABEL).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pandit-pager" aria-label="Leads pagination">
            <button className="pandit-btn pandit-btn--ghost" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>← Pichla</button>
            <span>Page {page} / {totalPages} · {total} leads</span>
            <button className="pandit-btn pandit-btn--ghost" disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}>Agla →</button>
          </nav>
        </>
      )}
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="pandit-filter" role="group" aria-label={label}>
      <span className="pandit-filter__label">{label}</span>
      <div className="pandit-filter__pills">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`pandit-pill${value === o.id ? " is-active" : ""}`}
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}
