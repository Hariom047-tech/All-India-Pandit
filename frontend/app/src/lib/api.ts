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
  trackClick: (panditId: string, method: "call" | "whatsapp") =>
    request(`/pandits/${panditId}/click`, { method: "POST", body: { method } }),
  trackView: (panditId: string) =>
    request(`/pandits/${panditId}/view`, { method: "POST" }),
  rankedOrder: () =>
    request<{ generatedAt: string; order: { slug: string; tier: string; displayScore: number }[] }>("/pandits/ranked-order"),

  // generic REST
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Lead-distribution fairness scores, keyed by pandit slug (== Pandit.id in
 * src/data/content.ts). Fetched once and fails soft to `null` — callers
 * should fall back to the rating-based sort they already had, never block
 * or show a loading state on this. */
export function useFairRanking(): Map<string, number> | null {
  const [scores, setScores] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .rankedOrder()
      .then((res) => {
        if (!cancelled) setScores(new Map(res.order.map((o) => [o.slug, o.displayScore])));
      })
      .catch(() => {
        /* stay on rating-based order */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return scores;
}
