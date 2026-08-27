import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";

interface UserRow {
  id: string;
  email: string | null;
  /** Present on the admin payload; devotees who signed up with Google may have none. */
  phone: string | null;
  full_name: string;
  role: string;
  status: string;
  city: string | null;
  state: string | null;
  country: string | null;
  created_at: string;
}

export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<UserRow> | null>(null);
  const [search, setSearch] = useState(params.get("search") || "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const status = params.get("status") || "";
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      // No `role` param anymore — this endpoint is hard-scoped server-side
      // to role=devotee (see admin/users.repository.js's list()). Pandits
      // live only on the Pandits page; admin accounts only on Admin Users.
      setRows(await adminApi.get<Paged<UserRow>>(`/users${qs({ search, status, page, perPage: 25 })}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }

  useEffect(() => { load(); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  async function suspend(id: string) {
    if (!confirm("Suspend this account?")) return;
    setBusyId(id);
    try { await adminApi.post(`/users/${id}/suspend`, {}); await load(); } finally { setBusyId(null); }
  }
  async function ban(id: string) {
    if (!confirm("Ban this account? All their sessions will be revoked immediately.")) return;
    setBusyId(id);
    try { await adminApi.post(`/users/${id}/ban`, {}); await load(); } finally { setBusyId(null); }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Users</h2>
          <p>Devotees/customers only — Pandits have their own section, admin accounts live under Admin Users.</p>
        </div>
        <Link to="/admin-panel/admin-users" className="btn btn-outline btn-sm">Admin Users →</Link>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); updateParam("search", search); }}>
          <input className="input" placeholder="Search name, email or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={status} onChange={(e) => updateParam("status", e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
          <button className="btn btn-outline btn-sm" type="submit">Search</button>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} users</span>}
        </form>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Location</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((u) => (
                  <tr key={u.id}>
                    <td><Link to={`/admin-panel/users/${u.id}`} style={{ color: "inherit", fontWeight: 700 }}>{u.full_name}</Link></td>
                    <td className="muted-cell">{u.email}</td>
                    <td className="muted-cell">
                      {u.phone
                        ? <a href={`tel:${u.phone}`} style={{ color: "inherit" }}>{u.phone}</a>
                        : "—"}
                    </td>
                    <td className="muted-cell">{[u.city, u.state, u.country].filter(Boolean).join(", ") || "Unknown"}</td>
                    <td><span className={`admin-pill ${u.status === "active" ? "admin-pill--green" : "admin-pill--red"}`}>{u.status}</span></td>
                    <td className="row" style={{ gap: 6 }}>
                      {u.status === "active" && (
                        <>
                          <button className="btn btn-outline btn-sm" disabled={busyId === u.id} onClick={() => suspend(u.id)} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Suspend</button>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === u.id} onClick={() => ban(u.id)} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Ban</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No users matched.</div>
          )}
        </div>
        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}><Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} /></div>
        )}
      </div>
    </>
  );
}
