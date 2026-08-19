/**
 * normalize — Converts backend API response objects into the shapes
 * that existing frontend components already understand.
 *
 * This avoids touching every component's JSX — we transform once at
 * the data layer and the rest of the UI just works.
 */

import type { Pandit, Temple, Service, Review, BlogPost } from "../data/types";
import type {
  ApiPandit, ApiTemple, ApiService, ApiReview, ApiBlogPost,
  PaginatedResult,
} from "../hooks/useData";

/**
 * Coerce a numeric column to a real number.
 *
 * node-postgres returns DECIMAL/NUMERIC as a STRING, deliberately — a JS
 * double cannot hold every value a NUMERIC can, so the driver refuses to lose
 * precision silently. That means `latitude`, `longitude` and `avg_rating`
 * arrive as "23.28720000", and any `.toFixed()` on them throws
 * "toFixed is not a function", which unmounts the whole React tree and
 * renders a blank white page.
 *
 * Bundled content.ts data is already numeric, which is why this only ever
 * broke on API-backed records.
 */
function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/* helper: split space-separated string into array, or return existing array */
function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return v.split(/\s+/);
  return [];
}

// Some pandits' stored full_name already includes the "Pandit" honorific
// (16 rows, confirmed via DB query) — prepending it unconditionally produced
// titles/greetings like "Pandit Pandit Ramesh Sharma" (Phase 12 technical SEO
// batch, docs/SEO_ARCHITECTURE.md). Mirrors backend/src/utils/seoMeta.js's
// withPanditHonorific. Only used where "Pandit" is being prepended — the raw
// name (already correct either way) is used everywhere else unchanged.
export function withPanditHonorific(name: string): string {
  return /^pandit\s/i.test(name) ? name : `Pandit ${name}`;
}

/* ── PANDIT ── */
export function normPandit(p: ApiPandit): Pandit {
  return {
    id: p.slug || p.id,
    name: p.name || "",
    nameHi: p.name_hi,
    city: p.city || "",
    state: p.state || "",
    exp: p.exp ?? p.experience_years ?? 0,
    rating: num(p.rating ?? p.avg_rating),
    reviews: p.review_count ?? p.reviews ?? 0,
    verified: p.verification_status === "verified" || (p as any).verified === true,
    tier: mapTier(p.current_tier || p.tier),
    langs: toArr(p.langs ?? p.languages),
    services: toArr(p.services),
    temples: toArr(p.temples),
    phone: p.whatsapp_number || p.phone || "",
    // Real columns since migration 08. The extractField() fallback stays for
    // legacy bundled records whose bio genuinely used the "Education:" prefix.
    edu: (p as any).vedic_education || p.edu || extractField(p.about, "Education:") || "",
    gotra: (p as any).gotra || extractField(p.about, "Gotra:") || "",
    about: p.bio || p.about || "",
    tradition: (p as any).tradition || "",
    respondsWithin: (p as any).responds_within || "",
    acceptsOnline: Boolean((p as any).accepts_online),
    img: p.img || p.profile_photo_url || "/assets/img/pandits/default.jpg",
    // Extra fields the frontend might want
    ...(p.video_intro_url ? { videoUrl: p.video_intro_url } : {}),
    ...(p.slug ? { slug: p.slug } : {}),
  } as Pandit & { videoUrl?: string; slug?: string };
}

/* ── TEMPLE ── */
export function normTemple(t: ApiTemple): Temple {
  return {
    id: t.slug || t.id,
    name: t.name || "",
    city: t.city || "",
    state: t.state || "",
    deity: t.deity || t.primary_deity || "",
    rating: num(t.rating ?? t.avg_rating),
    // `reviews` is a count on the list payload but an array on the detail
    // payload — normalise both to a number.
    reviews: Array.isArray(t.reviews)
      ? t.reviews.length
      : (t.reviews ?? t.review_count ?? t.reviews_count ?? 0),
    pandits: typeof t.pandits === "number" ? t.pandits : (t.pandit_count ?? 0),
    timings: typeof t.timings === "string" ? t.timings : (Array.isArray(t.timings) && t.timings.length ? formatTimings(t.timings) : "6:00 AM – 9:00 PM"),
    est: t.est || (t.established_year ? String(t.established_year) : ""),
    lat: num(t.lat ?? t.latitude),
    lng: num(t.lng ?? t.longitude),
    services: toArr((t as any).services),
    img: t.img || t.cover_image_url || t.thumbnail_url || "/assets/img/temples/default.jpg",
    about: t.about || t.description || t.short_description || "",
    history: (t as any).history || t.history || "",
    significance: (t as any).significance || "",
    gallery: t.gallery || (t.media ? t.media.filter(m => m.media_type === "image").map(m => m.url) : []),
    // JSONB from the API is already string[]; older bundled content matches.
    highlights: Array.isArray(t.highlights) ? (t.highlights as string[]) : [],
    album: (t.gallery && t.gallery.length > 0) || (t.media && t.media.length > 0),
  };
}

