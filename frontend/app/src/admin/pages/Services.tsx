import { useEffect, useState, type FormEvent } from "react";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";
import { ListEditor, type ListRow } from "../components/ListEditor";
import { ServiceImageUpload } from "../components/ServiceImageUpload";
import { CategoryManager } from "../components/CategoryManager";

interface Category { id: string; name: string; slug: string; is_active: boolean; display_order: number; }
interface ServiceRow { id: string; slug: string; name: string; category: string; is_popular: boolean; is_active: boolean; }

/** Full record loaded when the editor opens — the list query is slim on purpose. */
interface ServiceFull extends ServiceRow {
  description: string | null;
  short_description: string | null;
  estimated_duration: string | null;
  is_online_available: boolean;
  online_note: string | null;
  recommended_muhurat: string | null;
  image_url: string | null;
  benefits: ListRow[] | null;
  process: ListRow[] | null;
  faqs: ListRow[] | null;
  samagri_list: ListRow[] | null;
}

const asRows = (v: unknown): ListRow[] => (Array.isArray(v) ? (v as ListRow[]) : []);

export default function AdminServices() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Paged<ServiceRow> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<ServiceRow> | "new" | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [full, setFull] = useState<ServiceFull | null>(null);
  const [benefits, setBenefits] = useState<ListRow[]>([]);
  const [process, setProcess] = useState<ListRow[]>([]);
  const [samagri, setSamagri] = useState<ListRow[]>([]);
  const [faqs, setFaqs] = useState<ListRow[]>([]);

  /** Opens the editor, pulling the full record for an existing service. */
  async function beginEdit(target: ServiceRow | "new") {
    setEditing(target);
    if (target === "new") {
      setFull(null); setBenefits([]); setProcess([]); setSamagri([]); setFaqs([]);
      return;
    }
    try {
      const detail = await adminApi.get<ServiceFull>(`/services/${target.slug}/detail`);
      setFull(detail);
      setBenefits(asRows(detail.benefits));
      setProcess(asRows(detail.process));
      setSamagri(asRows(detail.samagri_list));
      setFaqs(asRows(detail.faqs));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load service");
    }
  }
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
          shortDescription: data.get("shortDescription"),
          estimatedDuration: data.get("estimatedDuration"),
          recommendedMuhurat: data.get("recommendedMuhurat"),
          isPopular: data.get("isPopular") === "on",
          isOnlineAvailable: data.get("isOnlineAvailable") === "on",
          onlineNote: data.get("onlineNote"),
          benefits, process, faqs, samagri,
        });
      } else if (editing) {
        await adminApi.put(`/services/${editing.slug}`, {
          name: data.get("name"),
          description: data.get("description"),
          shortDescription: data.get("shortDescription"),
          estimatedDuration: data.get("estimatedDuration"),
          recommendedMuhurat: data.get("recommendedMuhurat"),
          isPopular: data.get("isPopular") === "on",
          isOnlineAvailable: data.get("isOnlineAvailable") === "on",
          onlineNote: data.get("onlineNote"),
          benefits, process, faqs, samagri,
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
          <button className="btn btn-gold btn-sm" onClick={() => beginEdit("new")}><Icon name="plus" size={14} /> Add service</button>
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

      <CategoryManager />

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
                      <button className="btn btn-outline btn-sm" onClick={() => beginEdit(s)}>Edit</button>
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
            <div className="admin-field"><label>Estimated duration</label><input className="input" name="estimatedDuration" placeholder="e.g. 2-3 hours" defaultValue={full?.estimated_duration || ""} /></div>
            <div className="admin-field"><label className="row" style={{ gap: 8, marginTop: 22 }}><input type="checkbox" name="isPopular" defaultChecked={full?.is_popular} /> Mark as popular</label></div>
            <div className="admin-field admin-field--full"><label>Short description</label><input className="input" name="shortDescription" defaultValue={full?.short_description || ""} /></div>
            <div className="admin-field admin-field--full"><label>Description</label><textarea className="textarea" name="description" defaultValue={full?.description || ""} /></div>
            <div className="admin-field admin-field--full" style={{ background: "#fffdf7", border: "1px solid var(--admin-line, #e8d5b7)", borderRadius: 10, padding: 12 }}>
              <label className="row" style={{ gap: 8, fontWeight: 700 }}>
                <input type="checkbox" name="isOnlineAvailable" defaultChecked={full?.is_online_available} />
                🌐 Online puja / havan available
              </label>
              <p style={{ fontSize: ".8rem", opacity: .72, margin: "6px 0 8px" }}>
                Tick karne par yeh ritual “Online Puja” listing me aayega. Phir har Pandit ji ke
                edit page par choose karein ki kaun ise online kar sakte hain.
              </p>
              <input
                className="input" name="onlineNote" maxLength={300}
                placeholder="Online kaise hoti hai — e.g. Zoom par live havan, sankalp aapke naam se"
                defaultValue={full?.online_note || ""}
              />
            </div>

            <div className="admin-field admin-field--full"><label>Recommended muhurat</label><input className="input" name="recommendedMuhurat" placeholder="e.g. Brahma Muhurat, 4:30–6:00 AM" defaultValue={full?.recommended_muhurat || ""} /></div>

            {editing !== "new" && full && (
              <ServiceImageUpload
                slug={full.slug}
                currentUrl={full.image_url}
                onUploaded={(url) => setFull({ ...full, image_url: url })}
              />
            )}

            {/* These four replace the hardcoded tables that used to live in
                frontend/app/src/data/serviceMeta.ts. */}
            <ListEditor
              label="Benefits" addLabel="+ Add benefit"
              hint="Public page ke 'blessings' section me dikhenge."
              rows={benefits} onChange={setBenefits}
              fields={[
                { key: "title", label: "Benefit", placeholder: "Shatru baadha se raksha" },
                { key: "detail", label: "Detail", placeholder: "Short explanation", width: "full", multiline: true },
              ]}
            />
            <ListEditor
              label="Puja steps (vidhi)" addLabel="+ Add step"
              hint="Sequence me likhein — public page par timeline banega."
              rows={process} onChange={setProcess}
              fields={[
                { key: "title", label: "Step", placeholder: "Sankalp" },
                { key: "duration", label: "Duration", placeholder: "15 min" },
                { key: "detail", label: "Detail", placeholder: "Kya hota hai is step me", width: "full", multiline: true },
              ]}
            />
            <ListEditor
              label="Samagri" addLabel="+ Add samagri"
              hint="Puja me lagne wali saamagri aur maatra."
              rows={samagri} onChange={setSamagri}
              fields={[
                { key: "item", label: "Item", placeholder: "Haldi" },
                { key: "qty", label: "Quantity", placeholder: "2 kg" },
              ]}
            />
            <ListEditor
              label="FAQs" addLabel="+ Add FAQ"
              rows={faqs} onChange={setFaqs}
              fields={[
                { key: "q", label: "Question", placeholder: "Yeh puja kitne din chalti hai?", width: "full" },
                { key: "a", label: "Answer", placeholder: "…", width: "full", multiline: true },
              ]}
            />
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
