import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import {
  User, GraduationCap, Activity, Smartphone, CreditCard,
  MapPin, Calendar, CheckCircle2, XCircle, Eye,
  Crown,
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
};

function parseUA(ua: string | null) {
  if (!ua) return "Appareil";
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "Mac";
  return "Appareil";
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
      .catch((e: unknown) => setError(typeof e === "string" ? e : "Échec du chargement"))
      .finally(() => setLoading(false));
  }, [userId]);

  const now = new Date();
  const isExpired = detail?.subscriptionExpiresAt ? new Date(detail.subscriptionExpiresAt) < now : false;
  const isActiveVip = detail?.accountType === "vip" && !isExpired;

  return (
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
          <Tabs defaultValue="info" dir="ltr">
            <TabsList className="w-full grid grid-cols-5 mb-4 bg-gray-100 p-1 rounded-lg">
              {[
                { v: "info",     label: "Infos",     icon: <User className="w-3 h-3" /> },
                { v: "courses",  label: "Cours",     icon: <GraduationCap className="w-3 h-3" /> },
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

            {/* COURSES TAB */}
            <TabsContent value="courses" className="mt-0">
              {detail.courses.length === 0 ? <EmptyTab icon={<GraduationCap />} label="Aucun cours accordé" /> : (
                <div className="space-y-2">
                  {detail.courses.map(c => (
                    <div key={c.playlistId} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3" style={{ borderColor: "#E5EAF2" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                          <GraduationCap className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "#1F2937" }}>{c.title}</p>
                          {c.grantedAt && <p className="text-xs" style={{ color: "#98A2B3" }}>Accordé le : {formatDate(c.grantedAt)}</p>}
                        </div>
                      </div>
                      <span className="ad-badge ad-badge-active">Inscrit</span>
                    </div>
                  ))}
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
