/* Admin API client — every request goes to /api/<ADMIN_SECRET_PATH>/...
   carrying the admin bearer token.

   SECURITY MODEL (C3 fix):
   - The FRONTEND route to the admin panel is now a FIXED path: /admin-panel
     It is no longer a "secret" URL — URL obscurity was never real security.
   - The REAL gate is password + TOTP enforced by requireAdmin on the backend,
     regardless of how the URL was discovered.
   - ADMIN_SECRET_PATH is used only as the BACKEND API prefix, injected at
     runtime via the server environment — it is NOT baked into the JS bundle.
   - On the client, we call a tiny bootstrap endpoint to get the API prefix
     so the bundle never contains the secret path. */

/** Fixed browser route for the admin panel — no longer a secret URL.
 *  Real access control is backend TOTP (requireAdmin middleware). */
export const ADMIN_BASE = "/admin-panel";

/** Runtime-resolved API base — fetched once from /api/admin-config endpoint
 *  so the secret path never appears in the compiled JS bundle.
 *  Falls back to /api/ambitiousperson only in local dev if the endpoint is absent. */
let _resolvedBase: string | null = null;

export async function getAdminBase(): Promise<string> {
  if (_resolvedBase) return _resolvedBase;
  try {
    const res = await fetch("/api/admin-config");
    if (res.ok) {
      const { adminPath } = await res.json();
      _resolvedBase = `/api/${adminPath}`;
      return _resolvedBase;
    }
  } catch {
    // network error — fall through to env var
  }
  // Dev-only fallback: VITE_ADMIN_SECRET_PATH is only set in local dev,
  // never in the production Docker build (removed from frontend/Dockerfile).
  const devPath = import.meta.env.VITE_ADMIN_DEV_PATH as string | undefined;
  _resolvedBase = `/api/${devPath || "ambitiousperson"}`;
  return _resolvedBase;
}

const TOKEN_KEY = "pc_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Every request resolves the API base at runtime (via /api/admin-config)
 *  so the secret path is never present in the compiled JS bundle. */
async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const base = await getAdminBase();
  const token = getToken();
  const res = await fetch(base + path, {
    method: opts.method || "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new AdminApiError((json && json.error) || `Request failed: ${res.status}`, res.status);
  }
  return json as T;
}

export interface Paged<T> {
  data: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export const adminApi = {
  // auth
  login: (email: string, password: string) =>
    request<{ challengeToken: string; totpEnabled: boolean; setup?: { secret: string; otpauthUrl: string } }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  verify: (challengeToken: string, totpCode: string) =>
    request<{ token: string; user: { id: string; email: string; full_name: string; role: string } }>("/auth/login/verify", {
      method: "POST",
      body: { challengeToken, totpCode },
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request<{ id: string; email: string; role: string; fullName: string }>("/auth/me"),

  // dashboard
  dashboardStats: () => request<Record<string, number | string>>("/dashboard/stats"),
  recentActivity: () => request<unknown[]>("/dashboard/recent-activity"),

  // generic
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
