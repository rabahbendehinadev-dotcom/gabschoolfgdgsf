import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import {
  User, GraduationCap, Activity, Smartphone, CreditCard,
  MapPin, Calendar, CheckCircle2, XCircle, Globe, Eye,
  Crown, BellRing, BellOff,
} from "lucide-react";

interface UserDetail {
  id: number; username: string; email: string; phone: string | null; fullName: string | null;
  profileImage: string | null; accountType: string; subscriptionType: string;
  subscriptionExpiresAt: string | null; subscriptionStartedAt: string | null;
  isActive: boolean; ipAddress: string | null; ipAddress2: string | null; ipCount: number;
  createdAt: string; pushPermission: string; pushSupported: boolean;
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
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return `منذ ${Math.floor(days / 30)} شهر`;
}

const ACTION_LABELS: Record<string, string> = {
  video_view: "مشاهدة فيديو", login: "تسجيل دخول", logout: "تسجيل خروج",
  profile_update: "تحديث الملف", subscription_update: "تحديث الاشتراك",
  password_change: "تغيير كلمة المرور", user_blocked: "حظر", user_unblocked: "رفع الحظر",
};

function parseUA(ua: string | null) {
  if (!ua) return "جهاز";
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
    setLoading(true); setError(null);
    const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
    fetch(`/api/admin/users/${userId}/detail`, { headers })
      .then(r => r.ok ? r.json() : r.json().then((e: { message: string }) => Promise.reject(e.message)))
      .then(setDetail)
      .catch((e: unknown) => setError(typeof e === "string" ? e : "فشل التحميل"))
      .finally(() => setLoading(false));
  }, [userId]);

  const now = new Date();
  const isExpired = detail?.subscriptionExpiresAt ? new Date(detail.subscriptionExpiresAt) < now : false;
  const isActiveVip = detail?.accountType === "vip" && !isExpired;

  return (
    <Dialog open={!!userId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-gray-900">
            <User className="w-4 h-4 text-orange-500" />
            {loading ? "جاري التحميل..." : detail ? `${detail.username}` : "تفاصيل المستخدم"}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-4">
            {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        )}

        {error && <div className="py-8 text-center text-red-500 text-sm">{error}</div>}

        {!loading && !error && detail && (
          <Tabs defaultValue="info" dir="rtl">
            <TabsList className="w-full grid grid-cols-5 mb-4 bg-gray-100 p-1 rounded-lg">
              {[
                { v: "info",     label: "معلومات",   icon: <User className="w-3 h-3" /> },
                { v: "courses",  label: "الدورات",   icon: <GraduationCap className="w-3 h-3" /> },
                { v: "activity", label: "النشاط",    icon: <Activity className="w-3 h-3" /> },
                { v: "devices",  label: "الأجهزة",   icon: <Smartphone className="w-3 h-3" /> },
                { v: "payments", label: "المدفوعات", icon: <CreditCard className="w-3 h-3" /> },
              ].map(t => (
                <TabsTrigger key={t.v} value={t.v} className="flex items-center gap-1 text-xs data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm rounded-md">
                  {t.icon}{t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* INFO TAB */}
            <TabsContent value="info" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="اسم المستخدم" value={detail.username} />
                <InfoRow label="الاسم الكامل" value={detail.fullName ?? "—"} />
                <InfoRow label="البريد" value={detail.email} mono />
                <InfoRow label="الهاتف" value={detail.phone ?? "—"} mono />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">الاشتراك</p>
                <Row label="نوع الحساب">
                  {isActiveVip
                    ? <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Crown className="w-3 h-3" />VIP</span>
                    : <span className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">عادي</span>}
                </Row>
                <Row label="الخطة"><span className="text-sm text-gray-700">{detail.subscriptionType}</span></Row>
                {detail.subscriptionStartedAt && <Row label="بداية الاشتراك"><span className="text-sm text-gray-700">{formatDate(detail.subscriptionStartedAt)}</span></Row>}
                {detail.subscriptionExpiresAt && (
                  <Row label="انتهاء الاشتراك">
                    <span className={`text-sm font-medium ${isExpired ? "text-red-600" : "text-green-700"}`}>
                      {formatDate(detail.subscriptionExpiresAt)}{isExpired ? " (منتهي)" : ""}
                    </span>
                  </Row>
                )}
                <Row label="الحالة">
                  {detail.isActive
                    ? <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3.5 h-3.5" />نشط</span>
                    : <span className="flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3.5 h-3.5" />محظور</span>}
                </Row>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">الجلسة والأجهزة</p>
                <Row label="تاريخ التسجيل"><span className="text-sm text-gray-700">{formatDate(detail.createdAt)}</span></Row>
                {detail.ipAddress && <Row label={<span className="flex items-center gap-1"><MapPin className="w-3 h-3" />IP الأساسي</span>}><span className="text-sm font-mono text-gray-700">{detail.ipAddress}</span></Row>}
                {detail.ipAddress2 && <Row label={<span className="flex items-center gap-1"><MapPin className="w-3 h-3" />IP الثاني</span>}><span className="text-sm font-mono text-gray-700">{detail.ipAddress2}</span></Row>}
              </div>

              {detail.recentVisits.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />آخر الزيارات
                  </p>
                  <div className="space-y-1.5">
                    {detail.recentVisits.slice(0, 5).map((v, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-gray-500 truncate">{v.path ?? "/"}</span>
                        <span className="text-xs text-gray-400 shrink-0">{timeAgo(v.visitedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* COURSES TAB */}
            <TabsContent value="courses" className="mt-0">
              {detail.courses.length === 0 ? <EmptyTab icon={<GraduationCap />} label="لم يُشترك في أي دورة" /> : (
                <div className="space-y-2">
                  {detail.courses.map(c => (
                    <div key={c.playlistId} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
                          <GraduationCap className="w-4 h-4 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{c.title}</p>
                          {c.grantedAt && <p className="text-xs text-gray-400">تم المنح: {formatDate(c.grantedAt)}</p>}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">مشترك</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ACTIVITY TAB */}
            <TabsContent value="activity" className="mt-0">
              {detail.recentActivity.length === 0 ? <EmptyTab icon={<Activity />} label="لا يوجد سجل نشاط" /> : (
                <div className="space-y-1">
                  {detail.recentActivity.map(a => (
                    <div key={a.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900">{ACTION_LABELS[a.action] ?? a.action}</span>
                          <span className="text-xs text-gray-400 shrink-0">{timeAgo(a.createdAt)}</span>
                        </div>
                        {(a.details || a.videoTitle) && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{a.videoTitle ?? a.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* DEVICES TAB */}
            <TabsContent value="devices" className="mt-0">
              {detail.devices.length === 0 ? <EmptyTab icon={<Smartphone />} label="لا توجد أجهزة مسجّلة" /> : (
                <div className="space-y-2">
                  {detail.devices.map(d => (
                    <div key={d.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${d.failedAt ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"}`}>
                          <Smartphone className={`w-4 h-4 ${d.failedAt ? "text-red-500" : "text-green-600"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{parseUA(d.userAgent)}</p>
                          <p className="text-xs text-gray-400">
                            {d.lastSeenAt ? `آخر ظهور: ${timeAgo(d.lastSeenAt)}` : `مسجّل: ${formatDate(d.createdAt)}`}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${d.failedAt ? "bg-red-50 text-red-600 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                        {d.failedAt ? "معطّل" : "فعّال"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* PAYMENTS TAB */}
            <TabsContent value="payments" className="mt-0">
              {detail.payments.length === 0 ? <EmptyTab icon={<CreditCard />} label="لا يوجد سجل مدفوعات" /> : (
                <div className="space-y-2">
                  {detail.payments.map(p => (
                    <div key={p.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">{p.planType} — {p.planPrice}</span>
                        <PayBadge status={p.status} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-medium text-gray-900 truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function EmptyTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="py-10 text-center text-gray-400">
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2">
        {icon}
      </div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

function PayBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">موافق عليه</span>;
  if (status === "pending")  return <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">قيد المراجعة</span>;
  return <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">مرفوض</span>;
}
