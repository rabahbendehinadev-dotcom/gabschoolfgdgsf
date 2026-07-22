import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, Input } from "@/components/ui";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const API_BASE = "";

type ActivityLogEntry = {
  id: number;
  userId: number | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  action: string;
  details: string | null;
  ipAddress: string | null;
  deviceType: string | null;
  videoId: number | null;
  videoTitle: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  user_registered:         { label: "Inscription",                      color: "bg-green-500/20 text-green-400" },
  user_login:              { label: "Connexion",                        color: "bg-blue-500/20 text-blue-400" },
  user_blocked:            { label: "Blocage utilisateur",              color: "bg-red-500/20 text-red-400" },
  user_unblocked:          { label: "Déblocage utilisateur",            color: "bg-yellow-500/20 text-yellow-400" },
  user_deleted:            { label: "Suppression utilisateur",          color: "bg-red-700/30 text-red-300" },
  subscription_deleted:    { label: "Abonnement annulé",                color: "bg-red-500/20 text-red-400" },
  subscription_changed:    { label: "Abonnement modifié",               color: "bg-purple-500/20 text-purple-400" },
  ip_reset:                { label: "Réinitialisation IP",              color: "bg-cyan-500/20 text-cyan-400" },
  screenshot_attempt:      { label: "Tentative de capture d'écran",     color: "bg-red-500/20 text-red-400" },
  external_open_attempt:   { label: "Tentative d'ouverture de lien",    color: "bg-red-600/25 text-red-300" },
  copy_link_attempt:       { label: "Tentative de copie de lien",       color: "bg-rose-500/20 text-rose-400" },
  devtools_attempt:        { label: "Tentative outils développeur",     color: "bg-rose-500/20 text-rose-400" },
  screen_capture_attempt:  { label: "Tentative d'enregistrement",       color: "bg-red-600/25 text-red-300" },
  locked_video_attempt:    { label: "Accès vidéo non activé",           color: "bg-yellow-500/20 text-yellow-500" },
  frequent_ip_change:      { label: "Changement fréquent d'IP",         color: "bg-fuchsia-500/20 text-fuchsia-400" },
  frequent_device_change:  { label: "Changement fréquent d'appareil",   color: "bg-violet-500/20 text-violet-400" },
  community_post_hide:     { label: "Publication masquée",              color: "bg-slate-500/20 text-slate-300" },
  community_post_show:     { label: "Publication affichée",             color: "bg-green-500/20 text-green-400" },
  community_post_pin:      { label: "Publication épinglée",             color: "bg-blue-500/20 text-blue-400" },
  community_post_unpin:    { label: "Désépinglée",                      color: "bg-blue-500/10 text-blue-300" },
  community_post_update:   { label: "Publication modifiée",             color: "bg-yellow-500/20 text-yellow-400" },
  community_post_delete:   { label: "Publication supprimée (admin)",    color: "bg-red-600/25 text-red-300" },
  community_comment_delete:{ label: "Commentaire supprimé (admin)",     color: "bg-red-500/20 text-red-400" },
};

const DEVICE_LABELS: Record<string, string> = {
  mobile:  "Mobile",
  tablet:  "Tablette",
  desktop: "Ordinateur",
  unknown: "Inconnu",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
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
      if (!res.ok) throw new Error("Échec du chargement des logs");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const q = search.toLowerCase();
  const filtered = logs?.filter(l =>
    (l.username ?? "").toLowerCase().includes(q) ||
    (l.email ?? "").toLowerCase().includes(q) ||
    (l.phone ?? "").toLowerCase().includes(q) ||
    (l.action ?? "").toLowerCase().includes(q) ||
    (ACTION_LABELS[l.action]?.label ?? "").toLowerCase().includes(q) ||
    (l.details ?? "").toLowerCase().includes(q) ||
    (l.videoTitle ?? "").toLowerCase().includes(q) ||
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
        <h1 className="text-3xl font-bold">Journal d'activité</h1>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, événement, détails..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-white/5 border-b border-white/10 uppercase">
              <tr>
                <th className="px-4 py-4">Date et heure</th>
                <th className="px-4 py-4">Utilisateur</th>
                <th className="px-4 py-4">Email</th>
                <th className="px-4 py-4">WhatsApp</th>
                <th className="px-4 py-4">Événement</th>
                <th className="px-4 py-4">Vidéo</th>
                <th className="px-4 py-4">Appareil</th>
                <th className="px-4 py-4">Détails</th>
                <th className="px-4 py-4">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td>
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
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                    {log.email || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {log.phone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {getActionBadge(log.action)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                    {log.videoTitle || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {log.deviceType ? (DEVICE_LABELS[log.deviceType] ?? log.deviceType) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                    {log.details || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {log.ipAddress || "—"}
                  </td>
                </tr>
              ))}
              {!isLoading && filtered?.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Aucun résultat
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
