import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import {
  User, GraduationCap, Activity, Smartphone, CreditCard,
  MapPin, Calendar, CheckCircle2, XCircle, Eye,
  Crown, Plus, Trash2, ShieldAlert, Clock, BookOpen, AlertTriangle,
} from "lucide-react";

interface CourseAccess {
  id: number;
  playlistId: number;
  title: string | null;
  grantedAt: string | null;
  grantedBy: string | null;
  grantSource: string | null;
  reason: string | null;
  expiresAt: string | null;
  status: string | null;
}

interface UserDetail {
  id: number; username: string; email: string; phone: string | null; fullName: string | null;
  profileImage: string | null; accountType: string; subscriptionType: string;
  subscriptionExpiresAt: string | null; subscriptionStartedAt: string | null;
  isActive: boolean; ipAddress: string | null; ipAddress2: string | null; ipCount: number;
  createdAt: string; pushPermission: string; pushSupported: boolean;
  courses: CourseAccess[];
  recentActivity: { id: number; action: string; details: string | null; videoTitle: string | null; createdAt: string }[];
  payments: { id: number; planType: string; planPrice: string; paymentMethod: string; status: string; createdAt: string }[];
  devices: { id: number; userAgent: string | null; lastSeenAt: string | null; failedAt: string | null; createdAt: string }[];
  recentVisits: { path: string | null; visitedAt: string; ip: string | null }[];
}

interface Playlist { id: number; title: string; }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

const ACTION_LABELS: Record<string, string> = {
  video_view: "Lecture vidéo", login: "Connexion", logout: "Déconnexion",
  profile_update: "Profil mis à jour", subscription_update: "Abonnement mis à jour",
  password_change: "Mot de passe changé", user_blocked: "Bloqué", user_unblocked: "Débloqué",
  grant_course: "Dورة ممنوحة", revoke_course: "دورة منزوعة",
};

function parseUA(ua: string | null) {
  if (!ua) return "Appareil";
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "Mac";
  return "Appareil";
}

const GRANT_SOURCE_LABELS: Record<string, string> = {
  manual: "يدوي",
  plan: "اشتراك",
  payment: "دفع مؤكد",
  migration: "ترحيل",
};

interface Props {
  userId: number | null;
  onClose: () => void;
  getAdminAuthHeaders: () => { headers?: Record<string, string> } | undefined;
}

