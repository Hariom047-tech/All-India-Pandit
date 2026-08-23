import { api } from "../../lib/api";

export interface DashboardPayload {
  pandit: {
    name: string; profileSlug: string; verificationStatus: string; isAvailable: boolean;
    isPaused: boolean; pausedReason: string | null; pausedAt: string | null;
  };
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
  city: string | null;
  state: string | null;
}

export interface TrendPointRaw {
  date: string;
  leads: number;
  views: number;
  call_clicks: number;
  whatsapp_clicks: number;
}

export interface TrendResponse {
  days: number;
  points: TrendPointRaw[];
}

export interface GeoResponse {
  total: number;
  unresolved: number;
  countries: { code: string; name: string; count: number }[];
  cities: { city: string; state: string | null; count: number }[];
}

/** One qualified lead's pivotable facts — the raw material behind the
 *  Analytics "Lead Explorer" (pick any field for X, any measure for Y). */
export interface AnalyticsDetailRow {
  date: string;
  createdAt: string;
  status: LeadStatus;
  method: "phone_call" | "whatsapp";
  interactionCount: number;
  country: string | null;
  city: string | null;
  state: string | null;
}

export interface AnalyticsDetailResponse {
  rows: AnalyticsDetailRow[];
}

export type LeadStatus = "new" | "viewed" | "contacted" | "completed" | "not_reachable";

/**
 * Matches utils/paginate.js's paginationEnvelope() shape exactly — page,
 * perPage, total and totalPages live under `meta`, not at the top level.
 */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface PlanOption {
  name: string; tier: string; price: number;
  priceMonthly: number; priceQuarterly: number | null; priceYearly: number | null;
  currency: string; inclusions: string[]; description: string | null;
  tagline: string | null; popular: boolean;
  limits: { templeListings: number; serviceListings: number; photos: number };
}

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded" | "cancelled";

export interface PaymentRow {
  id: string;
  plan_id: string;
  plan_name_snapshot: string | null;
  billing_cycle: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  gateway: string;
  gateway_payment_id: string | null;
  invoice_number: string | null;
  failure_code: string | null;
  failure_description: string | null;
  paid_at: string | null;
  created_at: string;
  refund_amount: string | null;
  refunded_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
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

  /** Day-by-day leads + views, zero-filled, for the trend charts. */
  trend: (days: 7 | 30 | 90) => api.get<TrendResponse>(`/me/leads/trend?days=${days}`),

  /** Country (from verified phone) + city (from profile) breakdown of qualified leads. */
  geo: (period: string) => {
    const qs = period && period !== "all" ? `?period=${period}` : "";
    return api.get<GeoResponse>(`/me/leads/geo${qs}`);
  },

  /** Row-level lead facts for the Analytics page's field-driven pivot charts. */
  analyticsDetail: (period: string) => {
    const qs = period && period !== "all" ? `?period=${period}` : "";
    return api.get<AnalyticsDetailResponse>(`/me/analytics/detail${qs}`);
  },

  plans: () => api.get<PlanOption[]>("/plans"),

  /**
   * Only the plan identifier and cycle go over the wire. Price, currency and
   * the allowed transition are all resolved server-side from the plan
   * catalogue — a tampered price in this body has no effect on what Razorpay
   * is asked to charge.
   */
  subscribe: (slug: string, tier: string, billingCycle: string) =>
    api.post<{
      paymentId: string; orderId: string; amount: number; currency: string; keyId: string;
      isRenewal: boolean; expiresAt: string;
    }>(`/pandits/${slug}/subscribe`, { tier, billingCycle }),

  /** The pandit's own billing/payment history — own rows only. */
  payments: (params: { page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    const query = qs.toString();
    return api.get<Paginated<PaymentRow>>(`/me/payments${query ? `?${query}` : ""}`);
  },
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
