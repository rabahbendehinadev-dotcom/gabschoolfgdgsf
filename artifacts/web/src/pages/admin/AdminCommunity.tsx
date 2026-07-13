import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Input, Button } from "@/components/ui";
import { Search, Eye, EyeOff, Pin, Trash2, Loader2, Flag, CheckCircle, XCircle } from "lucide-react";

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
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} ي`;
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
      if (!res.ok) throw new Error("فشل تحميل المنشورات");
      return res.json() as Promise<{ posts: AdminPost[]; hasMore: boolean }>;
    },
    enabled: tab === "posts",
  });

  const reportsQ = useQuery({
    queryKey: ["admin-community-reports", reportStatus, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30", page: String(page), status: reportStatus });
      const res = await fetch(`/api/admin/community/reports?${params}`, { headers: adminHeaders });
      if (!res.ok) throw new Error("فشل تحميل البلاغات");
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
      if (!res.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-community-posts"] });
      toast({ title: "تم التحديث" });
    },
    onError: () => toast({ title: "فشل التحديث", variant: "destructive" }),
  });

  const deletePost = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/community/posts/${id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      if (!res.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-community-posts"] });
      toast({ title: "تم حذف المنشور" });
    },
    onError: () => toast({ title: "فشل الحذف", variant: "destructive" }),
  });

  const resolveReport = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/community/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-community-reports"] });
      toast({ title: "تم تحديث البلاغ" });
    },
    onError: () => toast({ title: "فشل تحديث البلاغ", variant: "destructive" }),
  });

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-extrabold text-white">إدارة المجتمع</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["posts", "reports"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setPage(1); }}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {t === "posts" ? "المنشورات" : "البلاغات"}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {tab === "posts" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث بالمحتوى أو اسم المستخدم…"
              className="bg-white/10 border-white/20 text-white placeholder:text-white/40 pr-9"
            />
          </div>

          {postsQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>
          ) : (postsQ.data?.posts ?? []).length === 0 ? (
            <p className="py-8 text-center text-white/50">لا توجد منشورات</p>
          ) : (
            <div className="space-y-3">
              {(postsQ.data?.posts ?? []).map((post) => (
                <Card key={post.id} className="bg-white/10 border-white/10 p-4 text-white rounded-2xl">
                  <div className="flex items-start gap-3">
                    {post.authorProfileImageUrl ? (
                      <img src={post.authorProfileImageUrl} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
                        {post.authorUsername?.charAt(0) || "؟"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-sm">{post.authorUsername || "—"}</span>
                        <span className="text-xs text-white/50">{post.authorEmail || ""}</span>
                        <span className="text-xs text-white/40">{timeAgo(post.createdAt)}</span>
                        {post.isHidden && <Badge className="bg-red-500/20 text-red-300 text-xs">مخفي</Badge>}
                        {post.isPinned && <Badge className="bg-blue-500/20 text-blue-300 text-xs">مثبّت</Badge>}
                        {post.isFeatured && <Badge className="bg-amber-500/20 text-amber-300 text-xs">مميّز</Badge>}
                      </div>
                      <p className="text-sm text-white/80 line-clamp-3 break-words">
                        {post.content || <span className="italic text-white/40">[منشور بدون نص]</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-white/50">
                        <span>{post.likesCount} إعجاب</span>
                        <span>{post.commentsCount} تعليق</span>
                        <span>{post.viewsCount} مشاهدة</span>
                        <span>#{post.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 border-t border-white/10 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 gap-1.5 text-xs"
                      onClick={() => patchPost.mutate({ id: post.id, body: { isHidden: !post.isHidden } })}
                      disabled={patchPost.isPending}
                    >
                      {post.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {post.isHidden ? "إظهار" : "إخفاء"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 gap-1.5 text-xs"
                      onClick={() => patchPost.mutate({ id: post.id, body: { isPinned: !post.isPinned } })}
                      disabled={patchPost.isPending}
                    >
                      <Pin className="h-3.5 w-3.5" />
                      {post.isPinned ? "إلغاء التثبيت" : "تثبيت"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 gap-1.5 text-xs"
                      onClick={() => {
                        if (confirm("هل أنت متأكد من حذف هذا المنشور؟")) {
                          deletePost.mutate(post.id);
                        }
                      }}
                      disabled={deletePost.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </Button>
            <span className="flex items-center px-3 text-sm text-white/70">صفحة {page}</span>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white"
              onClick={() => setPage((p) => p + 1)}
              disabled={!postsQ.data?.hasMore}
            >
              التالي
            </Button>
          </div>
        </div>
      )}

      {/* Reports tab */}
      {tab === "reports" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["pending", "resolved", "dismissed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setReportStatus(s); setPage(1); }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                  reportStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {s === "pending" ? "قيد الانتظار" : s === "resolved" ? "تم الحل" : "مرفوض"}
              </button>
            ))}
          </div>

          {reportsQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>
          ) : (reportsQ.data?.reports ?? []).length === 0 ? (
            <p className="py-8 text-center text-white/50 flex flex-col items-center gap-2">
              <Flag className="h-8 w-8 text-white/20" />
              لا توجد بلاغات {reportStatus === "pending" ? "قيد الانتظار" : ""}
            </p>
          ) : (
            <div className="space-y-3">
              {(reportsQ.data?.reports ?? []).map((report) => (
                <Card key={report.id} className="bg-white/10 border-white/10 p-4 text-white rounded-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <Badge className="bg-orange-500/20 text-orange-300 text-xs">
                          <Flag className="h-3 w-3 ml-1" />
                          {report.postId ? `منشور #${report.postId}` : `تعليق #${report.commentId}`}
                        </Badge>
                        <span className="text-xs text-white/50">{timeAgo(report.createdAt)}</span>
                      </div>
                      <p className="text-sm text-white/80 mb-1">
                        <span className="text-white/50 text-xs">بواسطة: </span>
                        {report.reporterUsername || "—"}
                        {report.reporterEmail && <span className="text-white/40 text-xs mr-1">({report.reporterEmail})</span>}
                      </p>
                      {report.reason && (
                        <p className="text-sm text-white/70 bg-white/5 rounded-xl px-3 py-2 break-words">
                          {report.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {reportStatus === "pending" && (
                    <div className="flex gap-2 mt-3 border-t border-white/10 pt-3">
                      <Button
                        size="sm"
                        className="h-8 rounded-xl bg-green-500/20 text-green-300 hover:bg-green-500/30 gap-1.5 text-xs"
                        onClick={() => resolveReport.mutate({ id: report.id, status: "resolved" })}
                        disabled={resolveReport.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        تم الحل
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 gap-1.5 text-xs"
                        onClick={() => resolveReport.mutate({ id: report.id, status: "dismissed" })}
                        disabled={resolveReport.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        رفض
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              السابق
            </Button>
            <span className="flex items-center px-3 text-sm text-white/70">صفحة {page}</span>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white"
              onClick={() => setPage((p) => p + 1)}
              disabled={!reportsQ.data?.hasMore}
            >
              التالي
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
