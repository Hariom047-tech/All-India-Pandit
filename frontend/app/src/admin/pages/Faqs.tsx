import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";

type EntityType = "GLOBAL" | "HOME" | "TEMPLE" | "SERVICE" | "PANDIT";
type FaqStatus = "draft" | "published" | "archived";

const ENTITY_TYPES: EntityType[] = ["GLOBAL", "HOME", "TEMPLE", "SERVICE", "PANDIT"];
const ENTITY_LABELS: Record<EntityType, string> = {
  GLOBAL: "Global (site-wide)", HOME: "Home page", TEMPLE: "Temple", SERVICE: "Service", PANDIT: "Pandit",
};
// Which admin list endpoint the entity picker searches, per entity type.
const PICKER_ENDPOINT: Partial<Record<EntityType, string>> = {
  TEMPLE: "/temples", SERVICE: "/services", PANDIT: "/pandits",
};

interface FaqRow {
  id: string;
  entity_type: EntityType;
  entity_id: string | null;
  entity_name: string | null;
  question: string;
  answer: string;
  slug: string | null;
  status: FaqStatus;
  sort_order: number;
}

interface PickerOption { id: string; name: string; }

/** Debounced search-select against an existing admin list endpoint (temples/
 *  services/pandits) — resolves a picked name back to an id, so FAQs can be
 *  assigned to a specific entity without a dedicated new endpoint. */
