/* Thin backend API client — write actions only (enquiry, contact, newsletter,
   AI recommend). Browsing data stays local (see src/data) for instant,
   offline-capable rendering with zero loading states. Every call here fails
   soft: callers should still show a success toast even if the backend is
   unreachable, so the UI never breaks in a demo/offline environment. */

import { useEffect, useState } from "react";

const TOKEN_KEY = "panditconnect_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = "AbortController" in window ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : undefined;
  const token = getToken();
  try {
    const res = await fetch(BASE + path, {
      method: opts.method || "GET",
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller?.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && json.error) || `Request failed: ${res.status}`);
    return json as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}


/** Server verdict for one contact press. `qualifiedLead` is authoritative. */
export interface ContactResult {
  success: boolean;
  contactAllowed: boolean;
  interactionRecorded: boolean;
  qualifiedLead: boolean;
  leadId?: string;
  reason?:
    | "not_authenticated"
    | "user_not_active"
    | "user_not_verified"
    | "pandit_not_found"
    | "self_contact"
    | "method_not_qualifying"
    | "duplicate_window";
}

export interface PanditLoginResult {
  token: string;
  expiresAt: string;
  user: {
    id: string; email: string; fullName: string; role: string;
    phoneVerified: boolean; status: string;
  };
  pandit: { slug: string };
}

export interface EnquiryPayload {
  name: string;
  phone: string;
  service?: string;
  date?: string;
  message?: string;
}

