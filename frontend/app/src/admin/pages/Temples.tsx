import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";

interface TempleRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  primary_deity: string | null;
  avg_rating: string;
  review_count: number;
  pandit_count: number;
  is_verified: boolean;
  is_active: boolean;
}
interface TempleFull extends TempleRow {
  description: string | null;
  short_description: string | null;
  address_line1: string;
  latitude: string;
  longitude: string;
}

export default function AdminTemples() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<TempleRow> | null>(null);
  const [search, setSearch] = useState(params.get("search") || "");
  const [editing, setEditing] = useState<TempleFull | "new" | null>(null);
  const [mappingFor, setMappingFor] = useState<TempleRow | null>(null);
  const [error, setError] = useState("");
  const page = Number(params.get("page") || 1);

  async function load() {
    try {
      const res = await adminApi.get<Paged<TempleRow>>(`/temples${qs({ search, page, perPage: 20 })}`);
      setRows(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load temples");
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

  async function openEdit(slug: string) {
    const full = await adminApi.get<TempleFull>(`/temples/${slug}`);
    setEditing(full);
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get("name") || ""),
      slug: String(data.get("slug") || ""),
      description: String(data.get("description") || ""),
      shortDescription: String(data.get("shortDescription") || ""),
      primaryDeity: String(data.get("primaryDeity") || ""),
      addressLine1: String(data.get("addressLine1") || ""),
      city: String(data.get("city") || ""),
      state: String(data.get("state") || ""),
      latitude: Number(data.get("latitude")),
      longitude: Number(data.get("longitude")),
    };
    try {
      if (editing === "new") {
        await adminApi.post("/temples", payload);
      } else if (editing) {
        await adminApi.put(`/temples/${editing.slug}`, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save temple");
    }
  }

  async function deactivate(slug: string) {
    if (!confirm(`Deactivate ${slug}? It will stop showing on the public site.`)) return;
    await adminApi.del(`/temples/${slug}`);
    await load();
  }

  async function onMapPandit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mappingFor) return;
    const data = new FormData(e.currentTarget);
    try {
      await adminApi.post(`/temples/${mappingFor.slug}/pandits`, {
        panditSlug: data.get("panditSlug"),
        associationType: data.get("associationType") || "visiting",
      });
      setMappingFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to map pandit");
    }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Temples</h2>
          <p>Create and edit temple listings, and map pandits to the temples they serve.</p>
        </div>
        <button className="btn btn-gold btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={15} /> Add temple</button>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); updateParam("search", search); }}>
          <input className="input" placeholder="Search name or city…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline btn-sm" type="submit">Search</button>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} temples</span>}
        </form>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Location</th><th>Deity</th><th>Pandits</th><th>Rating</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td className="muted-cell">{t.city}, {t.state}</td>
                    <td className="muted-cell">{t.primary_deity || "—"}</td>
                    <td>{t.pandit_count}</td>
                    <td className="muted-cell">{Number(t.avg_rating).toFixed(1)} ({t.review_count})</td>
                    <td>
                      <span className={`admin-pill ${t.is_active ? "admin-pill--green" : "admin-pill--red"}`}>{t.is_active ? "active" : "inactive"}</span>
                      {t.is_verified && <span className="admin-pill admin-pill--gold" style={{ marginLeft: 6 }}>verified</span>}
                    </td>
                    <td className="row" style={{ gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(t.slug)}>Edit</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setMappingFor(t)}><Icon name="users" size={13} /> Map pandit</button>
                      {t.is_active && <button className="btn btn-ghost btn-sm" onClick={() => deactivate(t.slug)}>Deactivate</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No temples matched.</div>
          )}
        </div>

        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}>
            <Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} />
          </div>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <h3 style={{ fontSize: "1.3rem" }}>{editing === "new" ? "Add a temple" : `Edit ${(editing as TempleFull)?.name || ""}`}</h3>
        <form onSubmit={onSave} style={{ marginTop: 16 }}>
          <div className="admin-form-grid">
            <div className="admin-field"><label>Name</label><input className="input" name="name" required defaultValue={editing !== "new" ? editing?.name : ""} /></div>
            <div className="admin-field"><label>Slug</label><input className="input" name="slug" required disabled={editing !== "new"} defaultValue={editing !== "new" ? editing?.slug : ""} /></div>
            <div className="admin-field"><label>City</label><input className="input" name="city" required defaultValue={editing !== "new" ? editing?.city : ""} /></div>
            <div className="admin-field"><label>State</label><input className="input" name="state" required defaultValue={editing !== "new" ? editing?.state : ""} /></div>
            <div className="admin-field"><label>Primary deity</label><input className="input" name="primaryDeity" defaultValue={editing !== "new" ? editing?.primary_deity || "" : ""} /></div>
            <div className="admin-field"><label>Address</label><input className="input" name="addressLine1" required defaultValue={editing !== "new" ? editing?.address_line1 : ""} /></div>
            <div className="admin-field"><label>Latitude</label><input className="input" name="latitude" type="number" step="any" required defaultValue={editing !== "new" ? editing?.latitude : ""} /></div>
            <div className="admin-field"><label>Longitude</label><input className="input" name="longitude" type="number" step="any" required defaultValue={editing !== "new" ? editing?.longitude : ""} /></div>
            <div className="admin-field admin-field--full"><label>Short description</label><input className="input" name="shortDescription" defaultValue={editing !== "new" ? editing?.short_description || "" : ""} /></div>
            <div className="admin-field admin-field--full"><label>Description</label><textarea className="textarea" name="description" defaultValue={editing !== "new" ? editing?.description || "" : ""} /></div>
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>Save</button>
        </form>
      </Modal>

      <Modal open={mappingFor !== null} onClose={() => setMappingFor(null)}>
        <h3 style={{ fontSize: "1.3rem" }}>Map a pandit to {mappingFor?.name}</h3>
        <p className="muted" style={{ marginTop: 6 }}>Enter the pandit's slug (visible on their admin edit page URL, or the public profile URL).</p>
        <form onSubmit={onMapPandit} style={{ marginTop: 16 }}>
          <div className="admin-field"><label>Pandit slug</label><input className="input" name="panditSlug" required placeholder="e.g. ramesh-sharma" /></div>
          <div className="admin-field" style={{ marginTop: 12 }}>
            <label>Association type</label>
            <select className="select" name="associationType" defaultValue="visiting">
              <option value="resident">Resident</option>
              <option value="visiting">Visiting</option>
              <option value="on-call">On-call</option>
            </select>
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>Map pandit</button>
        </form>
      </Modal>
    </>
  );
}
