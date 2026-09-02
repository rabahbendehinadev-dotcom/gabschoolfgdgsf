import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLikeCommunityPost,
  useUnlikeCommunityPost,
  useViewCommunityPost,
  useDeleteCommunityPost,
  useUpdateCommunityPost,
  useVoteCommunityPoll,
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
  MessageCircle,
  Eye,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Pin,
  Flag,
  ThumbsUp,
  CheckCircle2,
  Star,
  FileText,
  AlertCircle,
  BarChart2
} from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
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
  const [solved, setSolved] = useState(post.isSolved);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(post.content || "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [authorAvatarFailed, setAuthorAvatarFailed] = useState(false);

  const vip = post.author.accountType === "vip";
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    setAuthorAvatarFailed(false);
  }, [post.author.profileImageUrl]);

  const likeM = useLikeCommunityPost({ request: getAuthHeaders() });
  const unlikeM = useUnlikeCommunityPost({ request: getAuthHeaders() });
  const viewM = useViewCommunityPost({ request: getAuthHeaders() });
  const voteM = useVoteCommunityPoll({ request: getAuthHeaders() });

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

  const handleVote = (optionIndex: number) => {
    if (!user) {
      toast({ title: "سجّل الدخول للتصويت" });
      return;
    }
    if (post.myPollVote != null) return;

    // Optimistic UI update
    queryClient.setQueryData(getGetCommunityFeedQueryKey(), (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p: any) => ({
          ...p,
          posts: p.posts.map((p: CommunityPost) => {
            if (p.id !== post.id) return p;
            const newVotes = [...(p.pollVotes || [])];
            if (newVotes[optionIndex] !== undefined) {
              newVotes[optionIndex]++;
            }
            return {
              ...p,
              myPollVote: optionIndex,
              pollVotes: newVotes,
            };
          }),
        })),
      };
    });

    voteM.mutate(
      { id: post.id, data: { optionIndex } },
      {
        onSuccess: () => invalidateFeed(),
        onError: () => invalidateFeed(), // revert on error
      }
    );
  };

  const totalPollVotes = post.pollVotes?.reduce((a, b) => a + b, 0) || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.05, duration: 0.35 }}
    >
      <Card id={`post-${post.id}`} className="overflow-hidden rounded-[24px] border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow scroll-mt-24">
        {/* Header */}
        <div className="flex items-start gap-4 p-5 pb-3">
          {post.author.profileImageUrl && !authorAvatarFailed ? (
            <img
              src={post.author.profileImageUrl}
              alt=""
              onError={() => setAuthorAvatarFailed(true)}
              className="h-12 w-12 shrink-0 rounded-full object-cover shadow-sm border-2 border-white ring-1 ring-slate-100"
            />
          ) : (
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black text-white shadow-sm border-2 border-white ring-1 ring-slate-100 ${
                vip
                  ? "bg-gradient-to-br from-amber-400 to-orange-500"
                  : "bg-gradient-to-br from-slate-400 to-slate-600"
              }`}
            >
              {post.author.username.trim().charAt(0).toUpperCase() || "؟"}
            </div>
          )}

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
              <span className="truncate font-black text-slate-900 text-[16px]">{post.author.username}</span>
              {/* Role Badges */}
              {(post.author as any).role === "admin" ? (
                <span className="flex items-center px-2 py-0.5 bg-red-50 rounded-md text-[11px] font-black text-red-600 tracking-wide border border-red-100/50">
                  ADMIN
                </span>
              ) : (post.author as any).role === "formateur" ? (
                <span className="flex items-center px-2 py-0.5 bg-emerald-50 rounded-md text-[11px] font-black text-emerald-600 tracking-wide border border-emerald-100/50">
                  FORMATEUR
                </span>
              ) : vip ? (
                <span className="flex items-center px-2 py-0.5 bg-amber-50 rounded-md text-[11px] font-black text-amber-600 tracking-wide border border-amber-100/50">
                  VIP
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-blue-500 fill-blue-500/20" />
                </span>
              ) : (
                <span className="flex items-center px-2 py-0.5 bg-slate-100 rounded-md text-[11px] font-black text-slate-500 tracking-wide border border-slate-200/50">
                  ÉTUDIANT
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-slate-500 font-bold mt-0.5">
              <span>{timeAgo(post.createdAt)}</span>
              {post.category && (
                <>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-slate-600">{post.category}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {post.isPinned && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-md text-[11px] font-bold border border-red-100" title="مثبّت">
                <Pin className="h-3.5 w-3.5 fill-current" />
              </span>
            )}
            {post.isImportant && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-600 rounded-md text-[11px] font-bold border border-purple-100" title="مهم">
                <AlertCircle className="h-3.5 w-3.5" />
              </span>
            )}
            {solved && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[11px] font-bold border border-emerald-100" title="تم الحل">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
            {post.isQuestion && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md text-[11px] font-bold border border-blue-100" title="سؤال">
                سؤال
              </span>
            )}
            {post.isFeatured && (
               <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-md text-[11px] font-bold border border-amber-100">
                 <Star className="h-3 w-3 fill-current" />
                 مميّز
               </span>
            )}

            {user && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                  aria-label={`خيارات منشور ${post.author.username}`}
                  data-testid={`button-menu-${post.id}`}
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute left-0 top-9 z-30 w-40 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
                    >
                      {post.canEdit && (
                        <>
                          {post.isQuestion && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const previous = solved;
                                setSolved(!previous);
                                setMenuOpen(false);
                                updM.mutate(
                                  { id: post.id, data: { isSolved: !previous } },
                                  { onError: () => setSolved(previous) },
                                );
                              }}
                              disabled={updM.isPending}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-emerald-700 font-medium hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              {solved ? "إعادة فتح السؤال" : "تعليم كمحلول"}
                            </button>
                          )}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEditText(post.content || "");
                              setEditOpen(true);
                              setMenuOpen(false);
                            }}
                            data-testid={`button-edit-${post.id}`}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 font-medium hover:bg-slate-50"
                          >
                            <Pencil className="h-4 w-4 text-slate-400" /> تعديل
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setConfirmDel(true);
                              setMenuOpen(false);
                            }}
                            data-testid={`button-delete-${post.id}`}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 font-medium hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" /> حذف
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
                          data-testid={`button-report-${post.id}`}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-600 font-medium hover:bg-slate-50"
                        >
                          <Flag className="h-4 w-4 text-slate-400" /> إبلاغ
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {(post.title || post.content) && (
          <div className="px-5 pt-1 pb-4">
            {post.title && (
              <h3 className="font-black text-[18px] text-slate-900 mb-2 leading-tight">
                {post.title}
              </h3>
            )}
            {post.content && (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-slate-800 font-medium">
                {post.content}
              </p>
            )}
          </div>
        )}

        {/* Poll */}
        {post.postType === "poll" && post.pollOptions && post.pollOptions.length > 0 && (
          <div className="px-5 pb-5">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4 text-slate-700 font-bold text-sm">
                <BarChart2 className="w-5 h-5 text-orange-500" />
                استطلاع رأي
              </div>
              <div className="space-y-2.5">
                {post.pollOptions.map((opt, idx) => {
                  const voteCount = post.pollVotes?.[idx] || 0;
                  const percentage = totalPollVotes > 0 ? Math.round((voteCount / totalPollVotes) * 100) : 0;
                  const isMyVote = post.myPollVote === idx;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleVote(idx)}
                      disabled={post.myPollVote != null}
                      className={`relative w-full text-right overflow-hidden rounded-xl border p-3 transition-all ${
                        isMyVote
                          ? "bg-orange-50 border-orange-200"
                          : post.myPollVote != null
                          ? "bg-white border-slate-200"
                          : "bg-white border-slate-200 hover:border-orange-200 hover:bg-orange-50/50"
                      }`}
                    >
                      {/* Progress Bar (shows if voted) */}
                      {post.myPollVote != null && (
                        <div
                          className={`absolute top-0 right-0 bottom-0 opacity-10 ${
                            isMyVote ? "bg-orange-600" : "bg-slate-500"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      )}

                      <div className="relative z-10 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            isMyVote ? "border-orange-500" : "border-slate-300"
                          }`}>
                            {isMyVote && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                          </div>
                          <span className={`text-[15px] font-bold truncate ${isMyVote ? "text-orange-900" : "text-slate-700"}`}>
                            {opt}
                          </span>
                        </div>
                        {post.myPollVote != null && (
                          <span className={`text-sm font-black shrink-0 ${isMyVote ? "text-orange-600" : "text-slate-500"}`}>
                            {percentage}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-[13px] font-bold text-slate-500">
                {totalPollVotes} صوت
              </div>
            </div>
          </div>
        )}

        {/* Media */}
        {post.media.length > 0 && (
          <div className="px-5 pb-5">
            <MediaGrid media={post.media} username={post.author.username} />
          </div>
        )}

        {/* Actions Footer */}
        <div className="mx-5 mb-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 pt-3">

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Like */}
            <button
              type="button"
              onClick={toggleLike}
              data-testid={`button-like-${post.id}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[14px] font-bold transition-all active:scale-[0.97] ${
                liked ? "text-orange-600 bg-orange-50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <ThumbsUp className={`h-5 w-5 ${liked ? "fill-orange-500 text-orange-500" : "text-slate-400"}`} />
              <span data-testid={`text-likes-${post.id}`}>{likes > 0 ? likes : "إعجاب"}</span>
            </button>

            {/* Comment */}
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              data-testid={`button-comment-${post.id}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[14px] font-bold transition-all active:scale-[0.97] ${
                showComments ? "text-orange-600 bg-orange-50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <MessageCircle className={`h-5 w-5 ${showComments ? "fill-orange-500/20 text-orange-500" : "text-slate-400"}`} />
              <span data-testid={`text-comments-${post.id}`}>{commentsCount > 0 ? commentsCount : "تعليق"}</span>
            </button>
          </div>

          <div className="flex items-center gap-4 text-slate-500 font-bold px-3" title="عدد المشاهدات" aria-label="عدد المشاهدات">
            {/* Views */}
            <div className="flex items-center gap-1.5 text-[14px]">
              <Eye className="h-5 w-5 text-slate-400" />
              <span data-testid={`text-views-${post.id}`}>{views}</span>
            </div>
          </div>

        </div>

        {/* Comments */}
        <AnimatePresence initial={false}>
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden bg-slate-50/50"
            >
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                 <CommentsSection
                   postId={post.id}
                   onCountChange={(delta) => setCommentsCount((n) => Math.max(0, n + delta))}
                 />
              </div>
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
              className="bg-orange-500 hover:bg-orange-600 text-white"
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
          <p className="text-sm text-slate-500">
            هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="ghost" onClick={() => setConfirmDel(false)} className="rounded-xl">
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => delM.mutate({ id: post.id }, { onSettled: () => setConfirmDel(false) })}
              disabled={delM.isPending}
              className="rounded-xl"
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
