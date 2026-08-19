import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { PageHead, ErrorState, Loading } from "./_shared";

interface OwnProfile {
  slug: string; full_name: string; email: string; phone: string | null;
  city: string | null; state: string | null;
  bio: string | null; short_bio: string | null; experience_years: number;
  primary_specialization: string | null; specializations: string[] | null;
  public_phone: string | null; whatsapp_number: string | null; public_email: string | null;
  is_available: boolean; accepts_online: boolean; travel_radius_km: number;
  verification_status: string; current_tier: string; is_featured: boolean;
  languages: string[];
}

/**
 * Editable fields only. Verification, tier, featured status and ranking are
 * shown read-only with an explanation — a pandit self-approving their own
 * verified badge or paid tier would defeat the point of both.
 */
export default function Profile() {
  const [p, setP] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<OwnProfile>("/me/pandit-profile").then(setP)
      .catch(() => setError("Profile load nahi ho payi."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!p || busy) return;
    setBusy(true); setSaved(false); setError(null);
    try {
      await api.put("/me/pandit-profile", {
        bio: p.bio, shortBio: p.short_bio, experienceYears: Number(p.experience_years),
        primarySpecialization: p.primary_specialization,
        publicPhone: p.public_phone, whatsappNumber: p.whatsapp_number,
        publicEmail: p.public_email, isAvailable: p.is_available,
        acceptsOnline: p.accepts_online, travelRadiusKm: Number(p.travel_radius_km),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile save nahi ho payi.");
    } finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  if (!p) return <ErrorState message={error || "Profile load nahi ho payi."} onRetry={load} />;

  const set = <K extends keyof OwnProfile>(k: K, v: OwnProfile[K]) => setP({ ...p, [k]: v });

  return (
    <div className="pandit-page">
      <PageHead title="My Profile" sub="Apni public profile ki jaankari update karein." />

      {saved && <div className="pandit-alert pandit-alert--success" role="status">Profile save ho gayi.</div>}
      {error && <div className="pandit-alert pandit-alert--error" role="alert">{error}</div>}

      <form onSubmit={save}>
        <fieldset className="pandit-fieldset">
          <legend>Aap</legend>
          <div className="pandit-grid2">
            <ReadOnly label="Name" value={p.full_name} />
            <ReadOnly label="Login Email" value={p.email} />
            <ReadOnly label="City" value={p.city || "—"} />
            <ReadOnly label="State" value={p.state || "—"} />
          </div>
          <p className="pandit-hint">Naam, email ya city badalni ho to support se sampark karein.</p>
        </fieldset>

        <fieldset className="pandit-fieldset">
          <legend>Public jaankari</legend>
          <label className="pandit-field">
            <span className="pandit-field__label">Short Bio</span>
            <input className="pandit-input" maxLength={300} value={p.short_bio || ""}
              onChange={(e) => set("short_bio", e.target.value)} />
          </label>
          <label className="pandit-field">
            <span className="pandit-field__label">Bio</span>
            <textarea className="pandit-input" rows={5} maxLength={5000} value={p.bio || ""}
              onChange={(e) => set("bio", e.target.value)} />
          </label>
          <div className="pandit-grid2">
            <label className="pandit-field">
              <span className="pandit-field__label">Experience (years)</span>
              <input className="pandit-input" type="number" min={0} max={90} value={p.experience_years}
                onChange={(e) => set("experience_years", Number(e.target.value))} />
            </label>
            <label className="pandit-field">
              <span className="pandit-field__label">Main Specialization</span>
              <input className="pandit-input" value={p.primary_specialization || ""}
                onChange={(e) => set("primary_specialization", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="pandit-fieldset">
          <legend>Contact</legend>
          <div className="pandit-grid2">
            <label className="pandit-field">
              <span className="pandit-field__label">Public Phone</span>
              <input className="pandit-input" inputMode="tel" value={p.public_phone || ""}
                onChange={(e) => set("public_phone", e.target.value)} />
            </label>
            <label className="pandit-field">
              <span className="pandit-field__label">WhatsApp Number</span>
              <input className="pandit-input" inputMode="tel" value={p.whatsapp_number || ""}
                onChange={(e) => set("whatsapp_number", e.target.value)} />
            </label>
          </div>
          <label className="pandit-check">
            <input type="checkbox" checked={p.is_available}
              onChange={(e) => set("is_available", e.target.checked)} />
            <span>Main abhi available hoon (profile listing mein dikhegi)</span>
          </label>
          <label className="pandit-check">
            <input type="checkbox" checked={p.accepts_online}
              onChange={(e) => set("accepts_online", e.target.checked)} />
            <span>Online puja accept karta hoon</span>
          </label>
        </fieldset>

        <fieldset className="pandit-fieldset pandit-fieldset--locked">
          <legend>Admin dwara managed</legend>
          <div className="pandit-grid2">
            <ReadOnly label="Verification" value={p.verification_status} />
            <ReadOnly label="Plan" value={p.current_tier} />
            <ReadOnly label="Featured" value={p.is_featured ? "Yes" : "No"} />
            <ReadOnly label="Profile URL" value={`/pandits/${p.slug}`} />
          </div>
          <p className="pandit-hint">
            Yeh fields sirf admin badal sakte hain — isse verification aur plans ka bharosa bana rehta hai.
          </p>
        </fieldset>

        <button type="submit" className="pandit-btn pandit-btn--primary" disabled={busy}>
          {busy ? "Save ho raha hai…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="pandit-field">
      <span className="pandit-field__label">{label}</span>
      <output className="pandit-input pandit-input--ro">{value}</output>
    </div>
  );
}
