import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLikeCommunityPost,
  useUnlikeCommunityPost,
  useViewCommunityPost,
  useDeleteCommunityPost,
  useUpdateCommunityPost,
  getGetCommunityFeedQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import { CommunityPost } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Textarea,
} from "@/components/ui";
import { MediaGrid } from "./MediaGrid";
import { CommentsSection } from "./CommentsSection";
import {
  Heart,
  MessageCircle,
  Eye,
  Crown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Pin,
  Star,
  Flag,
} from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar");
}

export function PostCard({ post, index = 0 }: { post: CommunityPost; index?: number }) {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likesCount);
  const [views, setViews] = useState(post.viewsCount);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(post.content || "");
  const [confirmDel, setConfirmDel] = useState(false);

  const vip = post.author.accountType === "vip";
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reporting, setReporting] = useState(false);

  const likeM = useLikeCommunityPost({ request: getAuthHeaders() });
  const unlikeM = useUnlikeCommunityPost({ request: getAuthHeaders() });
  const viewM = useViewCommunityPost({ request: getAuthHeaders() });

  const invalidateFeed = () =>
    queryClient.invalidateQueries({ queryKey: getGetCommunityFeedQueryKey() });

  const delM = useDeleteCommunityPost({
    request: getAuthHeaders(),
    mutation: {
      onSuccess: () => {
        invalidateFeed();
        toast({ title: "تم حذف المنشور" });
      },
      onError: () => toast({ title: "تعذّر حذف المنشور", variant: "destructive" }),
    },
  });

  const updM = useUpdateCommunityPost({
    request: getAuthHeaders(),
    mutation: {
      onSuccess: () => {
        invalidateFeed();
        setEditOpen(false);
        toast({ title: "تم تحديث المنشور" });
      },
      onError: () => toast({ title: "تعذّر تحديث المنشور", variant: "destructive" }),
    },
  });

  // Record a view once per mount for authenticated viewers.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!user || viewedRef.current) return;
    viewedRef.current = true;
    viewM.mutate(
      { id: post.id },
      { onSuccess: (r) => setViews(r.viewsCount) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, post.id]);

  const toggleLike = () => {
    if (!user) {
      toast({ title: "سجّل الدخول للإعجاب بالمنشورات" });
      return;
    }
    if (liked) {
      setLiked(false);
      setLikes((n) => Math.max(0, n - 1));
      unlikeM.mutate(
        { id: post.id },
        {
          onSuccess: (r) => {
            setLiked(r.liked);
            setLikes(r.likesCount);
          },
          onError: () => {
            setLiked(true);
            setLikes((n) => n + 1);
          },
        },
      );
    } else {
      setLiked(true);
      setLikes((n) => n + 1);
      likeM.mutate(
        { id: post.id },
        {
          onSuccess: (r) => {
            setLiked(r.liked);
            setLikes(r.likesCount);
          },
          onError: () => {
            setLiked(false);
            setLikes((n) => Math.max(0, n - 1));
          },
        },
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.05, duration: 0.35 }}
    >
      <Card className="overflow-hidden rounded-3xl border-border bg-white/90 shadow-[0_2px_16px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-3">
          {post.author.profileImageUrl ? (
            <img
              src={post.author.profileImageUrl}
              alt={post.author.username}
              className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-sm ${
                vip
                  ? "bg-gradient-to-br from-amber-400 to-orange-500"
                  : "bg-gradient-to-br from-slate-400 to-slate-500"
              }`}
            >
              {post.author.username.trim().charAt(0) || "؟"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-bold text-foreground">{post.author.username}</span>
              {vip && (
                <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 px-1.5 py-0.5 text-[10px] font-bold text-orange-500">
                  <Crown className="h-3 w-3" /> VIP
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{timeAgo(post.createdAt)}</span>
              {post.isPinned && (
                <span className="flex items-center gap-0.5 text-primary">
                  <Pin className="h-3 w-3" /> مثبّت
                </span>
              )}
              {post.isFeatured && (
                <span className="flex items-center gap-0.5 text-amber-500">
                  <Star className="h-3 w-3 fill-current" /> مميّز
                </span>
              )}
            </div>
          </div>

          {user && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground"
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute left-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
                  >
                    {post.canEdit && (
                      <>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEditText(post.content || "");
                            setEditOpen(true);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" /> تعديل
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setConfirmDel(true);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" /> حذف
                        </button>
                      </>
                    )}
                    {!post.canEdit && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setReportOpen(true);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
                      >
                        <Flag className="h-4 w-4" /> إبلاغ
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Content */}
        {post.content && (
          <p className="whitespace-pre-wrap break-words px-4 pb-3 text-[15px] leading-relaxed text-foreground/90">
            {post.content}
          </p>
        )}

        {/* Media */}
        {post.media.length > 0 && (
          <div className="px-2 pb-2 sm:px-3">
            <MediaGrid media={post.media} username={post.author.username} />
          </div>
        )}

        {/* Counters */}
        <div className="flex items-center justify-between px-4 pt-2 text-xs text-muted-foreground">
          <span>{likes > 0 ? `${likes} إعجاب` : ""}</span>
          <div className="flex items-center gap-3">
            {commentsCount > 0 && <span>{commentsCount} تعليق</span>}
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {views}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mx-4 mt-2 grid grid-cols-2 gap-1 border-t border-border/60 pt-1">
          <button
            type="button"
            onClick={toggleLike}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              liked ? "text-rose-500" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Heart className={`h-5 w-5 ${liked ? "fill-rose-500" : ""}`} />
            إعجاب
          </button>
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              showComments ? "text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            تعليق
          </button>
        </div>

        {/* Comments */}
        <AnimatePresence initial={false}>
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden px-4 pb-4"
            >
              <CommentsSection
                postId={post.id}
                onCountChange={(delta) => setCommentsCount((n) => Math.max(0, n + delta))}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المنشور</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={5}
            className="resize-none rounded-2xl"
            placeholder="نص المنشور…"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => updM.mutate({ id: post.id, data: { content: editText.trim() || null } })}
              disabled={updM.isPending}
            >
              {updM.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={(v) => { if (!reporting) { setReportOpen(v); if (!v) { setReportReason(""); setReportSent(false); } } }}>
        <DialogContent className="rounded-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>الإبلاغ عن المنشور</DialogTitle>
          </DialogHeader>
          {reportSent ? (
            <p className="py-4 text-center text-sm font-semibold text-green-600">
              تم إرسال بلاغك، شكراً لمساعدتنا ✓
            </p>
          ) : (
            <>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={3}
                className="resize-none rounded-2xl"
                placeholder="سبب البلاغ (اختياري)…"
              />
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reporting}>إلغاء</Button>
                <Button
                  variant="destructive"
                  disabled={reporting}
                  onClick={async () => {
                    setReporting(true);
                    try {
                      const headers = getAuthHeaders();
                      await fetch(`/api/community/posts/${post.id}/report`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...headers?.headers },
                        body: JSON.stringify({ reason: reportReason }),
                      });
                      setReportSent(true);
                      setTimeout(() => setReportOpen(false), 1500);
                    } finally {
                      setReporting(false);
                    }
                  }}
                >
                  {reporting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  إرسال البلاغ
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent className="rounded-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف المنشور</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => delM.mutate({ id: post.id }, { onSettled: () => setConfirmDel(false) })}
              disabled={delM.isPending}
            >
              {delM.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