export const api = {
  contact: (payload: { name: string; email: string; phone?: string; subject: string; message: string }) =>
    request("/contact", { method: "POST", body: payload }),
  subscribe: (email: string) => request("/newsletter", { method: "POST", body: { email } }),
  templeInquiry: (templeId: string, payload: EnquiryPayload) =>
    request(`/temples/${templeId}/inquiry`, { method: "POST", body: payload }),
  panditEnquiry: (panditId: string, payload: EnquiryPayload) =>
    request(`/pandits/${panditId}/enquiry`, { method: "POST", body: payload }),
  recommend: (text: string) => request("/recommend", { method: "POST", body: { text } }),
  /**
   * The single contact endpoint. Returns the server's verdict — the client
   * NEVER decides whether something is a qualified lead, it only reports the
   * press and reads back what the backend recorded.
   */
  trackClick: (panditId: string, method: "call" | "whatsapp", source?: string) =>
    request<ContactResult>(`/pandits/${panditId}/click`, { method: "POST", body: { method, source } }),

  // --- pandit auth ---
  panditLogin: (email: string, password: string) =>
    request<PanditLoginResult>("/auth/pandit/login", { method: "POST", body: { email, password } }),
  panditResetVerify: (email: string, dateOfBirth: string) =>
    request<{ success: boolean; resetToken: string; expiresInMinutes: number }>(
      "/auth/pandit/reset-password/verify", { method: "POST", body: { email, dateOfBirth } }),
  panditResetPassword: (resetToken: string, newPassword: string, confirmPassword: string) =>
    request<{ success: boolean; message: string }>(
      "/auth/pandit/reset-password", { method: "POST", body: { resetToken, newPassword, confirmPassword } }),
  trackView: (panditId: string) =>
    request(`/pandits/${panditId}/view`, { method: "POST", body: { sk: visitorKey() } }),
  /** The fair order for THIS visitor: market-aware, pooled per temple, and
   *  rotated by a session key so two devotees do not see the same pandits at
   *  the top. `sk` keeps that order stable across refreshes. */
  distributionOrder: (opts: { temple?: string; service?: string } = {}) => {
    const qs = new URLSearchParams({ sk: visitorKey(), rg: String(rotationGeneration()) });
    if (opts.temple) qs.set("temple", opts.temple);
    if (opts.service) qs.set("service", opts.service);
    return request<{
      generatedAt: string;
      market: string;
      marketSource: string;
      pool: string | null;
      order: { slug: string; tier: string; position: number }[];
    }>(`/pandits/distribution-order?${qs}`);
  },

  /** Tell the server which pandits were actually painted, in display order.
   *  Fire-and-forget: this is an analytics write and must never block or fail
   *  the page. */
  reportExposure: (slugs: string[], opts: { temple?: string; service?: string } = {}) =>
    request<{ recorded: number }>("/pandits/exposure", {
      method: "POST",
      body: { slugs, sk: visitorKey(), ...opts },
    }).catch(() => ({ recorded: 0 })),

  // generic REST
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * A stable, opaque per-visitor id.
 *
 * The rotation needs something consistent, or every refresh would reshuffle the
 * list and a devotee could never find the pandit they were just looking at.
 * Random and meaningless — no name, phone or account is involved, and the
 * server only ever uses it to deduplicate exposure and seed the shuffle.
 *
 * Falls back to a per-session value if storage is unavailable (private mode,
 * blocked cookies); the order is then stable for the tab rather than the
 * device, which is a graceful degradation, not a failure.
 */
let memoryKey: string | null = null;
export function visitorKey(): string {
  if (memoryKey) return memoryKey;
  const fresh = () =>
    (crypto?.randomUUID?.() ?? `v${Date.now()}${Math.random().toString(36).slice(2)}`).slice(0, 64);
  try {
    const stored = localStorage.getItem("ps_visitor");
    memoryKey = stored || fresh();
    if (!stored) localStorage.setItem("ps_visitor", memoryKey);
  } catch {
    memoryKey = fresh();
  }
  return memoryKey;
}

/**
 * Which real page load this is, for this visitor's rotation.
 *
 * Deliberately module state, not React state. A component re-render runs the
 * component body again but never re-runs this module's top level, so an SPA
 * state update — a filter change, a re-fetch, anything that keeps the tab on
 * the same script instance — cannot bump this counter. Only something that
 * re-executes the bundle (F5, typed-URL navigation, a full-page link) does,
 * which is exactly the "real reload vs re-render" distinction the rotation
 * feature needs: refreshing should surface a fresh generation, but a filter
 * dropdown re-rendering the pandit list must not.
 *
 * sessionStorage rather than localStorage: scoped to this tab, resets for a
 * new tab, and the server clamps whatever value it receives anyway (see
 * clampRefreshGeneration on the backend) — this is presentation input, not
 * an authority the client is trusted with.
 */
const ROTATION_GENERATION_KEY = "ps_rotation_gen";
const rotationGenerationValue: number = (() => {
  try {
    const raw = sessionStorage.getItem(ROTATION_GENERATION_KEY);
    const current = raw !== null ? parseInt(raw, 10) : -1;
    const next = Number.isFinite(current) ? current + 1 : 0;
    sessionStorage.setItem(ROTATION_GENERATION_KEY, String(next));
    return next;
  } catch {
    return 0; // private mode / storage blocked — degrade to "always a first load"
  }
})();
export function rotationGeneration(): number {
  return rotationGenerationValue;
}

/**
 * Fair ordering for the pandit lists, keyed by slug.
 *
 * Returns a SCORE so it stays a drop-in for the callers that already sort
 * descending: the engine gives positions (1 is best), so they are negated.
 * A pandit missing from the order — filtered out by market entitlement, or not
 * yet loaded — keeps the caller's `-Infinity` default and sorts last.
 *
 * Fails soft to `null`: on any error the pages stay on the rating-based sort
 * they had before. A distribution outage must never blank the listing.
 */
export function useFairRanking(
  temple?: string,
  service?: string,
  opts: { enabled?: boolean } = {},
): Map<string, number> | null {
  // Defaults true: every existing caller that predates this option keeps
  // fetching unconditionally, exactly as before. A caller behind a tab (see
  // TempleDetail.tsx / ServiceDetail.tsx's Pandits tab) passes `enabled:
  // activeTab === "pandits"` so a visitor who never opens that tab never
  // triggers the request at all.
  const { enabled = true } = opts;
  const [scores, setScores] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    api
      .distributionOrder({ temple, service })
      .then((res) => {
        if (!cancelled) setScores(new Map(res.order.map((o) => [o.slug, -o.position])));
      })
      .catch(() => {
        /* stay on rating-based order */
      });
    return () => {
      cancelled = true;
    };
  }, [temple, service, enabled]);
  return scores;
}

/**
 * Report the pandits actually rendered, in display order.
 *
 * This is the counter that makes fairness self-correcting: without it the
 * engine only knows who got leads, so a pandit shown 500 times who converted
 * nobody looks starved and gets boosted forever.
 *
 * Reports once per distinct list, after the list settles — not on every
 * keystroke of a filter, which would credit exposure for cards that flashed by.
 */
export function useReportExposure(
  slugs: string[],
  opts: { temple?: string; service?: string; enabled?: boolean } = {},
) {
  const { temple, service, enabled = true } = opts;
  const key = slugs.join(",");
  useEffect(() => {
    if (!enabled || !slugs.length) return undefined;
    // Debounced: filters and pagination change rapidly while a devotee is
    // browsing, and only what they settle on was really seen.
    const t = setTimeout(() => {
      void api.reportExposure(key.split(","), { temple, service });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, temple, service, enabled]);
}
