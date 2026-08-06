import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, getToken, setToken } from "./adminApi";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
}

interface AdminAuthValue {
  user: AdminUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthCtx = createContext<AdminAuthValue>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function useAdminAuth() {
  return useContext(AdminAuthCtx);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await adminApi.me();
      setUser({ id: me.id, email: me.email, role: me.role, fullName: me.fullName });
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function logout() {
    try {
      await adminApi.logout();
    } catch {
      /* token may already be dead — clear locally regardless */
    }
    setToken(null);
    setUser(null);
  }

  return <AdminAuthCtx.Provider value={{ user, loading, refresh, logout }}>{children}</AdminAuthCtx.Provider>;
}
