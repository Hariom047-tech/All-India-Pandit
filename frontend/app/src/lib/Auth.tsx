import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { api, setToken as setApiToken } from "./api";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "devotee" | "temple_admin" | "pandit" | "admin" | "super_admin";
  phone: string | null;
  /** Mirrors users.status — a suspended/banned account can never make a qualified lead. */
  status?: "pending_verification" | "active" | "suspended" | "deactivated" | "banned";
  phone_verified?: boolean;
  email_verified?: boolean;
}

/**
 * What the devotee was trying to do before we interrupted them for login or
 * verification. Persisted through the login redirect so we can bring them
 * back to the exact profile and highlight the exact button.
 *
 * sessionStorage, not localStorage: an intent is meaningful for one browsing
 * session only, and it should not survive a browser restart days later.
 */
export interface ContactIntent {
  panditSlug: string;
  action: "phone_call" | "whatsapp";
  returnTo: string;
  createdAt: number;
}

const INTENT_KEY = "panditconnect_contact_intent";
const INTENT_TTL_MS = 30 * 60 * 1000;

export function saveContactIntent(intent: Omit<ContactIntent, "createdAt">) {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, createdAt: Date.now() }));
  } catch {
    /* private mode — the flow still works, we just lose the "return here" nicety */
  }
}

export function readContactIntent(): ContactIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as ContactIntent;
    if (!intent?.panditSlug || Date.now() - intent.createdAt > INTENT_TTL_MS) {
      sessionStorage.removeItem(INTENT_KEY);
      return null;
    }
    return intent;
  } catch {
    return null;
  }
}

export function clearContactIntent() {
  try { sessionStorage.removeItem(INTENT_KEY); } catch { /* ignore */ }
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** Convenience flags. NEVER an authorization decision — the backend re-checks all of this. */
  isAuthenticated: boolean;
  isPandit: boolean;
  isActive: boolean;
  /** Mobile verified — the gate for creating a qualified lead. */
  isContactVerified: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("panditconnect_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setApiToken(token);
    let cancelled = false;
    api.get<User>("/auth/me")
      .then((u) => { if (!cancelled) setUser(u); })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        localStorage.removeItem("panditconnect_token");
        setApiToken(null);
        setUser(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("panditconnect_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setApiToken(newToken);
  };

  const logout = () => {
    api.post("/auth/logout", {}).catch(() => {});
    localStorage.removeItem("panditconnect_token");
    clearContactIntent();
    setToken(null);
    setUser(null);
    setApiToken(null);
  };

  const refresh = async () => {
    if (!token) return;
    try { setUser(await api.get<User>("/auth/me")); } catch { /* keep last known state */ }
  };

  const value = useMemo<AuthContextType>(() => ({
    user,
    token,
    loading,
    isAuthenticated: Boolean(user),
    isPandit: user?.role === "pandit",
    // Undefined status means an older payload; treat it as active rather than
    // locking a legitimate user out of the UI. The backend is authoritative.
    isActive: !user ? false : user.status === undefined || user.status === "active" || user.status === "pending_verification",
    // Google sign-in users have email_verified=true but no phone — treat them
    // as contact-verified since Google already authenticated their identity.
    // Phone OTP users have phone_verified=true. Either is sufficient.
    isContactVerified: Boolean(user?.phone_verified || user?.email_verified),
    login, logout, updateUser: setUser, refresh,
  }), [user, token, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
