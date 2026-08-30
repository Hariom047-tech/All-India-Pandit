import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, qs, type Paged } from "../lib/adminApi";
import { Icon } from "../../lib/icons";
import { Pager } from "../../components/ui/Pager";
import { Modal } from "../../components/ui/Modal";
import { LocationPicker, type LocationValue } from "../components/LocationPicker";
import { GalleryManager } from "../components/GalleryManager";
import { ListEditor, type ListRow } from "../components/ListEditor";

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
  established_year: number | null;
  history: string | null;
  significance: string | null;
  highlights: string[] | null;
  /** Rituals unique to this temple — no catalogue entry, no detail page. */
  custom_services: { name: string; description?: string }[] | null;
  /** Catalogue services linked to this temple, added by getById. */
  serviceSlugs?: string[];
}

/** One option in the "add a service" picker. */
interface ServiceOption { slug: string; name: string; category: string }

export default function AdminTemples() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Paged<TempleRow> | null>(null);
  const [search, setSearch] = useState(params.get("search") || "");
  const [editing, setEditing] = useState<TempleFull | "new" | null>(null);
  const [mappingFor, setMappingFor] = useState<TempleRow | null>(null);
  const [error, setError] = useState("");
  // These four are controlled because the map picker writes into them.
  // Everything else on the form stays uncontrolled via FormData.
  const [loc, setLoc] = useState<LocationValue>({ lat: "", lng: "", address: "", city: "", state: "" });
  const [name, setName] = useState("");
  const [highlights, setHighlights] = useState<ListRow[]>([]);
  const [slug, setSlug] = useState("");
  // Services performed here: catalogue links (slugs) + this temple's own.
  const [serviceSlugs, setServiceSlugs] = useState<string[]>([]);
  const [customServices, setCustomServices] = useState<ListRow[]>([]);
  const [catalogue, setCatalogue] = useState<ServiceOption[]>([]);
  const page = Number(params.get("page") || 1);

  /** "Maa Baglamukhi Mandir" -> "maa-baglamukhi-mandir" (backend enforces [a-z0-9-]+). */
  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200);
  }

  /** Seeds the modal — blank for a new temple, existing values for an edit. */
  function beginEdit(target: TempleFull | "new") {
    if (target === "new") {
      setName(""); setSlug("");
      setHighlights([]);
      setServiceSlugs([]); setCustomServices([]);
      setLoc({ lat: "", lng: "", address: "", city: "", state: "" });
    } else {
      setName(target.name);
      setSlug(target.slug);
      setHighlights((target.highlights || []).map((h) => ({ text: h })));
      setServiceSlugs(target.serviceSlugs || []);
      setCustomServices((target.custom_services || []).map((s) => ({
        name: s.name, description: s.description || "",
      })));
      setLoc({
        lat: target.latitude != null ? String(target.latitude) : "",
        lng: target.longitude != null ? String(target.longitude) : "",
        address: target.address_line1 || "",
        city: target.city || "",
        state: target.state || "",
      });
    }
    setEditing(target);
  }

  async function load() {
    try {
      const res = await adminApi.get<Paged<TempleRow>>(`/temples${qs({ search, page, perPage: 20 })}`);
      setRows(res);
      setError(""); // clear any previous error on success
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load temples";
      // DB migration errors are non-fatal — the list still renders; suppress the red banner
      if (!msg.includes("migration") && !msg.includes("does not exist")) {
        setError(msg);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /* The service catalogue for the picker. Loaded once for the page rather than
     per modal open — it is a small, rarely-changing list, and re-fetching it on
     every edit would make the modal feel slow. perPage is deliberately high:
     a picker that silently omits page 2 would look like missing services. */
  useEffect(() => {
    adminApi
      .get<Paged<ServiceOption>>(`/services${qs({ perPage: 200 })}`)
      .then((res) => setCatalogue(res.data || []))
      .catch(() => setCatalogue([]));   // picker degrades to "none available"
  }, []);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  async function openEdit(targetSlug: string) {
    const full = await adminApi.get<TempleFull>(`/temples/${targetSlug}`);
    beginEdit(full);
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const cleanSlug = slugify(slug);
    if (!cleanSlug) { setError("Slug khali nahi ho sakta."); return; }
    if (!loc.lat || !loc.lng) { setError("Map par location select karein (ya coordinates manually daalein)."); return; }

    const payload = {
      name: name.trim(),
      slug: cleanSlug,
      description: String(data.get("description") || ""),
      shortDescription: String(data.get("shortDescription") || ""),
      primaryDeity: String(data.get("primaryDeity") || ""),
      addressLine1: loc.address,
      city: loc.city,
      state: loc.state,
      latitude: Number(loc.lat),
      longitude: Number(loc.lng),
      establishedYear: data.get("establishedYear") ? Number(data.get("establishedYear")) : null,
      history: String(data.get("history") || ""),
      significance: String(data.get("significance") || ""),
      // ListEditor rows -> plain string list, which is what the column stores.
      highlights: highlights.map((h) => h.text).filter(Boolean),
      // This temple's own rituals. A nameless row is dropped here and again on
      // the server, since it would render as an empty card.
      customServices: customServices
        .map((s) => ({ name: (s.name || "").trim(), description: (s.description || "").trim() }))
        .filter((s) => s.name),
    };
    try {
      // The catalogue links live in a join table, so they are a second call.
      // A new temple has no slug until it is created, hence the round trip.
      let targetSlug = editing !== "new" && editing ? editing.slug : "";
      if (editing === "new") {
        const created = await adminApi.post<{ slug: string }>("/temples", payload);
        targetSlug = created?.slug || cleanSlug;
      } else if (editing) {
        await adminApi.put(`/temples/${editing.slug}`, payload);
        // The slug itself is editable, so follow it rather than reusing the old
        // one — otherwise the services call would 404 on a renamed temple.
        targetSlug = cleanSlug;
      }

      if (targetSlug) {
        const res = await adminApi.put<{ unknown?: string[] }>(
          `/temples/${targetSlug}/services`, { serviceSlugs },
        );
        // Saved, but say so rather than letting a stale slug vanish silently.
        if (res?.unknown?.length) {
          setError(`Saved, lekin ye services nahi mile: ${res.unknown.join(", ")}`);
        }
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save temple");
    }
  }

  const addService = (s: string) =>
    setServiceSlugs((prev) => (s && !prev.includes(s) ? [...prev, s] : prev));
  const removeService = (s: string) =>
    setServiceSlugs((prev) => prev.filter((x) => x !== s));

  /** Catalogue entries not yet linked — the picker only offers what is addable. */
  const availableServices = catalogue.filter((c) => !serviceSlugs.includes(c.slug));
  const nameOfService = (s: string) => catalogue.find((c) => c.slug === s)?.name || s;

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
        <button className="btn btn-gold btn-sm" onClick={() => beginEdit("new")}><Icon name="plus" size={15} /> Add temple</button>
      </div>

      {error && (
        <div
          className={error.includes("migration") || error.includes("does not exist") ? "admin-info-banner" : "admin-login__error"}
          style={{ marginBottom: 18 }}
        >
          {error}
        </div>
      )}

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

      <Modal open={editing !== null} onClose={() => setEditing(null)} size="full">
        <div style={{ padding: 24 }}>
        <h3 style={{ fontSize: "1.3rem" }}>{editing === "new" ? "Add a temple" : `Edit ${(editing as TempleFull)?.name || ""}`}</h3>
        <form onSubmit={onSave} style={{ marginTop: 16 }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label>Name</label>
              <input
                className="input" required value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // Only auto-fill the slug while creating: an existing slug is
                  // a live public URL and must not silently change under a rename.
                  if (editing === "new") setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="admin-field">
              <label>Slug</label>
              <input
                className="input" required disabled={editing !== "new"} value={slug}
                onChange={(e) => setSlug(e.target.value)}
                onBlur={() => setSlug((v) => slugify(v))}
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers and hyphens only"
              />
              <small style={{ opacity: .65 }}>/temples/{slugify(slug) || "…"}</small>
            </div>

            <LocationPicker
              value={loc}
              onChange={(next) => setLoc((cur) => ({ ...cur, ...next }))}
              defaultQuery={name}
            />

            <div className="admin-field">
              <label>City</label>
              <input className="input" required value={loc.city}
                onChange={(e) => setLoc((c) => ({ ...c, city: e.target.value }))} />
            </div>
            <div className="admin-field">
              <label>State</label>
              <input className="input" required value={loc.state}
                onChange={(e) => setLoc((c) => ({ ...c, state: e.target.value }))} />
            </div>
            <div className="admin-field admin-field--full">
              <label>Address</label>
              <input className="input" required value={loc.address}
                onChange={(e) => setLoc((c) => ({ ...c, address: e.target.value }))} />
            </div>
            <div className="admin-field"><label>Primary deity</label><input className="input" name="primaryDeity" defaultValue={editing !== "new" ? editing?.primary_deity || "" : ""} /></div>
            <div className="admin-field">
              <label>Established (year)</label>
              <input
                className="input" name="establishedYear" type="number"
                min={1} max={new Date().getFullYear()} placeholder="e.g. 1780"
                defaultValue={editing !== "new" ? (editing as TempleFull)?.established_year ?? "" : ""}
              />
            </div>
            <div className="admin-field admin-field--full">
              <label>History</label>
              <textarea
                className="textarea" name="history" rows={4}
                placeholder="Mandir ka itihaas — kab, kisne banwaya, kya kahani hai."
                defaultValue={editing !== "new" ? (editing as TempleFull)?.history || "" : ""}
              />
            </div>
            <div className="admin-field admin-field--full">
              <label>Significance</label>
              <textarea
                className="textarea" name="significance" rows={4}
                placeholder="Dharmik mahatva — yeh mandir kyun vishesh hai."
                defaultValue={editing !== "new" ? (editing as TempleFull)?.significance || "" : ""}
              />
            </div>
            <ListEditor
              label="Highlights & special sevas" addLabel="+ Add highlight"
              hint="Public temple page ke 'Highlights & special sevas' section me dikhenge."
              rows={highlights} onChange={setHighlights}
              fields={[{ key: "text", label: "Highlight", placeholder: "Special Baglamukhi Havan", width: "full" }]}
            />

            {/* ── Services performed here ──────────────────────────────
                Two sources, deliberately separate. A catalogue link gets a
                real detail page, samagri list and pandit list; a custom one
                is just this temple's own ritual and opens the enquiry form. */}
            <div className="admin-field admin-field--full">
              <label>Services performed here <span className="list-editor__count">{serviceSlugs.length}</span></label>
              <p className="admin-hint">
                Hamare catalogue se service chunein — public page par poora service card, samagri
                aur pandit list ke saath dikhegi.
              </p>
              <select
                className="select"
                value=""
                disabled={availableServices.length === 0}
                onChange={(e) => { addService(e.target.value); e.currentTarget.value = ""; }}
              >
                <option value="">
                  {catalogue.length === 0
                    ? "Catalogue load nahi hua"
                    : availableServices.length === 0
                      ? "Saari services add ho chuki hain"
                      : "+ Service chunein…"}
                </option>
                {availableServices.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}{c.category ? ` · ${c.category}` : ""}
                  </option>
                ))}
              </select>

              {serviceSlugs.length > 0 && (
                <ul className="chip-list">
                  {serviceSlugs.map((s) => (
                    <li key={s} className="chip">
                      {nameOfService(s)}
                      <button
                        type="button" className="chip__x"
                        onClick={() => removeService(s)}
                        aria-label={`${nameOfService(s)} hataayein`}
                      >×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ListEditor
              label="Is mandir ki apni services" addLabel="+ Add custom service"
              hint="Wo rituals jo catalogue me nahi hain, sirf is mandir ke liye. Inka detail page nahi hota — tap karne par devotee ka enquiry form khulta hai, isi service ke saath."
              rows={customServices} onChange={setCustomServices}
              fields={[
                { key: "name", label: "Service ka naam", placeholder: "Baglamukhi Ashtami Special Havan", width: "full" },
                { key: "description", label: "Chhota description", placeholder: "Har Ashtami ko subah 6 baje, mandir ke mukhya pandit ji dwara.", multiline: true, width: "full" },
              ]}
            />
            <div className="admin-field admin-field--full"><label>Short description</label><input className="input" name="shortDescription" defaultValue={editing !== "new" ? editing?.short_description || "" : ""} /></div>
            <div className="admin-field admin-field--full"><label>Description</label><textarea className="textarea" name="description" defaultValue={editing !== "new" ? editing?.description || "" : ""} /></div>
          </div>
          <button className="btn btn-gold btn-block" type="submit" style={{ marginTop: 18 }}>Save</button>
        </form>

        {/* Only for an existing temple: uploads need a slug to post to, and a
            temple that has not been saved yet does not have one. */}
        {editing !== "new" && editing && (
          <div style={{ marginTop: 22 }}>
            <GalleryManager
              basePath={`/temples/${(editing as TempleFull).slug}/media`}
              title="Photos & videos"
              hint="Photos aur videos dono chalengi, max 60 MB. 'Hero' tick karein to file mandir page ke top slider me aayegi (↑ ↓ se order badlein). 'Set as profile picture' se wo photo temple cards, search aur share preview me dikhegi — profile picture sirf photo ho sakti hai."
              accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
              allowVideo
              coverAction={{ label: "Set as profile picture", path: (id) => `/temples/${(editing as TempleFull).slug}/media/${id}/cover` }}
              heroAction={{ path: (id) => `/temples/${(editing as TempleFull).slug}/media/${id}/hero` }}
            />
          </div>
        )}
        </div>
      </Modal>

      <Modal open={mappingFor !== null} onClose={() => setMappingFor(null)}>
        <div style={{ padding: 24 }}>
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
        </div>
      </Modal>
    </>
  );
}
