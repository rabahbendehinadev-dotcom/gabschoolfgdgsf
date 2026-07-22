import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import {
  User, GraduationCap, Activity, Smartphone, CreditCard,
  MapPin, Calendar, Clock, Shield, ShieldOff, CheckCircle2,
  XCircle, Globe, Eye
} from "lucide-react";

interface UserDetail {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  profileImage: string | null;
  accountType: string;
  subscriptionType: string;
  subscriptionExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  isActive: boolean;
  ipAddress: string | null;
  ipAddress2: string | null;
  ipCount: number;
  createdAt: string;
  pushPermission: string;
  pushSupported: boolean;
  courses: { playlistId: number; title: string; grantedAt: string | null }[];
  recentActivity: { id: number; action: string; details: string | null; videoTitle: string | null; createdAt: string }[];
  payments: { id: number; planType: string; planPrice: string; paymentMethod: string; status: string; createdAt: string }[];
  devices: { id: number; userAgent: string | null; lastSeenAt: string | null; failedAt: string | null; createdAt: string }[];
  recentVisits: { path: string | null; visitedAt: string; ip: string | null }[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  return `منذ ${months} شهر`;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    video_view: "مشاهدة فيديو",
    login: "تسجيل دخول",
    logout: "تسجيل خروج",
    profile_update: "تحديث الملف",
    subscription_update: "تحديث الاشتراك",
    password_change: "تغيير كلمة المرور",
    user_blocked: "حظر المستخدم",
    user_unblocked: "رفع الحظر",
    drive_revoke: "إلغاء صلاحيات Drive",
  };
  return map[action] ?? action;
}

function parseUA(ua: string | null) {
  if (!ua) return "جهاز غير معروف";
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "Mac";
  return "جهاز";
}

interface Props {
  userId: number | null;
  onClose: () => void;
  getAdminAuthHeaders: () => { headers?: Record<string, string> } | undefined;
}

