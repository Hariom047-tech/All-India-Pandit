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
        // Account access — set by the admin, hashed server-side. The plaintext
        // in this FormData never leaves this request and is never echoed back.
        temporaryPassword: data.get("temporaryPassword"),
        dateOfBirth: data.get("dateOfBirth") || undefined,
        city: data.get("city") || undefined,
        state: data.get("state") || undefined,
        experienceYears: data.get("experienceYears") ? Number(data.get("experienceYears")) : undefined,
        planTier: data.get("planTier") || "free",
        planBillingCycle: data.get("planBillingCycle") || "monthly",
        planExpiresAt: data.get("planExpiresAt") || undefined,
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
          </div>

          <div className="admin-panel__head" style={{ borderTop: "1px solid var(--admin-line, #e8d5b7)" }}>
            <h2>Pandit Login Credentials</h2>
            <p style={{ fontSize: ".85rem", opacity: .75, margin: "4px 0 0" }}>
              Pandit Ji in details se <code>/pandit-login</code> par login karenge.
              Password save hone ke baad dobara nahi dikhega — sirf reset kiya ja sakta hai.
            </p>
          </div>
          <div className="admin-panel__body">
            <div className="admin-form-grid">
              <div className="admin-field">
                <label htmlFor="temporaryPassword">Temporary Password</label>
                <input
                  className="input" id="temporaryPassword" name="temporaryPassword"
                  type="text" required minLength={8} autoComplete="off"
                  placeholder="min 8 chars, ek letter + ek number"
                />
                <small style={{ opacity: .7 }}>
                  Note it down now and share it with the pandit over a trusted channel.
                </small>
              </div>
              <div className="admin-field">
                <label htmlFor="dateOfBirth">Date of Birth</label>
                <input
                  className="input" id="dateOfBirth" name="dateOfBirth" type="date"
                  max={new Date().toISOString().slice(0, 10)}
                />
                <small style={{ opacity: .7 }}>
                  Used as the second factor if the pandit forgets their password.
                </small>
              </div>
              <div className="admin-field">
                <label htmlFor="city">City</label>
                <input className="input" id="city" name="city" placeholder="e.g. Ujjain" />
              </div>
              <div className="admin-field">
                <label htmlFor="state">State</label>
                <input className="input" id="state" name="state" placeholder="e.g. Madhya Pradesh" />
              </div>
              <div className="admin-field">
                <label htmlFor="experienceYears">Experience (years)</label>
                <input className="input" id="experienceYears" name="experienceYears" type="number" min={0} max={90} defaultValue={0} />
              </div>
            </div>
          </div>

          <div className="admin-panel__head" style={{ borderTop: "1px solid var(--admin-line, #e8d5b7)" }}>
            <h2>Subscription Plan</h2>
          </div>
          <div className="admin-panel__body">
            <div className="admin-form-grid">
              <div className="admin-field">
                <label htmlFor="planTier">Plan</label>
                <select className="input" id="planTier" name="planTier" defaultValue="free">
                  <option value="free">Free</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="diamond">Diamond</option>
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="planBillingCycle">Billing Cycle</label>
                <select className="input" id="planBillingCycle" name="planBillingCycle" defaultValue="monthly">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="planExpiresAt">Plan Valid Until (optional)</label>
                <input className="input" id="planExpiresAt" name="planExpiresAt" type="date" />
                <small style={{ opacity: .7 }}>Khali chhodne par billing cycle se calculate ho jaayega.</small>
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
