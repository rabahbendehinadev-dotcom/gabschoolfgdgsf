import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Eye, EyeOff, Pin, PinOff, Trash2, Loader2, Flag, CheckCircle, XCircle, MessageSquare } from "lucide-react";

type AdminPost = {
  id: number;
  content: string | null;
  postType: string;
  isVisible: boolean;
  isHidden: boolean;
  isPinned: boolean;
  isFeatured: boolean;
  isVipLocked: boolean;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  authorUserId: number;
  authorUsername: string | null;
  authorEmail: string | null;
  authorProfileImageUrl: string | null;
};

type AdminReport = {
  id: number;
  postId: number | null;
  commentId: number | null;
  reason: string | null;
  status: string;
  createdAt: string;
  reporterUsername: string | null;
  reporterEmail: string | null;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function AvatarIcon({ username, imageUrl }: { username: string | null; imageUrl: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="h-10 w-10 rounded-full object-cover shrink-0 border border-gray-200"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="h-10 w-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
      {username?.charAt(0)?.toUpperCase() || "?"}
    </div>
  );
}

export function AdminCommunity() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"posts" | "reports">("posts");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reportStatus, setReportStatus] = useState("pending");

  const adminHeaders = getAdminAuthHeaders()?.headers || {};

  const postsQ = useQuery({
    queryKey: ["admin-community-posts", search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20", page: String(page) });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/community/posts?${params}`, { headers: adminHeaders });
      if (!res.ok) throw new Error("Échec du chargement des publications");
      return res.json() as Promise<{ posts: AdminPost[]; hasMore: boolean }>;
    },
    enabled: tab === "posts",
  });

  const reportsQ = useQuery({
    queryKey: ["admin-community-reports", reportStatus, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30", page: String(page), status: reportStatus });
      const res = await fetch(`/api/admin/community/reports?${params}`, { headers: adminHeaders });
      if (!res.ok) throw new Error("Échec du chargement des signalements");
      return res.json() as Promise<{ reports: AdminReport[]; hasMore: boolean }>;
    },
    enabled: tab === "reports",
  });

  const patchPost = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, boolean> }) => {
      const res = await fetch(`/api/admin/community/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-community-posts"] });
      toast({ title: "Mis à jour" });
    },
    onError: () => toast({ title: "Échec de la mise à jour", variant: "destructive" }),
  });

  const deletePost = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/community/posts/${id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      if (!res.ok) throw new Error("Échec de la suppression");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-community-posts"] });
      toast({ title: "Publication supprimée" });
    },
    onError: () => toast({ title: "Échec de la suppression", variant: "destructive" }),
  });

  const resolveReport = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/community/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-community-reports"] });
      toast({ title: "Signalement mis à jour" });
    },
    onError: () => toast({ title: "Échec de la mise à jour", variant: "destructive" }),
  });

  return (
    <div className="space-y-5 p-1">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5 text-blue-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">Gestion de la Communauté GAB</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-1">
        {(["posts", "reports"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setPage(1); }}
            className={`rounded-t-lg px-5 py-2 text-sm font-bold transition-colors border-b-2 -mb-[3px] ${
              tab === t
                ? "border-blue-500 text-blue-600 bg-blue-50"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {t === "posts" ? "Publications" : "Signalements"}
          </button>
        ))}
      </div>

      {/* ══ POSTS TAB ══ */}
      {tab === "posts" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher par contenu ou nom d'utilisateur..."
              className="w-full h-10 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {postsQ.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : (postsQ.data?.posts ?? []).length === 0 ? (
            <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-3">
              <MessageSquare className="h-10 w-10 text-gray-300" />
              <p className="text-sm">Aucune publication</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(postsQ.data?.posts ?? []).map((post) => (
                <div
                  key={post.id}
                  className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${
                    post.isHidden
                      ? "border-red-200 bg-red-50/40"
                      : post.isPinned
                      ? "border-blue-200 bg-blue-50/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* Author row */}
                  <div className="flex items-start gap-3">
                    <AvatarIcon username={post.authorUsername} imageUrl={post.authorProfileImageUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-gray-900">{post.authorUsername || "—"}</span>
                        <span className="text-xs text-gray-500">{post.authorEmail || ""}</span>
                        <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
                        <span className="text-xs text-gray-400 font-mono">#{post.id}</span>
                        {post.isHidden && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                            <EyeOff className="h-3 w-3" /> Masqué
                          </span>
                        )}
                        {post.isPinned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                            <Pin className="h-3 w-3" /> Épinglé
                          </span>
                        )}
                        {post.isFeatured && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                            En vedette
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 line-clamp-3 break-words leading-relaxed">
                        {post.content || <span className="italic text-gray-400">[Publication sans texte]</span>}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>{post.likesCount} J'aime</span>
                        <span>{post.commentsCount} Commentaire</span>
                        <span>{post.viewsCount} Vue</span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => patchPost.mutate({ id: post.id, body: { isHidden: !post.isHidden } })}
                      disabled={patchPost.isPending}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border ${
                        post.isHidden
                          ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                          : "bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {post.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {post.isHidden ? "Afficher" : "Masquer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => patchPost.mutate({ id: post.id, body: { isPinned: !post.isPinned } })}
                      disabled={patchPost.isPending}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border ${
                        post.isPinned
                          ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                          : "bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {post.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      {post.isPinned ? "Désépingler" : "Épingler"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Supprimer cette publication ?")) {
                          deletePost.mutate(post.id);
                        }
                      }}
                      disabled={deletePost.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex justify-center items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Précédent
            </button>
            <span className="text-sm font-semibold text-gray-700 px-2">Page {page}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!postsQ.data?.hasMore}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* ══ REPORTS TAB ══ */}
      {tab === "reports" && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-2">
            {(["pending", "resolved", "dismissed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setReportStatus(s); setPage(1); }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors border ${
                  reportStatus === s
                    ? s === "pending"
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                      : s === "resolved"
                      ? "bg-green-600 border-green-600 text-white shadow-sm"
                      : "bg-gray-600 border-gray-600 text-white shadow-sm"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s === "pending" ? "En attente" : s === "resolved" ? "Résolu" : "Rejeté"}
              </button>
            ))}
          </div>

          {reportsQ.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : (reportsQ.data?.reports ?? []).length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-3">
              <Flag className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-400">
                Aucun signalement {reportStatus === "pending" ? "en attente" : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(reportsQ.data?.reports ?? []).map((report) => (
                <div
                  key={report.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          <Flag className="h-3 w-3" />
                          {report.postId ? `Publication #${report.postId}` : `Commentaire #${report.commentId}`}
                        </span>
                        <span className="text-xs text-gray-400">{timeAgo(report.createdAt)}</span>
                      </div>

                      <p className="text-sm text-gray-800 mb-1">
                        <span className="text-gray-500 text-xs font-medium">Par : </span>
                        <span className="font-semibold">{report.reporterUsername || "—"}</span>
                        {report.reporterEmail && (
                          <span className="text-gray-400 text-xs ml-1.5">({report.reporterEmail})</span>
                        )}
                      </p>

                      {report.reason && (
                        <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mt-2 break-words leading-relaxed">
                          {report.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {reportStatus === "pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => resolveReport.mutate({ id: report.id, status: "resolved" })}
                        disabled={resolveReport.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Résolu
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveReport.mutate({ id: report.id, status: "dismissed" })}
                        disabled={resolveReport.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Rejeter
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex justify-center items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Précédent
            </button>
            <span className="text-sm font-semibold text-gray-700 px-2">Page {page}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!reportsQ.data?.hasMore}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
