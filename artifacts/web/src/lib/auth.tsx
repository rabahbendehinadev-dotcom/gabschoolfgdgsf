import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserProfile, AdminAuthResponseAdmin } from "@workspace/api-client-react/src/generated/api.schemas";
import { useLocation } from "wouter";

type AuthState = {
  token: string | null;
  user: UserProfile | null;
  adminToken: string | null;
  admin: AdminAuthResponseAdmin | null;
  bootstrapped: boolean;
  setAuth: (token: string, user: UserProfile) => void;
  updateUser: (user: UserProfile) => void;
  setAdminAuth: (token: string, admin: AdminAuthResponseAdmin) => void;
  logout: () => void;
  adminLogout: () => void;
  getAuthHeaders: () => { headers: { Authorization: string } } | undefined;
  getAdminAuthHeaders: () => { headers: { Authorization: string } } | undefined;
};

const AuthContext = createContext<AuthState | null>(null);

const REFRESH_INTERVAL_MS = 20_000;
const RESUME_DEDUP_MS = 1_500;

export function hasActiveCommunityAccess(user: UserProfile | null | undefined): boolean {
  if (!user?.isActive) return false;
  if (user.communityRole === "admin") return true;
  const expiresAt = user.subscriptionExpiresAt
    ? new Date(user.subscriptionExpiresAt)
    : null;
  if (expiresAt && expiresAt < new Date()) return false;
  const activeVip = user.accountType === "vip" && !user.subscriptionIsExpired;
  return activeVip || user.subscriptionType !== "demo";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
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

  // True once the current user's profile has been confirmed against the server
  // (or there is no session). The phone gate waits for this so a stale cached
  // user object never triggers a false redirect for existing users.
  const [bootstrapped, setBootstrapped] = useState(false);

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  const resumeRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastResumeRefreshAtRef = useRef(0);

  const adminTokenRef = useRef(adminToken);
  useEffect(() => { adminTokenRef.current = adminToken; }, [adminToken]);

  const refreshUser = useCallback(async () => {
    const currentToken = tokenRef.current;
    if (!currentToken) return false;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setTokenState(null);
        setUser(null);
        setBootstrapped(true);
        return false;
      }
      if (!res.ok) {
        // Non-401 failure (e.g. transient 403/5xx): keep the cached profile but
        // still mark bootstrap complete so the app/phone-gate never hangs.
        setBootstrapped(true);
        return false;
      }
      const fresh: UserProfile = await res.json();
      setUser(prev => {
        const changed =
          prev?.accountType !== fresh.accountType ||
          prev?.subscriptionType !== fresh.subscriptionType ||
          prev?.isActive !== fresh.isActive ||
          prev?.subscriptionExpiresAt !== fresh.subscriptionExpiresAt ||
          prev?.subscriptionIsExpired !== fresh.subscriptionIsExpired ||
          prev?.communityRole !== fresh.communityRole ||
          prev?.phone !== fresh.phone;
        if (!changed) return prev;
        localStorage.setItem("user", JSON.stringify(fresh));
        return fresh;
      });
      setBootstrapped(true);
      return true;
    } catch {
      // Network error: don't trap the app in a perpetual loading state.
      setBootstrapped(true);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setBootstrapped(true);
      return;
    }

    refreshUser();
    const timer = setInterval(refreshUser, REFRESH_INTERVAL_MS);

    const refreshAfterResume = () => {
      const now = Date.now();
      if (
        resumeRefreshInFlightRef.current ||
        now - lastResumeRefreshAtRef.current < RESUME_DEDUP_MS
      ) {
        return;
      }

      lastResumeRefreshAtRef.current = now;
      const request = (async () => {
        const sessionIsValid = await refreshUser();
        if (!sessionIsValid) return;

        await queryClient.invalidateQueries({
          predicate: ({ queryKey }) => {
            const root = queryKey[0];
            return (
              typeof root === "string" &&
              (root.startsWith("/api/videos") || root.startsWith("/api/playlists"))
            );
          },
          refetchType: "active",
        });
      })().finally(() => {
        resumeRefreshInFlightRef.current = null;
      });

      resumeRefreshInFlightRef.current = request;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshAfterResume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", refreshAfterResume);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", refreshAfterResume);
    };
  }, [token, refreshUser, queryClient]);

  // Validates the admin JWT against the server on mount and periodically.
  // Clears state and redirects to admin login when the token is expired/invalid.
  const refreshAdmin = useCallback(async () => {
    const currentAdminToken = adminTokenRef.current;
    if (!currentAdminToken) return;
    try {
      const res = await fetch("/api/auth/admin-me", {
        headers: { Authorization: `Bearer ${currentAdminToken}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("admin");
        setAdminTokenState(null);
        setAdmin(null);
        navigate("/bendehinaonline97/login");
      }
    } catch {
      // Network error — keep state, will retry next interval
    }
  }, [navigate]);

  // Validate admin token on mount and every 5 minutes
  useEffect(() => {
    if (!adminToken) return;
    refreshAdmin();
    const timer = setInterval(refreshAdmin, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [adminToken, refreshAdmin]);

  const setAuth = (newToken: string, newUser: UserProfile) => {
    // Drop any cached per-user data (notifications, unread count, feed, etc.) from
    // a previous session so one account never momentarily sees another's data on
    // the same device before refetch completes.
    queryClient.clear();
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setTokenState(newToken);
    setUser(newUser);
  };

  const updateUser = (newUser: UserProfile) => {
    localStorage.setItem("user", JSON.stringify(newUser));
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
    // Clear cached per-user data so the next account starts clean.
    queryClient.clear();
    navigate("/login");
  };

  const adminLogout = () => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      fetch("/api/auth/admin-logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("adminToken");
    localStorage.removeItem("admin");
    setAdminTokenState(null);
    setAdmin(null);
    navigate("/bendehinaonline97/login");
  };

  const getAuthHeaders = () => {
    return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
  };

  const getAdminAuthHeaders = () => {
    return adminToken ? { headers: { Authorization: `Bearer ${adminToken}` } } : undefined;
  };

  return (
    <AuthContext.Provider value={{
      token, user, adminToken, admin, bootstrapped,
      setAuth, updateUser, setAdminAuth, logout, adminLogout, getAuthHeaders, getAdminAuthHeaders
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
