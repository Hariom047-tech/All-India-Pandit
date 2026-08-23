/**
 * useData — Domain-specific data hooks for every entity in PanditSuggest.
 *
 * These wrap the generic `useApi` hook with proper types and
 * query-string construction so pages can simply call:
 *
 *   const { data: temples, loading } = useTemples({ city: 'Ujjain' });
 *   const { data: pandit }           = usePandit('pandit-slug');
 */

import { useMemo } from "react";
import { useApi } from "../lib/useApi";

/* ═══════ API response shapes (match backend JSON) ═══════ */

export interface ApiPandit {
  id: string;
  slug: string;
  user_id?: string;
  title?: string;
  name: string;
  name_hi?: string;
  city: string;
  state: string;
  experience_years: number;
  bio?: string;
  specializations?: string[];
  languages?: string[];
  profile_photo_url?: string;
  cover_photo_url?: string;
  video_intro_url?: string;
  whatsapp_number?: string;
  phone?: string;
  email?: string;
  verification_status: string;
  current_tier: string;
  avg_rating: number;
  review_count: number;
  total_views?: number;
  total_enquiries?: number;
  is_active?: boolean;
  // Joined relations
  temples?: ApiTemple[];
  services?: ApiService[];
  reviews?: ApiReview[];
  // Compat aliases (mapped from DB fields)
  exp?: number;
  rating?: number;
  verified?: boolean;
  tier?: string;
  langs?: string[];
  img?: string;
  gotra?: string;
  edu?: string;
  about?: string;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface ApiTemple {
  id: string;
  slug: string;
  name: string;
  description?: string;
  short_description?: string;
  primary_deity?: string;
  city: string;
  state: string;
  address_line1?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  cover_image_url?: string;
  thumbnail_url?: string;
  established_year?: number;
  history?: string;
  significance?: string;
  pandit_count: number;
  review_count: number;
  avg_rating: number;
  is_verified?: boolean;
  is_featured?: boolean;
  // Joined
  pandits?: ApiPandit[];
  services?: ApiService[];
  reviews?: ApiReview[];
  timings?: ApiTempleTiming[];
  media?: ApiTempleMedia[];
  // Compat aliases
  deity?: string;
  rating?: number;
  reviews_count?: number;
  img?: string;
  lat?: number;
  lng?: number;
  gallery?: string[];
  highlights?: string[];
  about?: string;
  est?: string;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface ApiService {
  id: string;
  slug: string;
  name: string;
  description?: string;
  short_description?: string;
  duration_minutes?: number;
  samagri_included?: boolean;
  price_estimate_min?: number;
  price_estimate_max?: number;
  image_url?: string;
  category_id?: string;
  category_name?: string;
  // Joined
  pandits?: ApiPandit[];
  temples?: ApiTemple[];
  reviews?: ApiReview[];
  // Compat
  icon?: string;
  cat?: string;
  tag?: string;
  dur?: string;
  desc?: string;
  samagri?: string[];
  img?: string;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface ApiReview {
  id: string;
  user_id?: string;
  user_name?: string;
  user_avatar?: string;
  reviewable_type: "pandit" | "temple" | "service" | "platform";
  reviewable_id?: string;
  rating: number;
  title?: string;
  comment: string;
  is_approved?: boolean;
  is_verified_booking?: boolean;
  created_at: string;
  images?: { id: string; image_url: string; sort_order: number }[];
  // Compat
  name?: string;
  city?: string;
  text?: string;
  photos?: string[];
}

export interface ApiBlogPost {
  id: string;
  slug?: string;
  title: string;
  content?: string;
  excerpt?: string;
  category?: string;
  cover_image_url?: string;
  author_name?: string;
  published_at?: string;
  read_time?: string;
  // Compat
  cat?: string;
  date?: string;
  read?: string;
}

export interface ApiStat {
  icon?: string;
  num: string;
  label: string;
}

export interface ApiFaq {
  q: string;
  a: string;
}

export interface ApiPlan {
  name: string;
  price: string;
  per: string;
  feats: string[];
  cta: string;
  popular?: boolean;
}

export interface ApiTempleTiming {
  day_of_week: string;
  open_time: string;
  close_time: string;
  special_notes?: string;
}

export interface ApiTempleMedia {
  id: string;
  media_type: string;
  url: string;
  caption?: string;
}

/* ═══════ List result wrapper (backend returns { data: [...], meta: { page, perPage, total, totalPages } }) ═══════ */
export interface PaginatedMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginatedMeta;
}

/* ═══════ Filter types ═══════ */

export interface PanditFilters {
  /** Index signature so these can be passed straight to qs(). */
  [key: string]: unknown;
  city?: string;
  state?: string;
  service?: string;
  language?: string;
  minExp?: number;
  minRating?: number;
  verified?: boolean;
  tier?: string;
  sort?: string;
  page?: number;
  /** Matches the backend's readPaging() — NOT "limit", which the API has
   *  never recognized (silently ignored, falling back to its own default
   *  page size). */
  perPage?: number;
  q?: string;
  featured?: boolean;
}

export interface TempleFilters {
  /** Index signature so these can be passed straight to qs(). */
  [key: string]: unknown;
  city?: string;
  state?: string;
  deity?: string;
  /** Service slug — only temples with this catalogue service linked
   *  (temples.repository.js's list() joins temple_services for this). */
  service?: string;
  sort?: string;
  page?: number;
  /** See the matching note on PanditFilters.perPage. */
  perPage?: number;
  q?: string;
  featured?: boolean;
}

export interface ServiceFilters {
  /** Index signature so these can be passed straight to qs(). */
  [key: string]: unknown;
  category?: string;
  q?: string;
}

export interface BlogFilters {
  /** Index signature so these can be passed straight to qs(). */
  [key: string]: unknown;
  cat?: string;
  q?: string;
  page?: number;
  limit?: number;
}

/* ═══════ Query string builder ═══════ */

function qs(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/* ═══════ PANDIT hooks ═══════ */

export function usePandits(filters?: PanditFilters) {
  const path = useMemo(() => `/pandits${qs(filters || {})}`, [JSON.stringify(filters)]);
  return useApi<PaginatedResult<ApiPandit> | ApiPandit[]>(path);
}

export function usePandit(slug: string) {
  return useApi<ApiPandit>(slug ? `/pandits/${slug}` : null, { enabled: !!slug });
}

/* ═══════ TEMPLE hooks ═══════ */

export function useTemples(filters?: TempleFilters) {
  const path = useMemo(() => `/temples${qs(filters || {})}`, [JSON.stringify(filters)]);
  return useApi<PaginatedResult<ApiTemple> | ApiTemple[]>(path);
}

export function useTemple(slug: string) {
  return useApi<ApiTemple>(slug ? `/temples/${slug}` : null, { enabled: !!slug });
}

/* ═══════ SERVICE hooks ═══════ */

export function useServices(filters?: ServiceFilters) {
  const path = useMemo(() => `/services${qs(filters || {})}`, [JSON.stringify(filters)]);
  return useApi<PaginatedResult<ApiService> | ApiService[]>(path);
}

export function useService(slug: string) {
  return useApi<ApiService>(slug ? `/services/${slug}` : null, { enabled: !!slug });
}

/* ═══════ REVIEW hooks ═══════ */

export function useReviews(type?: string, id?: string) {
  const path = useMemo(() => {
    if (!type) return "/reviews";
    // The API reads targetType/targetSlug. This previously sent type/id, which
    // the backend ignored — so a pandit's "reviews" were really the global
    // testimonial feed, and every profile showed the same ones.
    // Platform reviews have no target slug.
    return `/reviews${qs({ targetType: type, targetSlug: type === "platform" ? undefined : (id || undefined) })}`;
  }, [type, id]);
  return useApi<PaginatedResult<ApiReview> | ApiReview[]>(path);
}

/* ═══════ BLOG hooks ═══════ */

export function useBlogPosts(filters?: BlogFilters) {
  const path = useMemo(() => `/blog${qs(filters || {})}`, [JSON.stringify(filters)]);
  return useApi<PaginatedResult<ApiBlogPost> | ApiBlogPost[]>(path);
}

export function useBlogPost(slug: string) {
  return useApi<ApiBlogPost>(slug ? `/blog/${slug}` : null, { enabled: !!slug });
}

/* ═══════ UTILITY hooks ═══════ */

export function useStats() {
  return useApi<ApiStat[]>("/stats", { cacheTtl: 300_000 });
}

export interface HeroImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  caption: string | null;
}

/**
 * Admin-chosen homepage hero images. Cached for 5 minutes — this is editorial
 * content that changes rarely and is fetched on every homepage view.
 */
export interface ServiceCategoryTile {
  slug: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
  icon_name: string | null;
  service_count: number;
  pandit_count: number;
}

/** Admin-curated "Most booked services" tiles, with computed live counts. */
export function useServiceCategories() {
  return useApi<ServiceCategoryTile[]>("/services/categories", { cacheTtl: 300_000 });
}

export function useHomeHero() {
  return useApi<HeroImage[]>("/home-hero", { cacheTtl: 300_000 });
}

export interface PublicSettings {
  /** Admin-configurable pandit cards per page on the /pandits directory. */
  pandits_per_page: number;
}

export function usePublicSettings() {
  return useApi<PublicSettings>("/settings", { cacheTtl: 300_000 });
}

export function useFaqs() {
  return useApi<ApiFaq[]>("/faqs", { cacheTtl: 300_000 });
}

export function usePlans() {
  return useApi<ApiPlan[]>("/plans", { cacheTtl: 300_000 });
}

/* ═══════ SEARCH hooks ═══════ */

export function useSearch(query: string) {
  const q = query.trim();
  const pandits = useApi<PaginatedResult<ApiPandit> | ApiPandit[]>(
    q ? `/pandits${qs({ q, limit: 10 })}` : null,
    { enabled: q.length >= 2 },
  );
  const temples = useApi<PaginatedResult<ApiTemple> | ApiTemple[]>(
    q ? `/temples${qs({ q, limit: 10 })}` : null,
    { enabled: q.length >= 2 },
  );
  const services = useApi<PaginatedResult<ApiService> | ApiService[]>(
    q ? `/services${qs({ q, limit: 10 })}` : null,
    { enabled: q.length >= 2 },
  );

  return {
    pandits: pandits.data,
    temples: temples.data,
    services: services.data,
    loading: pandits.loading || temples.loading || services.loading,
    error: pandits.error || temples.error || services.error,
  };
}
