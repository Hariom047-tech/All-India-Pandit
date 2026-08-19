import { useRef, useState } from "react";
import { getAdminBase, getToken } from "../lib/adminApi";

/** Single hero image for a service. Replaces the previous file on upload. */
export function ServiceImageUpload({ slug, currentUrl, onUploaded }: {
  slug: string;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(currentUrl);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true); setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const base = await getAdminBase();
      const res = await fetch(`${base}/services/${slug}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Upload failed (${res.status})`);
      setPreview(json.imageUrl);
      onUploaded(json.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="admin-field admin-field--full">
      <label>Hero image</label>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {preview
          ? <img src={preview} alt="" style={{ width: 140, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--admin-line, #e8d5b7)" }} />
          : <div style={{ width: 140, height: 90, display: "grid", placeItems: "center", borderRadius: 8, background: "#faf7f0", border: "1px dashed var(--admin-line, #e8d5b7)", fontSize: ".75rem", opacity: .6 }}>No image</div>}
        <div>
          <label className="btn btn-outline btn-sm" style={{ cursor: busy ? "default" : "pointer" }}>
            {busy ? "Uploading…" : preview ? "Replace image" : "Upload image"}
            <input
              ref={input} type="file" hidden disabled={busy}
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
          </label>
          <p style={{ fontSize: ".76rem", opacity: .7, marginTop: 6 }}>
            Landscape crop, max 8 MB. Public service page ke banner par dikhega.
          </p>
        </div>
      </div>
      {error && <p style={{ color: "#96231f", fontSize: ".8rem", marginTop: 6 }}>{error}</p>}
    </div>
  );
}
