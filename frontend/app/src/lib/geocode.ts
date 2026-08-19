/**
 * Place search + reverse geocoding for the admin panel.
 *
 * Two providers, chosen at runtime:
 *   Google Places — used when VITE_GOOGLE_MAPS_API_KEY is set. Better Indian
 *     temple coverage, which matters here: many temples are landmarks rather
 *     than postal addresses.
 *   OpenStreetMap Nominatim — keyless fallback so the picker still works in a
 *     fresh checkout with no billing account attached.
 *
 * Both return the same shape, so the UI never branches on provider.
 */

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
}

export const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || "";
export const hasGoogleMaps = Boolean(MAPS_KEY);
export const geocodeProvider = hasGoogleMaps ? "Google Maps" : "OpenStreetMap";

/* ── Google Maps JS loader (single-flight) ─────────────────────────── */

let googleLoader: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (!hasGoogleMaps) return Promise.reject(new Error("No Maps API key configured"));
  // Cached so opening the modal repeatedly doesn't inject the script again —
  // a second <script> tag makes the Maps API log a duplicate-load warning and
  // can reset internal state.
  if (googleLoader) return googleLoader;

  googleLoader = new Promise<void>((resolve, reject) => {
    if (window.google?.maps) return resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
  return googleLoader;
}

/* ── Google Places ─────────────────────────────────────────────────── */

interface GPlace {
  formatted_address?: string;
  name?: string;
  geometry?: { location: { lat: () => number; lng: () => number } };
  address_components?: { long_name: string; types: string[] }[];
}

function componentOf(place: GPlace, ...types: string[]): string {
  for (const type of types) {
    const hit = place.address_components?.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  return "";
}

async function searchGoogle(query: string): Promise<PlaceResult[]> {
  await loadGoogleMaps();
  const maps = window.google!.maps as unknown as {
    places: {
      PlacesService: new (el: HTMLElement) => {
        textSearch: (req: object, cb: (r: GPlace[] | null, status: string) => void) => void;
      };
    };
  };

  // PlacesService requires a DOM node purely as an attribution surface; a
  // detached div satisfies it without rendering anything.
  const service = new maps.places.PlacesService(document.createElement("div"));

  return new Promise((resolve, reject) => {
    service.textSearch({ query, region: "in" }, (results, status) => {
      if (status !== "OK" || !results) {
        if (status === "ZERO_RESULTS") return resolve([]);
        return reject(new Error(`Places search failed (${status})`));
      }
      resolve(results.slice(0, 6).map((p) => ({
        label: [p.name, p.formatted_address].filter(Boolean).join(" — "),
        lat: p.geometry!.location.lat(),
        lng: p.geometry!.location.lng(),
        address: p.formatted_address || p.name || "",
        city: componentOf(p, "locality", "administrative_area_level_3", "administrative_area_level_2"),
        state: componentOf(p, "administrative_area_level_1"),
      })));
    });
  });
}

/* ── OpenStreetMap Nominatim (keyless) ─────────────────────────────── */

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

async function searchOsm(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "in");

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Place search failed");
  const hits = (await res.json()) as NominatimHit[];

  return hits.map((h) => {
    const a = h.address || {};
    return {
      label: h.display_name,
      lat: Number(h.lat),
      lng: Number(h.lon),
      address: h.display_name,
      // OSM classifies settlements inconsistently — a temple town may be a
      // village, a town, a municipality or a city depending on the mapper.
      city: a.city || a.town || a.village || a.municipality || a.county || "",
      state: a.state || "",
    };
  });
}

/** Provider-agnostic place search. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  return hasGoogleMaps ? searchGoogle(q) : searchOsm(q, signal);
}

/** Embeddable map preview URL for a coordinate — an iframe, so no JS needed. */
export function mapEmbedUrl(lat: number, lng: number): string {
  if (hasGoogleMaps) {
    return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${lat},${lng}&zoom=16`;
  }
  const d = 0.006;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

/** "Open in Google Maps" — always Google, key or not; this is just a deep link. */
export function externalMapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
