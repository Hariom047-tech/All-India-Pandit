import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api, setToken as setApiToken } from "./api";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "devotee" | "temple_admin" | "pandit";
  phone: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("panditconnect_token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Set the token on the API client
    setApiToken(token);

    api.get<User>("/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        // Token invalid or expired
        setToken(null);
        localStorage.removeItem("panditconnect_token");
        setApiToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("panditconnect_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setApiToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("panditconnect_token");
    setToken(null);
    setUser(null);
    setApiToken(null);
    api.post("/auth/logout", {}).catch(() => {});
  };

  const updateUser = (u: User) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
