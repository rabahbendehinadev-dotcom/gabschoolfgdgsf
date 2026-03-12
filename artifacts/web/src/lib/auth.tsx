import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { UserProfile, AdminAuthResponseAdmin } from "@workspace/api-client-react/src/generated/api.schemas";
import { useLocation } from "wouter";

type AuthState = {
  token: string | null;
  user: UserProfile | null;
  adminToken: string | null;
  admin: AdminAuthResponseAdmin | null;
  setAuth: (token: string, user: UserProfile) => void;
  setAdminAuth: (token: string, admin: AdminAuthResponseAdmin) => void;
  logout: () => void;
  adminLogout: () => void;
  getAuthHeaders: () => { headers: { Authorization: string } } | undefined;
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined;
};

const AuthContext = createContext<AuthState | null>(null);

const REFRESH_INTERVAL_MS = 20_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("token"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const [adminToken, setAdminTokenState] = useState<string | null>(() => localStorage.getItem("adminToken"));
  const [admin, setAdmin] = useState<AdminAuthResponseAdmin | null>(() => {
    const saved = localStorage.getItem("admin");
    return saved ? JSON.parse(saved) : null;
  });

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const refreshUser = useCallback(async () => {
    const currentToken = tokenRef.current;
    if (!currentToken) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setTokenState(null);
        setUser(null);
        return;
      }
      if (!res.ok) return;
      const fresh: UserProfile = await res.json();
      setUser(prev => {
        const changed =
          prev?.accountType !== fresh.accountType ||
          prev?.subscriptionType !== fresh.subscriptionType ||
          prev?.isActive !== fresh.isActive ||
          prev?.subscriptionExpiresAt !== fresh.subscriptionExpiresAt;
        if (!changed) return prev;
        localStorage.setItem("user", JSON.stringify(fresh));
        return fresh;
      });
    } catch { }
  }, []);

  useEffect(() => {
    if (!token) return;

    refreshUser();
    const timer = setInterval(refreshUser, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshUser();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [token, refreshUser]);

  const setAuth = (newToken: string, newUser: UserProfile) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setTokenState(newToken);
    setUser(newUser);
  };

  const setAdminAuth = (newToken: string, newAdmin: AdminAuthResponseAdmin) => {
    localStorage.setItem("adminToken", newToken);
    localStorage.setItem("admin", JSON.stringify(newAdmin));
    setAdminTokenState(newToken);
    setAdmin(newAdmin);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setTokenState(null);
    setUser(null);
    navigate("/login");
  };

  const adminLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("admin");
    setAdminTokenState(null);
    setAdmin(null);
    navigate("/admin/login");
  };

  const getAuthHeaders = () => {
    return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
  };

  const getAdminAuthHeaders = () => {
    return adminToken ? { headers: { Authorization: `Bearer ${adminToken}` } } : undefined;
  };

  return (
    <AuthContext.Provider value={{
      token, user, adminToken, admin,
      setAuth, setAdminAuth, logout, adminLogout, getAuthHeaders, getAdminAuthHeaders
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
