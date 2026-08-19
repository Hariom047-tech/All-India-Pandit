import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminBase, getToken } from "../lib/adminApi";

export interface GalleryItem {
  id: string;
  media_url?: string;
  image_url?: string;
  media_type?: string;
  /** Temple profile picture — one per temple, photos only. */
  is_cover?: boolean;
  /** Appears in the hero slider at the top of the public page. */
  show_in_hero?: boolean;
  display_order?: number;
}

/**
 * Generic upload-and-arrange gallery, used by the temple media panel and the
 * home hero images panel. Both do the same four things — upload with
 * progress, list, reorder, delete — against different endpoints.
 */
export function GalleryManager({
  basePath, title, hint, accept, allowVideo = false, maxItems, coverAction, heroAction,
}: {
  /** e.g. `/temples/kashi-vishwanath/media` or `/home-hero` */
  basePath: string;
  title: string;
  hint?: string;
  accept: string;
  allowVideo?: boolean;
  maxItems?: number;
  /** Label for the "make this the cover/primary" action, if supported. */
  coverAction?: { label: string; path: (id: string) => string };
  /**
   * Per-item hero placement. When supplied, each tile gets a checkbox that
   * decides whether the item appears in the public hero slider. Photos and
   * videos are both eligible — unlike the profile picture, which is photos
   * only. Omitted by the home-hero panel, where every image is the hero.
   */
  heroAction?: { path: (id: string) => string };
}) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const urlOf = (m: GalleryItem) => m.media_url || m.image_url || "";

  const load = useCallback(async () => {
    try {
      const base = await getAdminBase();
      const res = await fetch(`${base}${basePath}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Could not load media");
      setItems(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load media");
    }
  }, [basePath]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    if (maxItems && items && items.length >= maxItems) {
      setError(`Maximum ${maxItems} items. Delete one first.`);
      return;
    }
    setBusy(true); setError(""); setProgress(0);
    const form = new FormData();
    form.append("file", file);

    try {
      const base = await getAdminBase();
      // XHR for real upload progress — fetch still has no upload progress
      // event, and a silent multi-MB upload is indistinguishable from a hang.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}${basePath}`);
        xhr.setRequestHeader("Authorization", `Bearer ${getToken() ?? ""}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          let msg = `Upload failed (${xhr.status})`;
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* keep default */ }
          reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(form);
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false); setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function call(path: string, method: string, body?: unknown) {
    const base = await getAdminBase();
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getToken() ?? ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error || `Request failed (${res.status})`);
    }
  }

  async function remove(item: GalleryItem) {
    if (!confirm("Delete this file?")) return;
    setBusy(true);
    try { await call(`${basePath}/${item.id}`, "DELETE"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
    finally { setBusy(false); }
  }

  async function move(item: GalleryItem, dir: -1 | 1) {
    if (!items) return;
    const i = items.findIndex((m) => m.id === item.id);
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy(true);
    try { await call(`${basePath}/reorder`, "PUT", { orderedIds: next.map((m) => m.id) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Reorder failed"); }
    finally { setBusy(false); }
  }

  async function makeCover(item: GalleryItem) {
    if (!coverAction) return;
    setBusy(true);
    try { await call(coverAction.path(item.id), "POST"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  /**
   * Send the desired state rather than "flip it" — a double-click or a retried
   * request then lands on the same value instead of toggling back.
   */
  async function toggleHero(item: GalleryItem, show: boolean) {
    if (!heroAction) return;
    setBusy(true); setError("");
    try { await call(heroAction.path(item.id), "PUT", { show }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update hero placement"); }
    finally { setBusy(false); }
  }

  // Warn rather than block: an empty hero is recoverable, and the public page
  // falls back to the profile picture, but the admin should know they did it.
  const heroCount = items?.filter((m) => m.show_in_hero).length ?? 0;

  return (
    <div className="admin-panel">
      <div className="admin-panel__head">
        <h2>{title}</h2>
        {hint && <p style={{ fontSize: ".85rem", opacity: .75, margin: "4px 0 0" }}>{hint}</p>}
      </div>
      <div className="admin-panel__body">
        {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}

        <label className="btn btn-gold btn-sm" style={{ cursor: busy ? "default" : "pointer" }}>
          + Upload {allowVideo ? "photo or video" : "image"}
          <input
            ref={fileInput} type="file" hidden accept={accept} disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
        </label>

        {progress !== null && (
          <div className="media-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
            <small>{progress}%</small>
          </div>
        )}

        {heroAction && items && items.length > 0 && heroCount === 0 && (
          <p className="media-hero-warn" style={{ marginTop: 12 }}>
            Hero me koi file nahi chuni. Public page par sirf profile picture dikhegi.
          </p>
        )}

        {!items ? <p className="muted" style={{ marginTop: 12 }}>Loading…</p>
          : items.length === 0 ? <p className="muted media-empty" style={{ marginTop: 12 }}>Abhi koi file nahi.</p> : (
            <ul className="media-grid" style={{ marginTop: 14 }}>
              {items.map((m, i) => {
                const isVideo = m.media_type === "video";
                return (
                <li key={m.id} className={`media-tile${isVideo ? " media-tile--video" : ""}`}>
                  {isVideo
                    ? <video src={urlOf(m)} muted playsInline preload="metadata" controls />
                    : <img src={urlOf(m)} alt="" loading="lazy" />}

                  {/* Two independent placements, so two badges. One combined
                      "Cover" pill could not say that a photo is the thumbnail
                      but deliberately kept out of the hero. */}
                  <div className="media-tile__flags">
                    {m.is_cover && <span className="media-tile__flag">Profile</span>}
                    {heroAction && m.show_in_hero && (
                      <span className="media-tile__flag media-tile__flag--hero">Hero</span>
                    )}
                  </div>

                  <div className="media-tile__actions">
                    {heroAction && (
                      <label className="media-tile__check">
                        <input
                          type="checkbox" disabled={busy}
                          checked={Boolean(m.show_in_hero)}
                          onChange={(e) => toggleHero(m, e.target.checked)}
                        />
                        Hero
                      </label>
                    )}
                    {coverAction && !m.is_cover && !isVideo && (
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy}
                        onClick={() => makeCover(m)}>{coverAction.label}</button>
                    )}
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy || i === 0}
                      onClick={() => move(m, -1)} aria-label="Move up">↑</button>
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy || i === items.length - 1}
                      onClick={() => move(m, 1)} aria-label="Move down">↓</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => remove(m)}>Delete</button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}
