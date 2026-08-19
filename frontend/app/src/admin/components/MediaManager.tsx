import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminBase, getToken } from "../lib/adminApi";

interface MediaItem {
  id: string;
  media_url: string;
  media_type: "photo" | "video_intro" | "certificate" | "thumbnail";
  title: string | null;
  caption: string | null;
  display_order: number;
  /** Computed server-side from pandits.profile_photo_url — the avatar devotees
   *  actually see. Never inferred from list position. */
  is_primary?: boolean;
  mime_type: string | null;
  file_size_bytes: number | null;
}

const MAX_MB = 60;

/**
 * Upload and arrange a pandit's profile photos and intro videos.
 *
 * Uploads go through fetch rather than the shared adminApi client because
 * that client always sets Content-Type: application/json; multipart needs the
 * browser to set its own boundary, so the header must be left off entirely.
 */
export function MediaManager({ slug }: { slug: string }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const base = await getAdminBase();
      const res = await fetch(`${base}/pandits/${slug}/media`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Could not load media");
      setItems(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load media");
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File, mediaType: "photo" | "video_intro") {
    // Check before sending: a 60 MB round trip that ends in 413 is a bad way
    // to learn the file was too big, especially on mobile data.
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum ${MAX_MB} MB.`);
      return;
    }
    setBusy(true); setError(""); setNotice(""); setProgress(0);

    const form = new FormData();
    form.append("file", file);
    form.append("mediaType", mediaType);

    try {
      const base = await getAdminBase();
      // XHR, not fetch: fetch still has no upload-progress event, and a
      // silent 40 MB video upload looks indistinguishable from a hang.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/pandits/${slug}/media`);
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
      setNotice(mediaType === "photo" ? "Photo uploaded." : "Video uploaded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false); setProgress(null);
      if (photoInput.current) photoInput.current.value = "";
      if (videoInput.current) videoInput.current.value = "";
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
    return res;
  }

  async function remove(item: MediaItem) {
    if (!confirm("Delete this file? It will disappear from the public profile.")) return;
    setBusy(true); setError("");
    try {
      await call(`/pandits/${slug}/media/${item.id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally { setBusy(false); }
  }

  async function move(item: MediaItem, dir: -1 | 1) {
    if (!items) return;
    // Reorder within the same media type — photos and videos are ordered
    // independently on the public profile.
    const sameType = items.filter((m) => m.media_type === item.media_type);
    const idx = sameType.findIndex((m) => m.id === item.id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= sameType.length) return;
    const reordered = [...sameType];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];

    setBusy(true);
    try {
      await call(`/pandits/${slug}/media/reorder`, "PUT", { orderedIds: reordered.map((m) => m.id) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    } finally { setBusy(false); }
  }

  async function makePrimary(item: MediaItem) {
    setBusy(true);
    try {
      await call(`/pandits/${slug}/media/${item.id}/primary`, "POST");
      setNotice("Profile photo updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set profile photo");
    } finally { setBusy(false); }
  }

  const photos = items?.filter((m) => m.media_type === "photo") ?? [];
  const videos = items?.filter((m) => m.media_type === "video_intro") ?? [];

  return (
    <div className="admin-panel">
      <div className="admin-panel__head">
        <h2>Photos &amp; videos</h2>
        <p style={{ fontSize: ".85rem", opacity: .75, margin: "4px 0 0" }}>
          Vertical (9:16) videos best dikhte hain — reels ki tarah. Max {MAX_MB} MB per file.
        </p>
      </div>
      <div className="admin-panel__body">
        {error && <div className="admin-login__error" style={{ marginBottom: 12 }}>{error}</div>}
        {notice && <p style={{ marginBottom: 12, fontSize: ".88rem" }}>{notice}</p>}

        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <label className="btn btn-outline btn-sm" style={{ cursor: busy ? "default" : "pointer" }}>
            + Add photo
            <input
              ref={photoInput} type="file" hidden disabled={busy}
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "photo"); }}
            />
          </label>
          <label className="btn btn-gold btn-sm" style={{ cursor: busy ? "default" : "pointer" }}>
            + Add video
            <input
              ref={videoInput} type="file" hidden disabled={busy}
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "video_intro"); }}
            />
          </label>
        </div>

        {progress !== null && (
          <div className="media-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
            <small>{progress}%</small>
          </div>
        )}

        {!items ? <p className="muted">Loading…</p> : (
          <>
            <h4 className="media-subhead">Photos ({photos.length})</h4>
            {photos.length === 0 ? <p className="muted media-empty">Koi photo nahi. Pehli photo apne aap profile picture ban jaayegi.</p> : (
              <ul className="media-grid">
                {photos.map((m, i) => (
                  <li key={m.id} className="media-tile">
                    <img src={m.media_url} alt={m.title || "Pandit photo"} loading="lazy" />
                    {m.is_primary && <span className="media-tile__flag">Profile</span>}
                    <div className="media-tile__actions">
                      {!m.is_primary && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => makePrimary(m)}>Set as profile</button>}
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy || i === 0} onClick={() => move(m, -1)} aria-label="Move up">↑</button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy || i === photos.length - 1} onClick={() => move(m, 1)} aria-label="Move down">↓</button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(m)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h4 className="media-subhead">Videos ({videos.length})</h4>
            {videos.length === 0 ? <p className="muted media-empty">Koi video nahi. 2–3 vertical videos sabse achhe lagte hain.</p> : (
              <ul className="media-grid media-grid--video">
                {videos.map((m, i) => (
                  <li key={m.id} className="media-tile media-tile--video">
                    <video src={m.media_url} muted playsInline preload="metadata" controls />
                    <span className="media-tile__flag">#{i + 1}</span>
                    <div className="media-tile__actions">
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy || i === 0} onClick={() => move(m, -1)} aria-label="Move earlier">↑</button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={busy || i === videos.length - 1} onClick={() => move(m, 1)} aria-label="Move later">↓</button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(m)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
