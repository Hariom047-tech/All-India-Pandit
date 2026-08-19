import { useEffect, useRef, useState } from "react";
import {
  searchPlaces, mapEmbedUrl, externalMapUrl, geocodeProvider,
  type PlaceResult,
} from "../../lib/geocode";

export interface LocationValue {
  lat: string;
  lng: string;
  address: string;
  city: string;
  state: string;
}

/**
 * Search a temple by name and pin it on a map, instead of hand-entering
 * coordinates.
 *
 * Latitude/longitude are still shown and still editable — they are what the
 * database stores and what the temple map renders from, so hiding them
 * entirely would make a wrong pin impossible to correct. They are just no
 * longer something anyone has to look up by hand.
 */
export function LocationPicker({
  value, onChange, defaultQuery = "",
}: {
  value: LocationValue;
  onChange: (next: Partial<LocationValue>) => void;
  defaultQuery?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Abandon an in-flight lookup if the component closes mid-search.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    const q = query.trim();
    if (q.length < 3) { setError("Kam se kam 3 characters likhein."); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true); setError(""); setResults(null);
    try {
      const found = await searchPlaces(q, controller.signal);
      setResults(found);
      if (!found.length) setError("Koi jagah nahi mili. Naam ya city badal kar dekhein.");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Search nahi ho payi.");
    } finally {
      setBusy(false);
    }
  }

  function pick(place: PlaceResult) {
    onChange({
      lat: place.lat.toFixed(6),
      lng: place.lng.toFixed(6),
      address: place.address,
      // Never clobber a value the admin already typed with an empty one the
      // geocoder happened not to return.
      ...(place.city ? { city: place.city } : {}),
      ...(place.state ? { state: place.state } : {}),
    });
    setResults(null);
    setQuery(place.label.split(" — ")[0] || query);
  }

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
    && value.lat !== "" && value.lng !== "";

  return (
    <div className="loc-picker">
      <label className="admin-field admin-field--full" style={{ marginBottom: 0 }}>
        <span>Find on map</span>
        <div className="loc-picker__search">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Maa Baglamukhi Mandir Nalkheda"
            // A bare Enter inside a form submits it; this field must search.
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(); } }}
          />
          <button type="button" className="btn btn-gold btn-sm" onClick={run} disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </label>
      <p className="loc-picker__hint">
        Temple ka naam aur city likhein — location, address, city aur state apne aap bhar jaayenge.
        <span className="loc-picker__provider"> Powered by {geocodeProvider}.</span>
      </p>

      {error && <p className="loc-picker__error" role="alert">{error}</p>}

      {results && results.length > 0 && (
        <ul className="loc-picker__results">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button type="button" className="loc-picker__result" onClick={() => pick(r)}>
                <strong>{r.label.split(" — ")[0]}</strong>
                <small>{r.address}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasPin && (
        <div className="loc-picker__preview">
          <iframe
            title="Selected location"
            src={mapEmbedUrl(lat, lng)}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="loc-picker__coords">
            <span>📍 {lat.toFixed(5)}, {lng.toFixed(5)}</span>
            <a href={externalMapUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
              Open in Google Maps ↗
            </a>
          </div>
        </div>
      )}

      <details className="loc-picker__manual">
        <summary>Coordinates manually daalein</summary>
        <div className="admin-form-grid" style={{ marginTop: 10 }}>
          <div className="admin-field">
            <label>Latitude</label>
            <input
              className="input" type="number" step="any" required
              value={value.lat} onChange={(e) => onChange({ lat: e.target.value })}
            />
          </div>
          <div className="admin-field">
            <label>Longitude</label>
            <input
              className="input" type="number" step="any" required
              value={value.lng} onChange={(e) => onChange({ lng: e.target.value })}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
