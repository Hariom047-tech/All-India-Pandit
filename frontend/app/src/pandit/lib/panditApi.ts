import { api } from "../../lib/api";

export interface DashboardPayload {
  pandit: { name: string; profileSlug: string; verificationStatus: string; isAvailable: boolean };
  plan: {
    tier: "free" | "silver" | "gold" | "diamond";
    name: string; status: string; billingCycle: string | null;
    startedAt: string | null; expiresAt: string | null; autoRenew: boolean | null;
  };
  qualifiedLeads: { today: number; week: number; month: number; total: number };
  /** Anonymous aggregates only — no viewer identity exists anywhere in this payload. */
  views: { today: number; week: number; month: number; total: number };
  analytics: {
    profileViews: number; viewsToday: number; viewsWeek: number; viewsMonth: number;
    ctaClicks: number; callInteractions: number; whatsappInteractions: number;
    verifiedInteractions: number; qualifiedLeadCount: number;
  };
  recentLeads: Lead[];
  meta: { dedupWindowHours: number; reportingTimezone: string; pendingInquiries: number };
}

export interface Lead {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  first_contact_method: "phone_call" | "whatsapp";
  last_contact_method: "phone_call" | "whatsapp";
  interaction_count: number;
  status: LeadStatus;
  created_at: string;
  last_interaction_at: string;
}

export type LeadStatus = "new" | "viewed" | "contacted" | "completed" | "not_reachable";

export interface Paginated<T> {
  data: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages?: number;
}

export interface PlanOption {
  name: string; tier: string; price: number;
  priceMonthly: number; priceQuarterly: number | null; priceYearly: number | null;
  currency: string; inclusions: string[]; description: string | null;
  tagline: string | null; popular: boolean;
  limits: { templeListings: number; serviceListings: number; photos: number };
}

export const panditApi = {
  dashboard: () => api.get<DashboardPayload>("/me/dashboard"),

  leads: (params: { page?: number; limit?: number; period?: string; method?: string; status?: string }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
    });
    const query = qs.toString();
    return api.get<Paginated<Lead>>(`/me/leads${query ? `?${query}` : ""}`);
  },

  setLeadStatus: (id: string, status: LeadStatus) =>
    api.post<{ ok: boolean; status: LeadStatus }>(`/me/leads/${id}`, { status }),

  plans: () => api.get<PlanOption[]>("/plans"),

  /**
   * Only the plan identifier and cycle go over the wire. Price, currency and
   * the allowed transition are all resolved server-side from the plan
   * catalogue — a tampered price in this body has no effect on what Razorpay
   * is asked to charge.
   */
  subscribe: (slug: string, tier: string, billingCycle: string) =>
    api.post<{ paymentId: string; orderId: string; amount: number; currency: string; keyId: string }>(
      `/pandits/${slug}/subscribe`, { tier, billingCycle }),
};

/** PATCH isn't on the shared client; leads status uses it. */
export async function patchLeadStatus(id: string, status: LeadStatus) {
  const token = localStorage.getItem("panditconnect_token");
  const base = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
  const res = await fetch(`${base}/me/leads/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ status }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && json.error) || "Status update nahi ho paya.");
  return json as { ok: boolean; status: LeadStatus };
}