export function UserDetailModal({ userId, onClose, getAdminAuthHeaders }: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setDetail(null); return; }
    setLoading(true);
    setError(null);
    const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
    fetch(`/api/admin/users/${userId}/detail`, { headers })
      .then(r => r.ok ? r.json() : r.json().then((e: { message: string }) => Promise.reject(e.message)))
      .then(setDetail)
      .catch((e: unknown) => setError(typeof e === "string" ? e : "فشل تحميل البيانات"))
      .finally(() => setLoading(false));
  }, [userId]);

  const now = new Date();
  const isExpired = detail?.subscriptionExpiresAt ? new Date(detail.subscriptionExpiresAt) < now : false;
  const isActiveVip = detail?.accountType === "vip" && !isExpired;

  return (
    <Dialog open={!!userId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            {loading ? "جاري التحميل..." : detail ? `${detail.username} — تفاصيل الحساب` : "تفاصيل المستخدم"}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-destructive text-sm">{error}</div>
        )}

        {!loading && !error && detail && (
          <Tabs defaultValue="info" dir="rtl">
            <TabsList className="w-full grid grid-cols-5 mb-4">
              <TabsTrigger value="info" className="text-xs gap-1"><User className="w-3 h-3" />معلومات</TabsTrigger>
              <TabsTrigger value="courses" className="text-xs gap-1"><GraduationCap className="w-3 h-3" />الدورات</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs gap-1"><Activity className="w-3 h-3" />النشاط</TabsTrigger>
              <TabsTrigger value="devices" className="text-xs gap-1"><Smartphone className="w-3 h-3" />الأجهزة</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs gap-1"><CreditCard className="w-3 h-3" />المدفوعات</TabsTrigger>
            </TabsList>

            {/* INFO TAB */}
            <TabsContent value="info" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <InfoCard label="اسم المستخدم" value={detail.username} icon={<User className="w-3.5 h-3.5" />} />
                <InfoCard label="الاسم الكامل" value={detail.fullName ?? "—"} icon={<User className="w-3.5 h-3.5" />} />
                <InfoCard label="البريد الإلكتروني" value={detail.email} icon={<Globe className="w-3.5 h-3.5" />} mono />
                <InfoCard label="الهاتف" value={detail.phone ?? "—"} icon={<Smartphone className="w-3.5 h-3.5" />} mono />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                <p className="text-xs text-muted-foreground font-medium mb-3">الاشتراك</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">نوع الحساب</span>
                  <Badge variant={isActiveVip ? "vip" : "secondary"}>
                    {detail.accountType === "vip" ? "VIP" : "عادي"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">الخطة</span>
                  <span className="text-sm font-medium">{detail.subscriptionType}</span>
                </div>
                {detail.subscriptionStartedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">بداية الاشتراك</span>
                    <span className="text-sm">{formatDate(detail.subscriptionStartedAt)}</span>
                  </div>
                )}
                {detail.subscriptionExpiresAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">انتهاء الاشتراك</span>
                    <span className={`text-sm font-medium ${isExpired ? "text-destructive" : "text-green-400"}`}>
                      {formatDate(detail.subscriptionExpiresAt)}
                      {isExpired ? " (منتهي)" : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">حالة الحساب</span>
                  {detail.isActive
                    ? <span className="flex items-center gap-1 text-sm text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />نشط</span>
                    : <span className="flex items-center gap-1 text-sm text-destructive"><XCircle className="w-3.5 h-3.5" />محظور</span>}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                <p className="text-xs text-muted-foreground font-medium mb-3">معلومات الجلسة</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">تاريخ التسجيل</span>
                  <span className="text-sm">{formatDate(detail.createdAt)}</span>
                </div>
                {detail.ipAddress && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />IP الأساسي</span>
                    <span className="text-sm font-mono">{detail.ipAddress}</span>
                  </div>
                )}
                {detail.ipAddress2 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />IP الثاني</span>
                    <span className="text-sm font-mono">{detail.ipAddress2}</span>
                  </div>
                )}
              </div>

              {detail.recentVisits.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />آخر الزيارات
                  </p>
                  <div className="space-y-1.5">
                    {detail.recentVisits.slice(0, 5).map((v, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-muted-foreground truncate">{v.path ?? "/"}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(v.visitedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* COURSES TAB */}
            <TabsContent value="courses" className="mt-0">
              {detail.courses.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  لم يُشترك في أي دورة بعد
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.courses.map(c => (
                    <div key={c.playlistId} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                          <GraduationCap className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{c.title}</p>
                          {c.grantedAt && (
                            <p className="text-xs text-muted-foreground">تم المنح: {formatDate(c.grantedAt)}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-green-500/15 text-green-400 border-0 text-xs">مشترك</Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ACTIVITY TAB */}
            <TabsContent value="activity" className="mt-0">
              {detail.recentActivity.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  لا يوجد سجل نشاط
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detail.recentActivity.map(a => (
                    <div key={a.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{actionLabel(a.action)}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(a.createdAt)}</span>
                        </div>
                        {(a.details || a.videoTitle) && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.videoTitle ?? a.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* DEVICES TAB */}
            <TabsContent value="devices" className="mt-0">
              {detail.devices.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  لا توجد أجهزة مسجّلة
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.devices.map(d => (
                    <div key={d.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.failedAt ? "bg-red-500/15" : "bg-green-500/15"}`}>
                          <Smartphone className={`w-4 h-4 ${d.failedAt ? "text-red-400" : "text-green-400"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{parseUA(d.userAgent)}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.lastSeenAt ? `آخر ظهور: ${timeAgo(d.lastSeenAt)}` : `مسجّل: ${formatDate(d.createdAt)}`}
                          </p>
                        </div>
                      </div>
                      <Badge className={`border-0 text-xs ${d.failedAt ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                        {d.failedAt ? "معطّل" : "فعّال"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* PAYMENTS TAB */}
            <TabsContent value="payments" className="mt-0">
              {detail.payments.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  لا يوجد سجل مدفوعات
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.payments.map(p => (
                    <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{p.planType} — {p.planPrice}</span>
                        <Badge className={`border-0 text-xs ${
                          p.status === "approved" ? "bg-green-500/15 text-green-400" :
                          p.status === "pending" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        }`}>
                          {p.status === "approved" ? "موافق عليه" : p.status === "pending" ? "قيد المراجعة" : "مرفوض"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{p.paymentMethod}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(p.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoCard({ label, value, icon, mono }: { label: string; value: string; icon: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}{label}
      </div>
      <p className={`text-sm font-medium truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
