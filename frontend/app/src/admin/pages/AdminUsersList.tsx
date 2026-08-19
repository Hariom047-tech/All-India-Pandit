import { useEffect, useState } from "react";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Pager } from "../../components/ui/Pager";

interface AdminRow {
  id: string; email: string; full_name: string; role: string; status: string;
  last_login_at: string | null; created_at: string;
}

/**
 * The "separate Admin Users screen" the role-separation spec calls for —
 * admin/super_admin accounts, kept off both the Pandits and (devotee-only)
 * Users pages. Deliberately read-only: promoting/demoting/suspending a
 * fellow admin is a higher-stakes action than anything else on this page
 * and is out of scope for this pass (see the audit report).
 */
export default function AdminUsersList() {
  const [rows, setRows] = useState<Paged<AdminRow> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.get<Paged<AdminRow>>(`/admin-users${qs({ page, perPage: 25 })}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load admin users"));
  }, [page]);

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Admin Users</h2>
          <p>Admin &amp; super_admin accounts — separate from Users (devotees) and Pandits by design.</p>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th></tr></thead>
              <tbody>
                {rows.data.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong></td>
                    <td className="muted-cell">{u.email}</td>
                    <td><span className="admin-pill admin-pill--gold">{u.role.replace("_", " ")}</span></td>
                    <td><span className={`admin-pill ${u.status === "active" ? "admin-pill--green" : "admin-pill--red"}`}>{u.status}</span></td>
                    <td className="muted-cell">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-IN") : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No admin accounts found.</div>
          )}
        </div>
        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}><Pager page={rows.page} pages={rows.totalPages} onChange={setPage} /></div>
        )}
      </div>
    </>
  );
}
