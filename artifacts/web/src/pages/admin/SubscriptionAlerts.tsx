import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Trash2, RefreshCw, Loader2, ShieldX, ShieldCheck, Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const API_BASE = "";

interface ExpiredUser {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  subscriptionType: string;
  subscriptionExpiresAt: string;
  driveRevokedAt: string | null;
}

function normalizeWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "213" + digits.slice(1);
  if (!digits.startsWith("213") && digits.length <= 10) return "213" + digits;
  return digits;
}

const SUBSCRIPTION_LABELS: Record<string, string> = {
  monthly: "شهري",
  annual: "سنوي",
  lifetime: "مدى الحياة",
  demo: "تجريبي",
};

export function AdminSubscriptionAlerts() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showOnlyPending, setShowOnlyPending] = useState(true);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const authHeaders = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  const { data: users = [], isLoading, refetch } = useQuery<ExpiredUser[]>({
    queryKey: ["admin-expired-users"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/expired`, {
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("فشل تحميل البيانات");
      return res.json();
    },
  });

  const revokeOneMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/revoke-drive`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("فشل الإزالة");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: "تم بنجاح", description: "تم تسجيل إزالة صلاحية Google Drive" });
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
    onSettled: () => setRevokingId(null),
  });

  const revokeAllMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/revoke-drive-all`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("فشل الإزالة الجماعية");
      return res.json() as Promise<{ revoked: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      setConfirmRevokeAll(false);
      toast({
        title: "تمت الإزالة الجماعية",
        description: `تم تسجيل إزالة ${data.revoked} مستخدم من Google Drive`,
      });
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const displayed = showOnlyPending ? users.filter(u => !u.driveRevokedAt) : users;
  const pendingCount = users.filter(u => !u.driveRevokedAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">تنبيهات انتهاء الاشتراك</h1>
          {pendingCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 border-0 px-3 py-1 text-sm font-bold">
              {pendingCount} بانتظار الإزالة
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            title="تحديث"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          {pendingCount > 0 && (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => setConfirmRevokeAll(true)}
              disabled={revokeAllMut.isPending}
            >
              {revokeAllMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              إزالة الجميع ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          هؤلاء المستخدمون انتهت اشتراكاتهم وقد يظل بإمكانهم الوصول إلى روابط Google Drive المحفوظة.
          استخدم زر الإزالة لتسجيل معالجتهم.
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 w-fit">
        {([
          { v: true, label: `بانتظار الإزالة (${pendingCount})` },
          { v: false, label: `الكل (${users.length})` },
        ] as const).map(opt => (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => setShowOnlyPending(opt.v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              showOnlyPending === opt.v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>جاري التحميل...</span>
        </div>
      ) : displayed.length === 0 ? (
        <Card className="border-white/5">
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-400/60" />
            <p className="text-lg font-medium text-muted-foreground">
              {showOnlyPending ? "لا يوجد مستخدمون بانتظار الإزالة" : "لا يوجد مستخدمون منتهية اشتراكاتهم"}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="border-white/5 hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/2">
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">المستخدم</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">الهاتف</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">الاشتراك</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">تاريخ الانتهاء</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">حالة Drive</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {displayed.map(user => (
                    <tr key={user.id} className={`hover:bg-white/[0.02] transition-colors ${user.driveRevokedAt ? "opacity-50" : ""}`}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{user.username}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-4 py-4">
                        {user.phone ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono" dir="ltr">{user.phone}</span>
                            <a
                              href={`https://wa.me/${normalizeWhatsApp(user.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="واتساب"
                            >
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-500/15 hover:bg-green-500/30 text-green-400 border border-green-500/20 transition-all">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </span>
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge className="bg-white/10 text-foreground border-0 text-xs">
                          {SUBSCRIPTION_LABELS[user.subscriptionType] ?? user.subscriptionType}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-red-400">
                        {formatDate(user.subscriptionExpiresAt)}
                      </td>
                      <td className="px-4 py-4">
                        {user.driveRevokedAt ? (
                          <div className="flex flex-col gap-1">
                            <Badge className="bg-green-500/15 text-green-400 border-0 gap-1 w-fit">
                              <ShieldCheck className="w-3 h-3" /> تمت الإزالة
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{formatDate(user.driveRevokedAt)}</span>
                          </div>
                        ) : (
                          <Badge className="bg-red-500/15 text-red-400 border-0 gap-1">
                            <ShieldX className="w-3 h-3" /> لم تتم الإزالة
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {!user.driveRevokedAt && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5 text-xs"
                            disabled={revokingId === user.id}
                            onClick={() => {
                              setRevokingId(user.id);
                              revokeOneMut.mutate(user.id);
                            }}
                          >
                            {revokingId === user.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ShieldX className="w-3 h-3" />
                            )}
                            إزالة من Google Drive
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayed.map(user => (
              <Card key={user.id} className={`border-white/5 p-4 space-y-3 ${user.driveRevokedAt ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{user.username}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                  {user.driveRevokedAt ? (
                    <Badge className="bg-green-500/15 text-green-400 border-0 gap-1 shrink-0 text-xs">
                      <ShieldCheck className="w-3 h-3" /> تمت الإزالة
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/15 text-red-400 border-0 gap-1 shrink-0 text-xs">
                      <ShieldX className="w-3 h-3" /> لم تتم الإزالة
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
                  <Badge className="bg-white/10 text-foreground border-0 text-xs">
                    {SUBSCRIPTION_LABELS[user.subscriptionType] ?? user.subscriptionType}
                  </Badge>
                  <span className="text-red-400">انتهى: {formatDate(user.subscriptionExpiresAt)}</span>
                </div>

                {user.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-mono" dir="ltr">{user.phone}</span>
                    <a href={`https://wa.me/${normalizeWhatsApp(user.phone)}`} target="_blank" rel="noopener noreferrer">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-500/15 hover:bg-green-500/30 text-green-400 border border-green-500/20 transition-all">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  </div>
                )}

                {!user.driveRevokedAt && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full gap-2 text-xs"
                    disabled={revokingId === user.id}
                    onClick={() => {
                      setRevokingId(user.id);
                      revokeOneMut.mutate(user.id);
                    }}
                  >
                    {revokingId === user.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShieldX className="w-3 h-3" />
                    )}
                    إزالة من Google Drive
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Confirm revoke-all dialog */}
      <Dialog open={confirmRevokeAll} onOpenChange={setConfirmRevokeAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الإزالة الجماعية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              سيتم تسجيل إزالة صلاحيات Google Drive لـ{" "}
              <span className="font-bold text-foreground">{pendingCount} مستخدم</span>{" "}
              منتهي الاشتراك دفعة واحدة. سيُحفظ هذا الإجراء في سجل النشاطات.
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={() => revokeAllMut.mutate()}
                disabled={revokeAllMut.isPending}
              >
                {revokeAllMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                تأكيد الإزالة
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmRevokeAll(false)}
                disabled={revokeAllMut.isPending}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
