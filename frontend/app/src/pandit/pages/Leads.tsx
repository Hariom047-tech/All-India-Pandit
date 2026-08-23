import { useCallback, useEffect, useState } from "react";
import { panditApi, type Lead } from "../lib/panditApi";
import { PageHead, ErrorState, Loading, EmptyState, formatLeadTime, METHOD_LABEL, METHOD_ICON } from "./_shared";
import { PeriodSwitcher, PeriodDropdown } from "../components/charts";

const PERIODS = [
  { id: "today", label: "Daily" },
  { id: "7d", label: "Weekly" },
  { id: "30d", label: "Monthly" },
  { id: "all", label: "All Time" },
];
const METHODS = [
  { id: "all", label: "All" },
  { id: "call", label: "Call" },
  { id: "whatsapp", label: "WhatsApp" },
];

const PAGE_SIZE = 20;

/**
 * Qualified leads only — a raw CTA click never appears here.
 *
 * This is the ONE screen that shows a devotee's name and verified mobile,
 * because it is the one place the pandit needs to act on the contact. The
 * devotee was told at press time that this would be shared. Profile views
 * remain anonymous everywhere.
 *
 * Deliberately no Status column/workflow here — a pandit reads this list to
 * see who contacted them and call back, not to run a CRM pipeline.
 */
export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("30d");
  const [method, setMethod] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    panditApi.leads({ page, limit: PAGE_SIZE, period, method })
      .then((res) => { setLeads(res.data); setTotal(res.meta.total); })
      .catch(() => setError("Leads load nahi ho payin."))
      .finally(() => setLoading(false));
  }, [page, period, method]);

  useEffect(load, [load]);

  // Any filter change invalidates the current page number.
  useEffect(() => { setPage(1); }, [period, method]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="pandit-page">
      <PageHead title="My Leads" sub="Sirf verified users ki genuine leads yahan dikhti hain." />

      <div className="pandit-panel pandit-filters pandit-filters--row">
        <PeriodDropdown label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <PeriodSwitcher label="Type" options={METHODS} value={method} onChange={setMethod} />
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? <Loading label="Leads load ho rahi hain…" /> : leads.length === 0 ? (
        <EmptyState
          title="Abhi koi nayi verified lead nahi hai."
          sub="Jaise hi verified user aapko contact karega, lead yahan dikhegi."
        />
      ) : (
        <div className="pandit-panel">
          {/* Desktop: table. Mobile: the same rows as cards (CSS switches). */}
          <div className="pandit-table-wrap">
            <table className="pandit-table">
              <caption className="sr-only">Qualified leads</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">City</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Method</th>
                  <th scope="col">Date/Time</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td data-label="User">
                      {l.contact_name || "Devotee"}
                      <span className="pandit-chip pandit-chip--verified" title="Phone-verified devotee">✓ Verified</span>
                    </td>
                    <td data-label="City">{l.city ? `${l.city}${l.state ? `, ${l.state}` : ""}` : "—"}</td>
                    <td data-label="Mobile">
                      {l.contact_phone
                        ? <a href={`tel:${l.contact_phone}`} className="pandit-link">{l.contact_phone}</a>
                        : "—"}
                    </td>
                    <td data-label="Method">
                      <span aria-hidden="true">{METHOD_ICON[l.first_contact_method]}</span> {METHOD_LABEL[l.first_contact_method]}
                      {l.interaction_count > 1 && (
                        <span className="pandit-chip" title="Isi user ke repeat contacts">
                          ×{l.interaction_count}
                        </span>
                      )}
                    </td>
                    <td data-label="Date/Time">{formatLeadTime(l.created_at)}</td>
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
        </div>
      )}
    </div>
  );
}