export function UserDetailModal({ userId, onClose, getAdminAuthHeaders }: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [grantModal, setGrantModal] = useState(false);
  const [grantPlaylistId, setGrantPlaylistId] = useState<string>("");
  const [grantReason, setGrantReason] = useState("");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<{ playlistId: number; title: string } | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  const fetchDetail = () => {
    if (!userId) { setDetail(null); return; }
    setLoading(true); setError(null);
    fetch(`/api/admin/users/${userId}/detail`, { headers })
      .then(r => r.ok ? r.json() : r.json().then((e: { message: string }) => Promise.reject(e.message)))
      .then(setDetail)
      .catch((e: unknown) => setError(typeof e === "string" ? e : "Échec du chargement"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(); }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/admin/playlists", { headers })
      .then(r => r.ok ? r.json() : [])
      .then((data: Playlist[] | { playlists?: Playlist[] }) => {
        const arr = Array.isArray(data) ? data : (data as any).playlists ?? [];
        setPlaylists(arr);
      })
      .catch(() => {});
  }, [userId]);

  const handleGrant = async () => {
    if (!userId || !grantPlaylistId) return;
    setGrantLoading(true); setGrantError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}/grant-course`, {
        method: "POST",
        headers: { ...(headers ?? {}), "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: Number(grantPlaylistId),
          reason: grantReason || undefined,
          expiresAt: grantExpiry || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setGrantError(data.message ?? "خطأ في منح الدورة"); return; }
      setGrantModal(false);
      setGrantPlaylistId(""); setGrantReason(""); setGrantExpiry("");
      fetchDetail();
    } catch {
      setGrantError("خطأ في الاتصال بالخادم");
    } finally {
      setGrantLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!userId || !revokeTarget) return;
    setRevokeLoading(true);
    try {
      const r = await fetch(`/api/admin/users/${userId}/revoke-course/${revokeTarget.playlistId}`, {
        method: "DELETE",
        headers: headers ?? {},
      });
      if (r.ok) { setRevokeTarget(null); fetchDetail(); }
    } finally {
      setRevokeLoading(false);
    }
  };

  const now = new Date();
  const isExpired = detail?.subscriptionExpiresAt ? new Date(detail.subscriptionExpiresAt) < now : false;
  const isActiveVip = detail?.accountType === "vip" && !isExpired;

  const availablePlaylists = playlists.filter(
    p => !detail?.courses.some(c => c.playlistId === p.id)
  );

  return (
    <>
      <Dialog open={!!userId} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent dir="ltr" className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-gray-900" style={{ textAlign: "left" }}>
              <User className="w-4 h-4 text-blue-500" />
              {loading ? "Chargement…" : detail ? `${detail.username}` : "Détails de l'utilisateur"}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="space-y-3 py-4">
              {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          )}

          {error && <div className="py-8 text-center text-red-500 text-sm">{error}</div>}

          {!loading && !error && detail && (
            <Tabs defaultValue="courses" dir="ltr">
              <TabsList className="w-full grid grid-cols-5 mb-4 bg-gray-100 p-1 rounded-lg">
                {[
                  { v: "info",     label: "Infos",     icon: <User className="w-3 h-3" /> },
                  { v: "courses",  label: "الدورات",   icon: <GraduationCap className="w-3 h-3" /> },
                  { v: "activity", label: "Activité",  icon: <Activity className="w-3 h-3" /> },
                  { v: "devices",  label: "Appareils", icon: <Smartphone className="w-3 h-3" /> },
                  { v: "payments", label: "Paiements", icon: <CreditCard className="w-3 h-3" /> },
                ].map(t => (
                  <TabsTrigger key={t.v} value={t.v} className="flex items-center gap-1 text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-md">
                    {t.icon}{t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* INFO TAB */}
              <TabsContent value="info" className="space-y-3 mt-0">
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="Nom d'utilisateur" value={detail.username} />
                  <InfoRow label="Nom complet" value={detail.fullName ?? "—"} />
                  <InfoRow label="E-mail" value={detail.email} mono />
                  <InfoRow label="Téléphone" value={detail.phone ?? "—"} mono />
                </div>

                <div className="rounded-xl border p-4 space-y-2.5" style={{ borderColor: "#E5EAF2", background: "#F8FAFD" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#667085" }}>Abonnement</p>
                  <Row label="Type de compte">
                    {isActiveVip
                      ? <span className="ad-badge ad-badge-vip"><Crown className="w-3 h-3" />VIP</span>
                      : <span className="ad-badge ad-badge-normal">Standard</span>}
                  </Row>
                  <Row label="Plan"><span className="text-sm" style={{ color: "#344054" }}>{detail.subscriptionType}</span></Row>
                  {detail.subscriptionStartedAt && <Row label="Début"><span className="text-sm" style={{ color: "#344054" }}>{formatDate(detail.subscriptionStartedAt)}</span></Row>}
                  {detail.subscriptionExpiresAt && (
                    <Row label="Expiration">
                      <span className="text-sm font-medium" style={{ color: isExpired ? "#B42318" : "#157347" }}>
                        {formatDate(detail.subscriptionExpiresAt)}{isExpired ? " (expiré)" : ""}
                      </span>
                    </Row>
                  )}
                  <Row label="Statut">
                    {detail.isActive
                      ? <span className="flex items-center gap-1 text-xs" style={{ color: "#157347" }}><CheckCircle2 className="w-3.5 h-3.5" />Actif</span>
                      : <span className="flex items-center gap-1 text-xs" style={{ color: "#B42318" }}><XCircle className="w-3.5 h-3.5" />Bloqué</span>}
                  </Row>
                </div>

                <div className="rounded-xl border p-4 space-y-2.5" style={{ borderColor: "#E5EAF2", background: "#F8FAFD" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#667085" }}>Session et appareils</p>
                  <Row label="Inscription"><span className="text-sm" style={{ color: "#344054" }}>{formatDate(detail.createdAt)}</span></Row>
                  {detail.ipAddress && <Row label={<span className="flex items-center gap-1"><MapPin className="w-3 h-3" />IP principale</span>}><span className="text-sm font-mono" style={{ color: "#344054" }}>{detail.ipAddress}</span></Row>}
                  {detail.ipAddress2 && <Row label={<span className="flex items-center gap-1"><MapPin className="w-3 h-3" />IP secondaire</span>}><span className="text-sm font-mono" style={{ color: "#344054" }}>{detail.ipAddress2}</span></Row>}
                </div>

                {detail.recentVisits.length > 0 && (
                  <div className="rounded-xl border p-4" style={{ borderColor: "#E5EAF2", background: "#F8FAFD" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: "#667085" }}>
                      <Eye className="w-3.5 h-3.5" />Dernières visites
                    </p>
                    <div className="space-y-1.5">
                      {detail.recentVisits.slice(0, 5).map((v, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono truncate" style={{ color: "#667085" }}>{v.path ?? "/"}</span>
                          <span className="text-xs shrink-0" style={{ color: "#98A2B3" }}>{timeAgo(v.visitedAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* COURSES TAB — الدورات */}
              <TabsContent value="courses" className="mt-0 space-y-3" dir="rtl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-orange-500" />
                      الوصول إلى الدورات
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {detail.courses.length === 0 ? "لا توجد دورات ممنوحة" : `${detail.courses.length} دورة ممنوحة`}
                    </p>
                  </div>
                  <button
                    onClick={() => { setGrantModal(true); setGrantError(null); }}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-all"
                    style={{ background: "linear-gradient(135deg,#F97316,#EA580C)" }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    منح دورة
                  </button>
                </div>

                {detail.courses.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border-2 border-dashed" style={{ borderColor: "#E5EAF2" }}>
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-400">لا توجد دورات ممنوحة</p>
                    <p className="text-xs text-gray-300 mt-1">اضغط "منح دورة" لإضافة دورة يدوياً</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.courses.map(c => {
                      const expired = c.expiresAt ? new Date(c.expiresAt) < now : false;
                      const isActive = c.status === "active" && !expired;
                      return (
                        <div key={c.id ?? c.playlistId} className="rounded-xl border bg-white p-3 space-y-2" style={{ borderColor: isActive ? "#BBF7D0" : "#FDE8D8", background: isActive ? "#F0FDF4" : "#FFF7F4" }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isActive ? "#DCFCE7" : "#FEE2E2" }}>
                                <GraduationCap className="w-4 h-4" style={{ color: isActive ? "#16A34A" : "#DC2626" }} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#111827" }}>{c.title ?? `دورة #${c.playlistId}`}</p>
                                <p className="text-xs" style={{ color: "#6B7280" }}>
                                  {isActive ? "✅ مفعّلة" : expired ? "⏰ منتهية الصلاحية" : "🔴 موقوفة"}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => setRevokeTarget({ playlistId: c.playlistId, title: c.title ?? `دورة #${c.playlistId}` })}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border shrink-0 hover:bg-red-50 transition-colors"
                              style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
                            >
                              <Trash2 className="w-3 h-3" />
                              نزع
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1 border-t" style={{ borderColor: "#E5E7EB" }}>
                            <span style={{ color: "#6B7280" }}>
                              👤 <span className="font-medium text-gray-800">{c.grantedBy ?? "غير معروف"}</span>
                            </span>
                            <span style={{ color: "#6B7280" }}>
                              📋 {GRANT_SOURCE_LABELS[c.grantSource ?? ""] ?? c.grantSource ?? "—"}
                            </span>
                            <span style={{ color: "#6B7280" }}>
                              📅 {c.grantedAt ? new Date(c.grantedAt).toLocaleDateString("ar-DZ") : "—"}
                            </span>
                            {c.expiresAt && (
                              <span className="flex items-center gap-1" style={{ color: expired ? "#DC2626" : "#6B7280" }}>
                                <Clock className="w-3 h-3" />
                                تنتهي: {new Date(c.expiresAt).toLocaleDateString("ar-DZ")}
                              </span>
                            )}
                            {c.reason && (
                              <span className="col-span-2" style={{ color: "#6B7280" }}>
                                💬 السبب: <span className="text-gray-800">{c.reason}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ACTIVITY TAB */}
              <TabsContent value="activity" className="mt-0">
                {detail.recentActivity.length === 0 ? <EmptyTab icon={<Activity />} label="Aucune activité" /> : (
                  <div className="space-y-1">
                    {detail.recentActivity.map(a => (
                      <div key={a.id} className="flex items-start gap-3 rounded-lg border bg-white px-3 py-2.5 hover:bg-gray-50 transition-colors" style={{ borderColor: "#EEF2F7" }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium" style={{ color: "#1F2937" }}>{ACTION_LABELS[a.action] ?? a.action}</span>
                            <span className="text-xs shrink-0" style={{ color: "#98A2B3" }}>{timeAgo(a.createdAt)}</span>
                          </div>
                          {(a.details || a.videoTitle) && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: "#667085" }}>{a.videoTitle ?? a.details}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* DEVICES TAB */}
              <TabsContent value="devices" className="mt-0">
                {detail.devices.length === 0 ? <EmptyTab icon={<Smartphone />} label="Aucun appareil enregistré" /> : (
                  <div className="space-y-2">
                    {detail.devices.map(d => (
                      <div key={d.id} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3" style={{ borderColor: "#E5EAF2" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={d.failedAt ? { background: "#FDF1F1", border: "1px solid #F2CBCB" } : { background: "#EFFAF3", border: "1px solid #BFE5CD" }}>
                            <Smartphone className="w-4 h-4" style={{ color: d.failedAt ? "#B42318" : "#157347" }} />
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: "#1F2937" }}>{parseUA(d.userAgent)}</p>
                            <p className="text-xs" style={{ color: "#98A2B3" }}>
                              {d.lastSeenAt ? `Vu : ${timeAgo(d.lastSeenAt)}` : `Enregistré : ${formatDate(d.createdAt)}`}
                            </p>
                          </div>
                        </div>
                        <span className={`ad-badge ${d.failedAt ? "ad-badge-rejected" : "ad-badge-active"}`}>
                          {d.failedAt ? "Inactif" : "Actif"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* PAYMENTS TAB */}
              <TabsContent value="payments" className="mt-0">
                {detail.payments.length === 0 ? <EmptyTab icon={<CreditCard />} label="Aucun paiement" /> : (
                  <div className="space-y-2">
                    {detail.payments.map(p => (
                      <div key={p.id} className="rounded-xl border bg-white px-4 py-3 space-y-1.5" style={{ borderColor: "#E5EAF2" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold" style={{ color: "#1F2937" }}>{p.planType} — {p.planPrice}</span>
                          <PayBadge status={p.status} />
                        </div>
                        <div className="flex items-center justify-between text-xs" style={{ color: "#667085" }}>
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

      {/* GRANT COURSE MODAL */}
      <Dialog open={grantModal} onOpenChange={o => { if (!o) { setGrantModal(false); setGrantError(null); } }}>
        <DialogContent dir="rtl" className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base" style={{ color: "#111827" }}>
              <ShieldAlert className="w-5 h-5 text-orange-500" />
              منح دورة للمستخدم
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg p-3 text-xs" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#92400E" }}>
              <AlertTriangle className="w-3.5 h-3.5 inline-block ml-1" />
              هذه العملية ستُسجَّل في سجل التدقيق باسمك: <strong>{detail?.username ?? "Admin"}</strong>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اختر الدورة *</label>
              <select
                value={grantPlaylistId}
                onChange={e => setGrantPlaylistId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                style={{ borderColor: "#D1D5DB" }}
              >
                <option value="">-- اختر دورة --</option>
                {availablePlaylists.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
                {availablePlaylists.length === 0 && playlists.length > 0 && (
                  <option disabled>المستخدم يملك جميع الدورات المتاحة</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">سبب المنح</label>
              <input
                type="text"
                value={grantReason}
                onChange={e => setGrantReason(e.target.value)}
                placeholder="مثال: دفع مؤكد عبر CCP، منح يدوي من الإدارة..."
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                style={{ borderColor: "#D1D5DB" }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">تاريخ الانتهاء (اختياري)</label>
              <input
                type="date"
                value={grantExpiry}
                onChange={e => setGrantExpiry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                style={{ borderColor: "#D1D5DB" }}
              />
            </div>

            {grantError && (
              <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}>
                {grantError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleGrant}
                disabled={!grantPlaylistId || grantLoading}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#F97316,#EA580C)" }}
              >
                {grantLoading ? "جاري المنح..." : "تأكيد المنح"}
              </button>
              <button
                onClick={() => { setGrantModal(false); setGrantError(null); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-50"
                style={{ borderColor: "#D1D5DB", color: "#374151" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* REVOKE CONFIRMATION MODAL */}
      <Dialog open={!!revokeTarget} onOpenChange={o => { if (!o) setRevokeTarget(null); }}>
        <DialogContent dir="rtl" className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base" style={{ color: "#B91C1C" }}>
              <Trash2 className="w-5 h-5" />
              تأكيد نزع الدورة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg p-4 text-center" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
              <p className="text-sm font-medium text-gray-800">هل تريد نزع دورة</p>
              <p className="text-base font-bold mt-1" style={{ color: "#B91C1C" }}>"{revokeTarget?.title}"</p>
              <p className="text-sm text-gray-600 mt-1">من المستخدم <strong>{detail?.username}</strong>؟</p>
              <p className="text-xs text-gray-400 mt-2">سيتوقف الوصول فوراً وستُسجَّل العملية في سجل التدقيق.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRevoke}
                disabled={revokeLoading}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {revokeLoading ? "جاري النزع..." : "تأكيد النزع"}
              </button>
              <button
                onClick={() => setRevokeTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border hover:bg-gray-50 transition-colors"
                style={{ borderColor: "#D1D5DB", color: "#374151" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: "#E5EAF2" }}>
      <p className="text-[11px] mb-1" style={{ color: "#98A2B3" }}>{label}</p>
      <p className={`text-sm font-medium truncate ${mono ? "font-mono" : ""}`} style={{ color: "#1F2937" }}>{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm shrink-0" style={{ color: "#667085" }}>{label}</span>
      {children}
    </div>
  );
}

function EmptyTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="py-10 text-center" style={{ color: "#98A2B3" }}>
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2">
        {icon}
      </div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

function PayBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="ad-badge ad-badge-approved">Approuvé</span>;
  if (status === "pending")  return <span className="ad-badge ad-badge-pending">En attente</span>;
  return <span className="ad-badge ad-badge-rejected">Rejeté</span>;
}
