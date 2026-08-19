/**
 * Admin → AI Knowledge Base.
 *
 * Two things this screen has to be honest about, because both were invisible
 * before it existed:
 *
 *   1. Whether a document is actually reachable by the assistant. Retrieval
 *      reads only status='published' AND verified — a draft is invisible to
 *      devotees no matter how good it is.
 *   2. Whether its embedding matches its current text. Editing the body clears
 *      indexed_at server-side, so "Re-index needed" is a real state and not a
 *      guess; until it is re-indexed the OLD text is what gets searched.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Modal } from "../../components/ui/Modal";
import { Pager } from "../../components/ui/Pager";
import { ListEditor, type ListRow } from "../components/ListEditor";

interface DocRow {
  id: string;
  title: string;
  document_type: string;
  language: string;
  status: "draft" | "published" | "archived";
  verified: boolean;
  source: string;
  source_ref: string | null;
  version: number;
  indexed_at: string | null;
  index_error: string | null;
  problem_categories: string[] | null;
  intent_tags: string[] | null;
  chunk_count: number;
  embedded_count: number;
  updated_at: string;
}
interface DocFull extends DocRow { body: string; deity: string | null; city: string | null; state: string | null }
interface Category { slug: string; name_en: string; parent_id: string | null }
interface Stats { total: number; live: number; drafts: number; needs_index: number; errored: number }

const TYPES = [
  "spiritual_guidance", "puja", "havan", "anushthan", "remedy",
  "temple", "deity", "faq", "testimonial", "scripture",
];

export default function AiKnowledge() {
  const [rows, setRows] = useState<Paged<DocRow> | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<DocFull | "new" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [needsIndex, setNeedsIndex] = useState(false);
  const [page, setPage] = useState(1);

  // Controlled form state — the rest of the fields ride on FormData.
  const [cats, setCats] = useState<string[]>([]);
  const [phrases, setPhrases] = useState<ListRow[]>([]);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        adminApi.get<Paged<DocRow>>(`/ai/knowledge${qs({
          search, status, needsIndex: needsIndex ? "true" : "", page, perPage: 25,
        })}`),
        adminApi.get<Stats>("/ai/knowledge/stats"),
      ]);
      setRows(list);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load knowledge base");
    }
  }, [search, status, needsIndex, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminApi.get<Category[]>("/ai/knowledge/categories").then(setCategories).catch(() => setCategories([]));
  }, []);

  async function openEdit(id: string) {
    const full = await adminApi.get<DocFull>(`/ai/knowledge/${id}`);
    setCats(full.problem_categories || []);
    setPhrases([]);   // example phrases live on the taxonomy, not the document
    setEditing(full);
  }

  function openNew() {
    setCats([]); setPhrases([]); setEditing("new");
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      title: String(data.get("title") || "").trim(),
      body: String(data.get("body") || "").trim(),
      documentType: String(data.get("documentType") || "spiritual_guidance"),
      language: String(data.get("language") || "hinglish"),
      deity: String(data.get("deity") || "") || null,
      city: String(data.get("city") || "") || null,
      state: String(data.get("state") || "") || null,
      problemCategories: cats,
      intentTags: phrases.map((p) => p.tag).filter(Boolean),
    };
    if (!payload.title || !payload.body) { setError("Title aur body zaroori hai."); return; }

    try {
      if (editing === "new") await adminApi.post("/ai/knowledge", payload);
      else if (editing) await adminApi.put(`/ai/knowledge/${editing.id}`, payload);
      setEditing(null);
      setNotice("Saved as draft. Publish karke live karein, phir re-index.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function changeStatus(id: string, next: "published" | "draft" | "archived") {
    setBusyId(id); setError("");
    try {
      await adminApi.put(`/ai/knowledge/${id}/status`, { status: next });
      setNotice(next === "published"
        ? "Published — ab yeh document devotee ke jawab me use hoga."
        : "Unpublished — turant retrieval se hat gaya.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change status");
    } finally { setBusyId(null); }
  }

  async function reindex(id: string) {
    setBusyId(id); setError(""); setNotice("");
    try {
      const res = await adminApi.post<{ chunks: number }>(`/ai/knowledge/${id}/reindex`, {});
      setNotice(`Re-indexed — ${res.chunks} chunk(s) embedded.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-index failed");
    } finally { setBusyId(null); }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}"? Iske chunks bhi hat jayenge.`)) return;
    setBusyId(id);
    try { await adminApi.del(`/ai/knowledge/${id}`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
    finally { setBusyId(null); }
  }

  const doc = editing !== "new" ? editing : null;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>AI Knowledge Base</h1>
          <p className="muted">
            Assistant sirf yahi likha hua bata sakta hai. Retrieval me sirf
            <strong> published</strong> documents aate hain.
          </p>
        </div>
        <button className="btn btn-gold" onClick={openNew}>+ New article</button>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <p className="admin-notice">{notice}</p>}

      {stats && (
        <div className="admin-stat-grid">
          <Stat label="Total" value={stats.total} />
          <Stat label="Live" value={stats.live} tone="good" />
          <Stat label="Drafts" value={stats.drafts} />
          <Stat label="Re-index needed" value={stats.needs_index} tone={stats.needs_index ? "warn" : undefined} />
          <Stat label="Errors" value={stats.errored} tone={stats.errored ? "bad" : undefined} />
        </div>
      )}

      <div className="admin-toolbar">
        <input className="input" placeholder="Search title or body…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <label className="media-tile__check">
          <input type="checkbox" checked={needsIndex}
            onChange={(e) => { setNeedsIndex(e.target.checked); setPage(1); }} />
          Re-index needed
        </label>
      </div>

      <div className="admin-table-wrap"><table className="admin-table">
        <thead>
          <tr>
            <th>Title</th><th>Type</th><th>Status</th><th>Index</th><th>Source</th><th />
          </tr>
        </thead>
        <tbody>
          {rows?.data.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.title}</strong>
                <div className="muted" style={{ fontSize: ".78rem" }}>
                  {(d.problem_categories || []).slice(0, 3).join(", ") || "no categories"}
                </div>
              </td>
              <td><span className="admin-tag">{d.document_type}</span></td>
              <td>
                {/* "Live" means retrievable, not merely saved. */}
                {d.status === "published" && d.verified
                  ? <span className="admin-pill admin-pill--green">Live</span>
                  : <span className="admin-pill">{d.status}</span>}
              </td>
              <td>
                {d.index_error
                  ? <span className="admin-pill admin-pill--red" title={d.index_error}>error</span>
                  : d.indexed_at
                    ? <span className="muted">{d.embedded_count}/{d.chunk_count} chunks</span>
                    : <span className="admin-pill admin-pill--gold">needs re-index</span>}
              </td>
              <td className="muted" style={{ fontSize: ".78rem" }}>{d.source}</td>
              <td className="admin-row-actions">
                <button className="btn btn-outline btn-sm" disabled={busyId === d.id}
                  onClick={() => openEdit(d.id)}>Edit</button>
                {d.status === "published"
                  ? <button className="btn btn-outline btn-sm" disabled={busyId === d.id}
                      onClick={() => changeStatus(d.id, "draft")}>Unpublish</button>
                  : <button className="btn btn-gold btn-sm" disabled={busyId === d.id}
                      onClick={() => changeStatus(d.id, "published")}>Publish</button>}
                <button className="btn btn-outline btn-sm" disabled={busyId === d.id}
                  onClick={() => reindex(d.id)}>Re-index</button>
                <button className="btn btn-ghost btn-sm" disabled={busyId === d.id}
                  onClick={() => remove(d.id, d.title)}>Delete</button>
              </td>
            </tr>
          ))}
          {rows && rows.data.length === 0 && (
            <tr><td colSpan={6} className="muted" style={{ padding: 26, textAlign: "center" }}>
              Koi document nahi mila.
            </td></tr>
          )}
        </tbody>
      </table></div>

      {/* Paged<T> is flattened by adminApi.request() — the envelope's meta is
          spread onto the root, so it is rows.totalPages, not rows.meta.total.
          Pager's prop is `pages`. Both match the other admin list pages. */}
      {rows && <Pager page={rows.page} pages={rows.totalPages} onChange={setPage} />}

      {/* ── Editor ─────────────────────────────────────────────────── */}
      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <h3 style={{ fontSize: "1.3rem" }}>{editing === "new" ? "New article" : "Edit article"}</h3>
        <p className="muted" style={{ marginTop: 6, fontSize: ".84rem" }}>
          Kabhi bhi outcome ka vaada mat likhiye. "Paramparagat roop se…" likhein,
          "yeh puja aapka case jita degi" nahi. (docs/AI_KNOWLEDGE_GUIDE.md)
        </p>

        <form onSubmit={onSave} style={{ marginTop: 16 }}>
          <div className="admin-form-grid">
            <div className="admin-field admin-field--full">
              <label>Title</label>
              <input className="input" name="title" required defaultValue={doc?.title || ""}
                placeholder="Business mein rukawat ke liye havan" />
            </div>

            <div className="admin-field">
              <label>Type</label>
              <select className="select" name="documentType" defaultValue={doc?.document_type || "spiritual_guidance"}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="admin-field">
              <label>Language</label>
              <select className="select" name="language" defaultValue={doc?.language || "hinglish"}>
                <option value="hinglish">Hinglish</option>
                <option value="hi">हिंदी</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="admin-field"><label>Deity</label>
              <input className="input" name="deity" defaultValue={doc?.deity || ""} /></div>
            <div className="admin-field"><label>City</label>
              <input className="input" name="city" defaultValue={doc?.city || ""} /></div>
            <div className="admin-field"><label>State</label>
              <input className="input" name="state" defaultValue={doc?.state || ""} /></div>

            <div className="admin-field admin-field--full">
              <label>Problem categories</label>
              <p className="admin-hint">
                Isi se article sahi devotee tak pahunchta hai. Bina category ke
                article lagbhag kabhi retrieve nahi hoga.
              </p>
              <div className="chip-list">
                {categories.filter((c) => c.parent_id).map((c) => {
                  const on = cats.includes(c.slug);
                  return (
                    <button
                      key={c.slug} type="button"
                      className={`chip${on ? "" : " chip--off"}`}
                      onClick={() => setCats((p) => (on ? p.filter((x) => x !== c.slug) : [...p, c.slug]))}
                    >
                      {on ? "✓ " : "+ "}{c.name_en}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="admin-field admin-field--full">
              <label>Body</label>
              <p className="admin-hint">
                Ek article = ek topic, 400–800 shabd. Headings use karein — chunking
                heading ko uske text ke saath rakhta hai.
              </p>
              <textarea className="textarea" name="body" rows={14} required defaultValue={doc?.body || ""} />
            </div>

            <ListEditor
              label="Extra search phrases" addLabel="+ Add phrase"
              hint="Jaise devotee likhta hai, uski hi spelling me — Devanagari aur galat spelling bhi. Yeh retrieval ka sabse strong signal hai."
              rows={phrases} onChange={setPhrases}
              fields={[{ key: "tag", label: "Phrase", placeholder: "vyapar mein rukawat hai", width: "full" }]}
            />
          </div>

          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>
            Save as draft
          </button>
          <p className="muted" style={{ fontSize: ".78rem", marginTop: 10, textAlign: "center" }}>
            Save karne ke baad <strong>Publish</strong> aur phir <strong>Re-index</strong> karein —
            tabhi assistant iska naya text search karega.
          </p>
        </form>
      </Modal>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`admin-stat-card${tone === "warn" || tone === "bad" ? " admin-stat-card--warn" : ""}`}>
      <span className="admin-stat-card__value">{value}</span>
      <span className="admin-stat-card__label">{label}</span>
    </div>
  );
}
