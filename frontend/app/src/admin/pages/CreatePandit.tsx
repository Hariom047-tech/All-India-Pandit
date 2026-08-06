import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminApi, ADMIN_BASE } from "../lib/adminApi";

export default function CreatePandit() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const res = await adminApi.post<{ slug: string }>(`/pandits`, {
        email: data.get("email"),
        fullName: data.get("fullName"),
        phone: data.get("phone") || undefined,
        slug: data.get("slug"),
      });
      navigate(`${ADMIN_BASE}/pandits/${res.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pandit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Add New Pandit</h2>
          <p>Create a new verified pandit profile. You can edit full details after creation.</p>
        </div>
      </div>

      <div className="admin-panel" style={{ maxWidth: 600 }}>
        <form onSubmit={onSave}>
          <div className="admin-panel__head">
            <h2>Basic Information</h2>
          </div>
          <div className="admin-panel__body">
            <div className="admin-form-grid">
              <div className="admin-field admin-field--full">
                <label>Full Name</label>
                <input className="input" name="fullName" required placeholder="e.g. Pandit Devdatt Shastri" />
              </div>

              <div className="admin-field admin-field--full">
                <label>URL Slug</label>
                <input className="input" name="slug" required placeholder="e.g. devdatt-shastri" pattern="[a-z0-9-]+" title="Only lowercase letters, numbers, and hyphens" />
                <div className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>This will be the URL: /pandits/devdatt-shastri</div>
              </div>

              <div className="admin-field admin-field--full">
                <label>Email</label>
                <input className="input" type="email" name="email" required placeholder="e.g. devdatt@example.com" />
              </div>

              <div className="admin-field admin-field--full">
                <label>Phone Number (Optional)</label>
                <input className="input" name="phone" placeholder="e.g. 9876543210" />
              </div>
            </div>

            {error && <div className="admin-login__error" style={{ marginTop: 18 }}>{error}</div>}

            <div className="row" style={{ gap: 10, marginTop: 24 }}>
              <button type="submit" className="btn btn-gold" disabled={saving}>
                {saving ? "Creating..." : "Create & Edit Details"}
              </button>
              <Link to={`${ADMIN_BASE}/pandits`} className="btn btn-outline">Cancel</Link>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
