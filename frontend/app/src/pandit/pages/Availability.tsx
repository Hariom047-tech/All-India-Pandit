import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { PageHead, Loading, ErrorState } from "./_shared";

/**
 * PanditSuggest is a contact/lead platform, not a booking marketplace — so
 * "availability" here is a single visibility switch plus travel radius, not a
 * calendar of bookable slots. Inventing a slot-booking UI would imply a
 * product promise the backend deliberately does not make.
 */
export default function Availability() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [radius, setRadius] = useState(50);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<{ is_available: boolean; travel_radius_km: number }>("/me/pandit-profile")
      .then((p) => { setAvailable(p.is_available); setRadius(p.travel_radius_km ?? 50); })
      .catch(() => setError("Availability load nahi ho payi."));
  }, []);
  useEffect(load, [load]);

  async function save(next: { isAvailable?: boolean; travelRadiusKm?: number }) {
    setBusy(true); setSaved(false); setError(null);
    try {
      await api.put("/me/pandit-profile", next);
      setSaved(true);
    } catch { setError("Save nahi ho paya."); }
    finally { setBusy(false); }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (available === null) return <Loading />;

  return (
    <div className="pandit-page">
      <PageHead title="Availability" sub="Aap abhi naye contacts ke liye uplabdh hain ya nahi." />
      {saved && <div className="pandit-alert pandit-alert--success" role="status">Save ho gaya.</div>}

      <label className="pandit-check pandit-check--big">
        <input type="checkbox" checked={available} disabled={busy}
          onChange={(e) => { setAvailable(e.target.checked); save({ isAvailable: e.target.checked }); }} />
        <span>Main abhi available hoon</span>
      </label>
      <p className="pandit-hint">
        Band karne par aapki profile directory listing se hat jaati hai aur nayi leads aana ruk jaati hain.
      </p>

      <label className="pandit-field" style={{ maxWidth: 320 }}>
        <span className="pandit-field__label">Travel radius (km)</span>
        <input className="pandit-input" type="number" min={0} max={1000} value={radius} disabled={busy}
          onChange={(e) => setRadius(Number(e.target.value))}
          onBlur={() => save({ travelRadiusKm: radius })} />
      </label>
    </div>
  );
}