/* ── SERVICE ── */
export function normService(s: ApiService): Service {
  return {
    id: s.slug || s.id,
    name: s.name || "",
    icon: s.icon || s.image_url || "🕉️",
    cat: (s.cat || s.category_name || "daily") as Service["cat"],
    tag: s.tag || s.short_description || "",
    dur: s.dur || (s.duration_minutes ? `${s.duration_minutes} min` : ""),
    pandits: (s as any).pandit_count ?? (s.pandits ? (Array.isArray(s.pandits) ? s.pandits.length : 0) : 0),
    desc: s.desc || s.description || "",
    samagri: s.samagri || [],
    img: s.img || s.image_url,
    priority: (s as any).priority,
    popular: Boolean((s as any).is_popular ?? (s as any).popular),
    onlineAvailable: Boolean((s as any).is_online_available),
    onlineNote: (s as any).online_note ?? null,
  };
}

/* ── REVIEW ── */
export function normReview(r: ApiReview): Review {
  return {
    name: r.name || r.user_name || "Devotee",
    city: r.city || "",
    rating: num(r.rating),
    title: (r as any).title || undefined,
    text: r.text || r.comment || "",
    date: (r as any).created_at || undefined,
    service: (r as any).service,
    // The API column is photo_urls. This previously checked only `photos` and
    // `images`, so every uploaded review photo was silently discarded.
    photos: (r as any).photo_urls || r.photos || (r.images ? r.images.map(i => i.image_url) : []),
    avatar: (r as any).avatar || r.user_avatar,
  };
}

/* ── BLOG POST ── */
export function normBlogPost(b: ApiBlogPost): BlogPost {
  return {
    id: b.slug || b.id,
    cat: b.cat || b.category || "",
    title: b.title,
    date: b.date || b.published_at || "",
    read: b.read || b.read_time || "5 min",
    excerpt: b.excerpt || "",
  };
}

/* ── LIST NORMALIZERS (handle paginated or array responses) ── */

export function normPandits(res: PaginatedResult<ApiPandit> | ApiPandit[] | null): Pandit[] {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : (res.data || []);
  return arr.map(normPandit);
}

export function normTemples(res: PaginatedResult<ApiTemple> | ApiTemple[] | null): Temple[] {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : (res.data || []);
  return arr.map(normTemple);
}

export function normServices(res: PaginatedResult<ApiService> | ApiService[] | null): Service[] {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : (res.data || []);
  return arr.map(normService);
}

export function normReviews(res: PaginatedResult<ApiReview> | ApiReview[] | null): Review[] {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : (res.data || []);
  return arr.map(normReview);
}

export function normBlogPosts(res: PaginatedResult<ApiBlogPost> | ApiBlogPost[] | null): BlogPost[] {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : (res.data || []);
  return arr.map(normBlogPost);
}

/** Extract pagination meta from a PaginatedResult */
export function getMeta(res: PaginatedResult<unknown> | unknown[] | null) {
  if (!res || Array.isArray(res)) return { page: 1, total: 0, totalPages: 1, perPage: 12 };
  return (res as PaginatedResult<unknown>).meta || { page: 1, total: 0, totalPages: 1, perPage: 12 };
}

/* ── helpers ── */

function mapTier(t?: string): "Diamond" | "Gold" | "Silver" {
  if (!t) return "Silver";
  const lower = t.toLowerCase();
  if (lower === "diamond") return "Diamond";
  if (lower === "gold") return "Gold";
  return "Silver";
}

function extractField(text: string | undefined, label: string): string {
  if (!text) return "";
  const idx = text.indexOf(label);
  if (idx < 0) return "";
  const after = text.slice(idx + label.length).trim();
  // take until pipe, newline, or end
  const match = after.match(/^([^|\n]+)/);
  return match ? match[1].trim() : "";
}

function formatTimings(timings: any[]): string {
  if (!timings.length) return "";
  const t = timings[0];
  return `${t.open_time || "6:00 AM"} – ${t.close_time || "9:00 PM"}`;
}
