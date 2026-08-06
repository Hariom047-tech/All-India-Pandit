import { useEffect, useState, type FormEvent } from "react";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";

interface Category { id: string; name: string; slug: string; is_active: boolean; display_order: number; }
interface ServiceRow { id: string; slug: string; name: string; category: string; is_popular: boolean; is_active: boolean; }

export default function AdminServices() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Paged<ServiceRow> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<ServiceRow> | "new" | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [error, setError] = useState("");

  async function loadCategories() {
    setCategories(await adminApi.get<Category[]>("/service-categories"));
  }
  async function loadServices() {
    try {
      setRows(await adminApi.get<Paged<ServiceRow>>(`/services${qs({ search, page, perPage: 30 })}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
    }
  }

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadServices(); }, [search, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSaveCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await adminApi.post("/service-categories", { name: data.get("name"), slug: data.get("slug") });
      setCatModalOpen(false);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    }
  }

  async function onSaveService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      if (editing === "new") {
        await adminApi.post("/services", {
          categoryId: data.get("categoryId"),
          name: data.get("name"),
          slug: data.get("slug"),
          description: data.get("description"),
          estimatedDuration: data.get("estimatedDuration"),
          isPopular: data.get("isPopular") === "on",
        });
      } else if (editing) {
        await adminApi.put(`/services/${editing.slug}`, {
          name: data.get("name"),
          description: data.get("description"),
          estimatedDuration: data.get("estimatedDuration"),
          isPopular: data.get("isPopular") === "on",
        });
      }
      setEditing(null);
      await loadServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save service");
    }
  }

  async function removeService(slug: string) {
    if (!confirm(`Deactivate service "${slug}"?`)) return;
    await adminApi.del(`/services/${slug}`);
    await loadServices();
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Services</h2>
          <p>Categories and the rituals listed under each — samagri lists live under each service on the public site.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setCatModalOpen(true)}><Icon name="plus" size={14} /> Add category</button>
          <button className="btn btn-gold btn-sm" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add service</button>
        </div>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel" style={{ marginBottom: 18 }}>
        <div className="admin-panel__head"><h2>Categories</h2></div>
        <div className="admin-panel__body row wrap" style={{ gap: 8 }}>
          {categories.map((c) => (
            <span key={c.id} className={`admin-pill ${c.is_active ? "admin-pill--gold" : "admin-pill--gray"}`}>{c.name}</span>
          ))}
          {!categories.length && <span className="muted">No categories yet.</span>}
        </div>
      </div>

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); loadServices(); }}>
          <input className="input" placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline btn-sm" type="submit">Search</button>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} services</span>}
        </form>
        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Category</th><th>Popular</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td className="muted-cell">{s.category}</td>
                    <td>{s.is_popular ? <span className="admin-pill admin-pill--gold">popular</span> : "—"}</td>
                    <td><span className={`admin-pill ${s.is_active ? "admin-pill--green" : "admin-pill--red"}`}>{s.is_active ? "active" : "inactive"}</span></td>
                    <td className="row" style={{ gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>Edit</button>
                      {s.is_active && <button className="btn btn-ghost btn-sm" onClick={() => removeService(s.slug)}>Deactivate</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No services matched.</div>
          )}
        </div>
        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}><Pager page={rows.page} pages={rows.totalPages} onChange={setPage} /></div>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <h3 style={{ fontSize: "1.3rem" }}>{editing === "new" ? "Add a service" : `Edit ${(editing as ServiceRow)?.name || ""}`}</h3>
        <form onSubmit={onSaveService} style={{ marginTop: 16 }}>
          <div className="admin-form-grid">
            <div className="admin-field"><label>Name</label><input className="input" name="name" required defaultValue={editing !== "new" ? editing?.name : ""} /></div>
            <div className="admin-field"><label>Slug</label><input className="input" name="slug" required disabled={editing !== "new"} defaultValue={editing !== "new" ? editing?.slug : ""} /></div>
            {editing === "new" && (
              <div className="admin-field admin-field--full">
                <label>Category</label>
                <select className="select" name="categoryId" required>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="admin-field"><label>Estimated duration</label><input className="input" name="estimatedDuration" placeholder="e.g. 2-3 hours" /></div>
            <div className="admin-field"><label className="row" style={{ gap: 8, marginTop: 22 }}><input type="checkbox" name="isPopular" /> Mark as popular</label></div>
            <div className="admin-field admin-field--full"><label>Description</label><textarea className="textarea" name="description" /></div>
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>Save</button>
        </form>
      </Modal>

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)}>
        <h3 style={{ fontSize: "1.3rem" }}>Add a category</h3>
        <form onSubmit={onSaveCategory} style={{ marginTop: 16 }}>
          <div className="admin-field"><label>Name</label><input className="input" name="name" required /></div>
          <div className="admin-field" style={{ marginTop: 12 }}><label>Slug</label><input className="input" name="slug" required /></div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>Save</button>
        </form>
      </Modal>
    </>
  );
}