function EntityPicker({
  entityType, value, valueName, onChange,
}: {
  entityType: EntityType;
  value: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
}) {
  const endpoint = PICKER_ENDPOINT[entityType];
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!endpoint || !term.trim()) { setOptions([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await adminApi.get<Paged<PickerOption>>(`${endpoint}${qs({ search: term, perPage: 8 })}`);
        setOptions(res.data);
      } catch { /* soft-fail: picker just shows no results */ }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [term, endpoint]);

  if (!endpoint) return null;

  return (
    <div className="admin-field admin-field--full" style={{ position: "relative" }}>
      <label>{ENTITY_LABELS[entityType]}</label>
      {value ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="admin-pill admin-pill--gold">{valueName || value}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("", "")}>Change</button>
        </div>
      ) : (
        <>
          <input
            className="input" placeholder={`Search ${ENTITY_LABELS[entityType].toLowerCase()}s…`}
            value={term}
            onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && options.length > 0 && (
            <div className="admin-table-wrap" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, maxHeight: 220, overflowY: "auto" }}>
              {options.map((o) => (
                <button
                  type="button" key={o.id}
                  className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px" }}
                  onMouseDown={() => { onChange(o.id, o.name); setTerm(""); setOpen(false); }}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminFaqs() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<FaqRow> | null>(null);
  const [search, setSearch] = useState(params.get("search") || "");
  const [filterEntityId, setFilterEntityId] = useState("");
  const [filterEntityName, setFilterEntityName] = useState("");
  const [editing, setEditing] = useState<FaqRow | "new" | null>(null);
  const [formEntityType, setFormEntityType] = useState<EntityType>("GLOBAL");
  const [formEntityId, setFormEntityId] = useState("");
  const [formEntityName, setFormEntityName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const entityType = (params.get("entityType") || "") as EntityType | "";
  const status = params.get("status") || "";
  const page = Number(params.get("page") || 1);

  // Reordering only makes sense within one fully-resolved scope — GLOBAL/HOME
  // need nothing further, TEMPLE/SERVICE/PANDIT also need a specific entity
  // picked, otherwise "up" for one temple's FAQ could collide with another's.
  const canReorder = Boolean(entityType) && (!PICKER_ENDPOINT[entityType as EntityType] || Boolean(filterEntityId));

  async function load() {
    try {
      setRows(await adminApi.get<Paged<FaqRow>>(`/faqs${qs({
        entityType, entityId: filterEntityId, status, search, page, perPage: 20,
      })}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load FAQs");
    }
  }

  useEffect(() => { load(); }, [params, filterEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  function onEntityTypeFilterChange(value: string) {
    setFilterEntityId(""); setFilterEntityName("");
    updateParam("entityType", value);
  }

  function beginEdit(target: FaqRow | "new") {
    setEditing(target);
    if (target === "new") {
      setFormEntityType((entityType as EntityType) || "GLOBAL");
      setFormEntityId(filterEntityId); setFormEntityName(filterEntityName);
    } else {
      setFormEntityType(target.entity_type);
      setFormEntityId(target.entity_id || ""); setFormEntityName(target.entity_name || "");
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      if (editing === "new") {
        await adminApi.post("/faqs", {
          entityType: formEntityType,
          entityId: formEntityId || undefined,
          question: data.get("question"),
          answer: data.get("answer"),
          slug: data.get("slug") || undefined,
          status: data.get("status"),
        });
      } else if (editing) {
        await adminApi.put(`/faqs/${editing.id}`, {
          question: data.get("question"),
          answer: data.get("answer"),
          slug: data.get("slug") || undefined,
        });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save FAQ");
    }
  }

  async function toggleStatus(row: FaqRow) {
    setBusyId(row.id);
    try {
      const next = row.status === "published" ? "draft" : "published";
      await adminApi.put(`/faqs/${row.id}/status`, { status: next });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function archive(row: FaqRow) {
    if (!confirm(`Archive "${row.question}"? It will stop showing publicly.`)) return;
    setBusyId(row.id);
    try {
      await adminApi.put(`/faqs/${row.id}/status`, { status: "archived" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function move(row: FaqRow, dir: -1 | 1) {
    if (!rows) return;
    const scoped = rows.data.filter((r) => r.entity_type === row.entity_type && r.entity_id === row.entity_id);
    const idx = scoped.findIndex((r) => r.id === row.id);
    const swapWith = scoped[idx + dir];
    if (!swapWith) return;
    const orderedIds = [...scoped];
    [orderedIds[idx], orderedIds[idx + dir]] = [orderedIds[idx + dir], orderedIds[idx]];
    setBusyId(row.id);
    try {
      await adminApi.put("/faqs/reorder", {
        entityType: row.entity_type, entityId: row.entity_id, orderedIds: orderedIds.map((r) => r.id),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const STATUS_PILL: Record<FaqStatus, string> = {
    draft: "admin-pill--gray", published: "admin-pill--green", archived: "admin-pill--red",
  };

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>FAQs</h2>
          <p>One FAQ system for the whole site — global, home page, temples, services and pandits.</p>
        </div>
        <button className="btn btn-gold btn-sm" onClick={() => beginEdit("new")}><Icon name="plus" size={14} /> Add FAQ</button>
      </div>

      {error && <div className="admin-login__error" style={{ marginBottom: 18 }}>{error}</div>}

      <div className="admin-panel">
        <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); updateParam("search", search); }}>
          <select className="select" value={entityType} onChange={(e) => onEntityTypeFilterChange(e.target.value)}>
            <option value="">All entity types</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}
          </select>
          {entityType && PICKER_ENDPOINT[entityType as EntityType] && (
            <div style={{ minWidth: 220, position: "relative" }}>
              <EntityPicker
                entityType={entityType as EntityType}
                value={filterEntityId} valueName={filterEntityName}
                onChange={(id, name) => { setFilterEntityId(id); setFilterEntityName(name); }}
              />
            </div>
          )}
          <select className="select" value={status} onChange={(e) => updateParam("status", e.target.value)}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <input className="input" placeholder="Search question…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline btn-sm" type="submit">Search</button>
          {rows && <span className="muted" style={{ marginLeft: "auto", fontSize: ".85rem" }}>{rows.total} FAQs</span>}
        </form>

        <div className="admin-table-wrap">
          {!rows ? (
            <div className="admin-empty">Loading…</div>
          ) : rows.data.length ? (
            <table className="admin-table">
              <thead><tr><th>Question</th><th>Entity</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ maxWidth: 380 }}><strong>{r.question}</strong></td>
                    <td className="muted-cell">
                      {ENTITY_LABELS[r.entity_type]}{r.entity_name ? ` — ${r.entity_name}` : ""}
                    </td>
                    <td><span className={`admin-pill ${STATUS_PILL[r.status]}`}>{r.status}</span></td>
                    <td className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {canReorder && (
                        <>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => move(r, -1)} title="Move up" style={{ padding: "4px 8px" }}>
                            <Icon name="chevron-up" size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => move(r, 1)} title="Move down" style={{ padding: "4px 8px" }}>
                            <Icon name="chevron-down" size={14} />
                          </button>
                        </>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => beginEdit(r)} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Edit</button>
                      <button className="btn btn-gold btn-sm" disabled={busyId === r.id} onClick={() => toggleStatus(r)} style={{ padding: "4px 10px", fontSize: ".75rem" }}>
                        {r.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      {r.status !== "archived" && (
                        <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => archive(r)} style={{ padding: "4px 10px", fontSize: ".75rem" }}>Archive</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">No FAQs matched.</div>
          )}
        </div>
        {rows && rows.totalPages > 1 && (
          <div style={{ padding: "10px 20px 18px" }}><Pager page={rows.page} pages={rows.totalPages} onChange={(p) => updateParam("page", String(p))} /></div>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)}>
        <h3 style={{ fontSize: "1.3rem" }}>{editing === "new" ? "Add a FAQ" : "Edit FAQ"}</h3>
        <form onSubmit={onSave} style={{ marginTop: 16 }}>
          <div className="admin-form-grid">
            {editing === "new" && (
              <>
                <div className="admin-field admin-field--full">
                  <label>Applies to</label>
                  <select
                    className="select" value={formEntityType}
                    onChange={(e) => { setFormEntityType(e.target.value as EntityType); setFormEntityId(""); setFormEntityName(""); }}
                  >
                    {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}
                  </select>
                </div>
                {PICKER_ENDPOINT[formEntityType] && (
                  <EntityPicker
                    entityType={formEntityType}
                    value={formEntityId} valueName={formEntityName}
                    onChange={(id, name) => { setFormEntityId(id); setFormEntityName(name); }}
                  />
                )}
              </>
            )}
            {editing !== "new" && editing && (
              <div className="admin-field admin-field--full">
                <label>Applies to</label>
                <div><span className="admin-pill admin-pill--gold">{ENTITY_LABELS[editing.entity_type]}{editing.entity_name ? ` — ${editing.entity_name}` : ""}</span></div>
              </div>
            )}
            <div className="admin-field admin-field--full">
              <label>Question</label>
              <input className="input" name="question" required defaultValue={editing !== "new" ? editing?.question : ""} />
            </div>
            <div className="admin-field admin-field--full">
              <label>Answer</label>
              <textarea className="textarea" name="answer" required defaultValue={editing !== "new" ? editing?.answer : ""} />
            </div>
            <div className="admin-field"><label>Slug (optional)</label><input className="input" name="slug" defaultValue={editing !== "new" ? editing?.slug || "" : ""} /></div>
            {editing === "new" && (
              <div className="admin-field">
                <label>Status</label>
                <select className="select" name="status" defaultValue="draft">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            )}
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>Save</button>
        </form>
      </Modal>
    </>
  );
}
