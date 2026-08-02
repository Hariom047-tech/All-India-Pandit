/* Thin backend API client — write actions only (enquiry, contact, newsletter,
   AI recommend). Browsing data stays local (see src/data) for instant,
   offline-capable rendering with zero loading states. Every call here fails
   soft: callers should still show a success toast even if the backend is
   unreachable, so the UI never breaks in a demo/offline environment. */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = "AbortController" in window ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : undefined;
  try {
    const res = await fetch(BASE + path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
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
};
