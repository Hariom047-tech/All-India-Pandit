import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, getAdminBase, getToken } from "../lib/adminApi";

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  tagline: string | null;
  home_rank: number | null;
  display_order: number;
  is_active: boolean;
}

/**
 * Controls the "Most booked services" strip on the public /services page.
 *
 * That strip used to be four hardcoded tiles with invented pandit counts.
 * Featuring is opt-in via home_rank: a category with no rank stays off the
 * homepage, so adding a category never silently changes the front page.
 */
export function CategoryManager() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setCats(await adminApi.get<Category[]>("/service-categories")); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load categories"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(cat: Category, patch: Partial<Category>) {
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi.put(`/service-categories/${cat.id}`, {
        tagline: patch.tagline,
        // null is meaningful here (un-feature), so it is sent explicitly.
        homeRank: patch.home_rank === undefined ? undefined : patch.home_rank,
      });
      setNotice("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  async function uploadImage(file: File) {
    const id = uploadFor.current;
    if (!id) return;
    setBusy(true); setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const base = await getAdminBase();
      const res = await fetch(`${base}/service-categories/${id}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Upload failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false); uploadFor.current = null;
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="admin-panel" style={{ marginBottom: 18 }}>
      <div className="admin-panel__head">
        <h2>“Most booked services” strip</h2>
        <p style={{ fontSize: ".85rem", opacity: .75, margin: "4px 0 0" }}>
          Jo categories yahan featured hain wahi public /services page ke top strip me dikhengi.
          Pandit counts apne aap calculate hote hain.
        </p>
      </div>
      <div className="admin-panel__body">
        {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}
        {notice && <p style={{ marginBottom: 12, fontSize: ".85rem" }}>{notice}</p>}

        <input
          ref={fileInput} type="file" hidden
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
        />

        {!cats ? <p className="muted">Loading…</p> : (
          <table className="admin-table">
            <thead>
              <tr><th>Image</th><th>Category</th><th>Tagline</th><th>Featured rank</th><th></th></tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.image_url
                      ? <img src={c.image_url} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6 }} />
                      : <div style={{ width: 72, height: 48, borderRadius: 6, background: "#faf7f0", border: "1px dashed var(--admin-line, #e8d5b7)" }} />}
                  </td>
                  <td><strong>{c.name}</strong><br /><small style={{ opacity: .6 }}>{c.slug}</small></td>
                  <td>
                    <input
                      className="input" defaultValue={c.tagline || ""} placeholder="Short line under the name"
                      onBlur={(e) => { if (e.target.value !== (c.tagline || "")) save(c, { tagline: e.target.value }); }}
                    />
                  </td>
                  <td>
                    <input
                      className="input" type="number" min={1} max={8} style={{ width: 90 }}
                      defaultValue={c.home_rank ?? ""} placeholder="—"
                      title="Blank = not featured. 1 shows first."
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== c.home_rank) save(c, { home_rank: v });
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button" className="btn btn-outline btn-sm" disabled={busy}
                      onClick={() => { uploadFor.current = c.id; fileInput.current?.click(); }}
                    >{c.image_url ? "Replace image" : "Upload image"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: ".8rem", opacity: .7, marginTop: 10 }}>
          Featured rank khali chhodne par category strip se hat jaayegi. 1 = pehle.
        </p>
      </div>
    </div>
  );
}
