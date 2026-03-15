import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Input } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Search, Trash2, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = "";

type SubUser = {
  id: number;
  username: string;
  email: string;
  accountType: string;
  subscriptionType: string;
  subscriptionExpiresAt: string | null;
  isActive: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
};

type FilterMode = "all" | "expired" | "expiring";

export function AdminSubscriptions() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const headers = getAdminAuthHeaders()?.headers || {};

  const { data: users, refetch } = useQuery<SubUser[]>({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/subscriptions`, { headers: headers as HeadersInit });
      if (!res.ok) throw new Error("فشل تحميل الاشتراكات");
      return res.json();
    },
  });

  const filtered = users?.filter(u => {
    const matchesSearch =
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "expired") return u.isExpired;
    if (filter === "expiring") return u.isExpiringSoon;
    return true;
  });

  const expired = users?.filter(u => u.isExpired).length ?? 0;
  const expiringSoon = users?.filter(u => u.isExpiringSoon).length ?? 0;

  const handleDeleteSub = async (user: SubUser) => {
    if (!confirm(`هل أنت متأكد من حذف اشتراك ${user.username} وإعادته للنسخة التجريبية؟`)) return;
    setLoadingId(user.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/subscription`, {
        method: "DELETE",
        headers: headers as HeadersInit,
      });
      if (!res.ok) throw new Error("فشل الطلب");
      toast({ title: "تم إلغاء الاشتراك وإعادة المستخدم للنسخة التجريبية" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  };

  const subBadge = (type: string) => {
    if (type === "lifetime") return <Badge className="bg-purple-500/20 text-purple-400 border-0">مدى الحياة</Badge>;
    if (type === "annual") return <Badge className="bg-blue-500/20 text-blue-400 border-0">سنوي</Badge>;
    return <Badge variant="secondary">تجريبي</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">إدارة الاشتراكات</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-white/5 flex items-center gap-3">
          <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
          <div>
            <p className="text-2xl font-bold">{users?.length ?? "—"}</p>
            <p className="text-sm text-muted-foreground">إجمالي المستخدمين</p>
          </div>
        </Card>
        <Card className="p-4 border-white/5 flex items-center gap-3">
          <Clock className="w-8 h-8 text-yellow-400 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-yellow-400">{expiringSoon}</p>
            <p className="text-sm text-muted-foreground">تنتهي خلال 7 أيام</p>
          </div>
        </Card>
        <Card className="p-4 border-white/5 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-400 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-red-400">{expired}</p>
            <p className="text-sm text-muted-foreground">اشتراكات منتهية</p>
          </div>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الإيميل..." className="pl-4 pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {(["all", "expired", "expiring"] as FilterMode[]).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "الكل" : f === "expired" ? "منتهية" : "تنتهي قريبًا"}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs text-muted-foreground bg-white/5 border-b border-white/10 uppercase">
              <tr>
                <th className="px-4 py-4">المستخدم</th>
                <th className="px-4 py-4">نوع الحساب</th>
                <th className="px-4 py-4">خطة الاشتراك</th>
                <th className="px-4 py-4">تاريخ الانتهاء</th>
                <th className="px-4 py-4">الحالة</th>
                <th className="px-4 py-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map(user => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-4">
                    <div className="font-bold">{user.username}</div>
                    <div className="text-muted-foreground text-xs">{user.email}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={user.accountType === "vip" ? "vip" : "secondary"}>{user.accountType}</Badge>
                  </td>
                  <td className="px-4 py-4">{subBadge(user.subscriptionType)}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {user.subscriptionExpiresAt ? (
                      <span className={user.isExpired ? "text-red-400" : user.isExpiringSoon ? "text-yellow-400" : ""}>
                        {formatDate(user.subscriptionExpiresAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {user.isExpired ? (
                      <Badge variant="destructive">منتهية</Badge>
                    ) : user.isExpiringSoon ? (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-0">تنتهي قريبًا</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 border-0">نشطة</Badge>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="حذف الاشتراك"
                      onClick={() => handleDeleteSub(user)}
                      disabled={loadingId === user.id}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
