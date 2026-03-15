import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Input } from "@/components/ui";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ActivityLogEntry = {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  user_registered: { label: "تسجيل جديد", color: "bg-green-500/20 text-green-400" },
  user_login: { label: "تسجيل دخول", color: "bg-blue-500/20 text-blue-400" },
  user_blocked: { label: "حظر مستخدم", color: "bg-red-500/20 text-red-400" },
  user_unblocked: { label: "رفع حظر", color: "bg-yellow-500/20 text-yellow-400" },
  user_deleted: { label: "حذف مستخدم", color: "bg-red-700/30 text-red-300" },
  subscription_deleted: { label: "إلغاء اشتراك", color: "bg-orange-500/20 text-orange-400" },
  subscription_changed: { label: "تغيير اشتراك", color: "bg-purple-500/20 text-purple-400" },
  ip_reset: { label: "تصفير IP", color: "bg-cyan-500/20 text-cyan-400" },
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-DZ", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminActivityLog() {
  const { getAdminAuthHeaders } = useAuth();
  const [search, setSearch] = useState("");

  const headers = getAdminAuthHeaders()?.headers || {};

  const { data: logs, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ["admin-activity-logs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/activity-logs?limit=200`, {
        headers: headers as HeadersInit,
      });
      if (!res.ok) throw new Error("فشل تحميل السجلات");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const filtered = logs?.filter(l =>
    (l.username ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.action ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.details ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.ipAddress ?? "").includes(search)
  );

  const getActionBadge = (action: string) => {
    const meta = ACTION_LABELS[action];
    if (meta) {
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/10 text-white/70">{action}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">سجل النشاطات</h1>
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم، الحدث، التفاصيل..."
            className="pl-4 pr-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs text-muted-foreground bg-white/5 border-b border-white/10 uppercase">
              <tr>
                <th className="px-4 py-4">التاريخ والوقت</th>
                <th className="px-4 py-4">المستخدم</th>
                <th className="px-4 py-4">الحدث</th>
                <th className="px-4 py-4">التفاصيل</th>
                <th className="px-4 py-4 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">جارٍ التحميل...</td>
                </tr>
              )}
              {filtered?.map(log => (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {log.username ? (
                      <span className="font-medium">{log.username}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getActionBadge(log.action)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                    {log.details || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-left text-muted-foreground">
                    {log.ipAddress || "—"}
                  </td>
                </tr>
              ))}
              {!isLoading && filtered?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد نتائج
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
