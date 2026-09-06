import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

export interface SecurityUser {
  id: number;
  username: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  isActive: boolean;
  securityBlockedAt: string | null;
  devices: SecurityDevice[];
}

export interface SecurityDevice {
  id: number;
  userId: number;
  category: "PHONE" | "COMPUTER";
  status: "TRUSTED" | "BLOCKED" | "REVOKED";
  os: string | null;
  browser: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastIp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  createdBy: string | null;
  revokedAt: string | null;
}

export interface SecurityEvent {
  id: number;
  deviceId: number | null;
  eventType: string;
  outcome: string;
  ipAddress: string | null;
  riskScore: number | null;
  riskReasons: string[] | null;
  reputation: {
    status?: string;
    confidence?: number;
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    datacenter?: boolean;
    anonymous?: boolean;
    abusive?: boolean;
  } | null;
  country: string | null;
  region: string | null;
  city: string | null;
  distanceKm: number | null;
  elapsedSeconds: number | null;
  adminId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DeviceAlertStat {
  deviceId: number;
  attemptCount: number;
  lastAttemptAt: string;
}

export interface SecuritySummary {
  trustedPhoneCount: number;
  trustedComputerCount: number;
  blockedAttemptCount: number;
  distinctPhoneAttempts: number;
  distinctComputerAttempts: number;
  distinctReplacementAttempts: number;
  rejectedChanges24h: number;
  rejectedChanges7d: number;
  distinctLocations: string[];
  latestAlertAt: string | null;
  frequentDeviceChanges: boolean;
  sharingRisk: "LOW" | "MEDIUM" | "HIGH";
}

export interface SecurityWhitelist {
  id: number;
  userId: number | null;
  ipAddress: string | null;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SecuritySession {
  id: string;
  deviceId: number;
  ipAddress: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface SecurityUserDetails {
  user: Omit<SecurityUser, "devices">;
  devices: SecurityDevice[];
  deviceAlertStats: DeviceAlertStat[];
  securitySummary: SecuritySummary;
  events: SecurityEvent[];
  whitelists: SecurityWhitelist[];
  sessions: SecuritySession[];
}

export type SecurityUserFilter = "all" | "blocked_user" | "blocked_device" | "clean" | "phone" | "computer" | "two_devices" | "no_devices";

export interface SecurityUsersResponse {
  users: SecurityUser[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function useSecurityUsers(params: { page: number; pageSize: number; search: string; filter: SecurityUserFilter }) {
  const { getAdminAuthHeaders } = useAuth();
  return useQuery({
    queryKey: ["admin-security-users", params],
    queryFn: async () => {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
        filter: params.filter,
      });
      if (params.search.trim()) query.set("search", params.search.trim());
      const res = await fetch(`/api/admin/security/users?${query}`, getAdminAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch users");
      return (await res.json()) as SecurityUsersResponse;
    },
    placeholderData: previous => previous,
  });
}

export function useSecurityUserDetails(userId: number | null) {
  const { getAdminAuthHeaders } = useAuth();
  return useQuery({
    queryKey: ["admin-security-user", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch(`/api/admin/security/users/${userId}`, getAdminAuthHeaders());
      if (!res.ok) throw new Error("Failed to fetch user details");
      return (await res.json()) as SecurityUserDetails;
    },
    enabled: !!userId,
  });
}

export function useRevokeDevice() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, deviceId, reason, expectedStatus = "TRUSTED" }: { userId: number; deviceId: number; reason?: string; expectedStatus?: "TRUSTED" | "BLOCKED" }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/devices/${deviceId}/revoke`, {
        ...getAdminAuthHeaders(),
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason, expectedStatus }),
      });
      if (!res.ok) throw new Error("Failed to revoke device");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-security-users"] });
    }
  });
}

export function useResetDeviceCategory() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, category, reason }: { userId: number; category: "PHONE" | "COMPUTER"; reason?: string }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/devices/reset/${category}`, {
        ...getAdminAuthHeaders(),
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to reset devices");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-security-users"] });
    }
  });
}

export function useApproveDevice() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, deviceId, reason }: { userId: number; deviceId: number; reason?: string }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/devices/${deviceId}/approve`, {
        ...getAdminAuthHeaders(),
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to approve device");
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-security-users"] });
    }
  });
}

export function useIgnoreDeviceAlert() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, deviceId, reason }: { userId: number; deviceId: number; reason?: string }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/devices/${deviceId}/ignore`, {
        ...getAdminAuthHeaders(),
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to ignore device alert");
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-security-users"] });
    },
  });
}

export function useBlockUserSecurity() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: number; reason?: string }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/block`, {
        ...getAdminAuthHeaders(),
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to block user");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-security-users"] });
    }
  });
}

export function useUnblockUserSecurity() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/unblock`, {
        ...getAdminAuthHeaders(),
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to unblock user");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-security-users"] });
    }
  });
}

export function useAddWhitelist() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ipAddress, userWide, reason }: { userId: number; ipAddress?: string; userWide?: boolean; reason?: string }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/whitelists`, {
        ...getAdminAuthHeaders(),
        method: "POST",
        headers: { ...getAdminAuthHeaders()?.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ipAddress, userWide, reason }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to add whitelist");
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
    }
  });
}

export function useRemoveWhitelist() {
  const { getAdminAuthHeaders } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, whitelistId }: { userId: number; whitelistId: number }) => {
      const res = await fetch(`/api/admin/security/users/${userId}/whitelists/${whitelistId}`, {
        ...getAdminAuthHeaders(),
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove whitelist");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-security-user", vars.userId] });
    }
  });
}
