import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  city: string | null;
  state: string | null;
  created_at: string;
}

const ROLE_PILL: Record<string, string> = { super_admin: "admin-pill--gold", admin: "admin-pill--gold", pandit: "admin-pill--blue", devotee: "admin-pill--gray" };

export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<UserRow> | null>(null);
  const [search, setSearch] = useState(params.get("search") || "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const role = params.get("role") || "";
  const status = params.get("status") || "";
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      setRows(await adminApi.get<Paged<UserRow>>(`/users${qs({ search, role, status, page, perPage: 25 })}`));
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
          <p>Every account on the platform — devotees, pandits and fellow admins.</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); updateParam("search", search); }}>
          <input className="input" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={role} onChange={(e) => updateParam("role", e.target.value)}>
            <option value="">All roles</option>
            <option value="devotee">Devotee</option>
            <option value="pandit">Pandit</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
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
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong></td>
                    <td className="muted-cell">{u.email}</td>
                    <td><span className={`admin-pill ${ROLE_PILL[u.role] || "admin-pill--gray"}`}>{u.role.replace("_", " ")}</span></td>
                    <td className="muted-cell">{u.city ? `${u.city}, ${u.state}` : "—"}</td>
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
