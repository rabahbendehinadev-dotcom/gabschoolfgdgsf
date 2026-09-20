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
import { useLocale } from "@/i18n";
import { commerceMessage } from "@/i18n/communityCommerceMessages";
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

function timeAgo(iso: string, locale: "ar" | "fr" | "en"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return commerceMessage(locale, "now");
  if (m < 60) return commerceMessage(locale, "minsAgo").replace("{m}", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return commerceMessage(locale, "hoursAgo").replace("{h}", String(h));
  const d = Math.floor(h / 24);
  if (d < 30) return commerceMessage(locale, "daysAgo").replace("{d}", String(d));
  return new Date(iso).toLocaleDateString(locale);
}

export function PostCard({ post, index = 0 }: { post: CommunityPost; index?: number }) {
  const { locale, direction } = useLocale();
  const m = (key: string) => commerceMessage(locale, key);
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
         toast({ title: m("postDeleted") });
      },
      onError: () => toast({ title: m("postDeleteFailed"), variant: "destructive" }),
    },
  });

  const updM = useUpdateCommunityPost({
    request: getAuthHeaders(),
    mutation: {
      onSuccess: () => {
        invalidateFeed();
        setEditOpen(false);
         toast({ title: m("postUpdated") });
      },
      onError: () => toast({ title: m("postUpdateFailed"), variant: "destructive" }),
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
      toast({ title: m("loginLike") });
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
      toast({ title: m("loginVote") });
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
      <Card id={`post-${post.id}`} className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow scroll-mt-24">
        {/* Header */}
        <div className="flex items-start justify-between p-4 pb-3">
          <div className="flex items-center gap-3">
            {post.author.profileImageUrl && !authorAvatarFailed ? (
              <img
                src={post.author.profileImageUrl}
                alt=""
                onError={() => setAuthorAvatarFailed(true)}
                className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm border border-slate-100"
              />
            ) : (
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow-sm ${
                  vip
                    ? "bg-gradient-to-br from-amber-400 to-orange-500"
                    : "bg-gradient-to-br from-slate-400 to-slate-600"
                }`}
              >
                {post.author.username.trim().charAt(0).toUpperCase() || "؟"}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                <span className="truncate font-black text-slate-900 text-[15px]">{post.author.username}</span>
                {/* Role Badges */}
                {(post.author as any).role === "admin" ? (
                  <span className="flex items-center px-1.5 py-0.5 bg-red-50 rounded text-[10px] font-black text-red-600 tracking-wide">
                    {m("admin")}
                  </span>
                ) : (post.author as any).role === "formateur" ? (
                  <span className="flex items-center px-1.5 py-0.5 bg-emerald-50 rounded text-[10px] font-black text-emerald-600 tracking-wide">
                    {m("trainer")}
                  </span>
                ) : vip ? (
                  <span className="flex items-center px-1.5 py-0.5 bg-amber-50 rounded text-[10px] font-black text-amber-600 tracking-wide">
                    VIP <CheckCircle2 className="w-3 h-3 ml-0.5 text-blue-500 fill-blue-500/20" />
                  </span>
                ) : (post.author as any).role === "student" ? (
                  <span className="flex items-center px-1.5 py-0.5 bg-blue-50 rounded text-[10px] font-black text-blue-600 tracking-wide">
                    {m("student")}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-slate-500 font-bold mt-0.5">
                <span>{timeAgo(post.createdAt, locale)}</span>
                {post.category && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="text-slate-600">{post.category}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {post.isFeatured && (
              <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded text-[10px] font-bold" title={m("featured")}>
                <Star className="h-3 w-3 fill-current" />
              </span>
            )}
            {post.isPinned && (
              <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded text-[10px] font-bold" title={m("pinned")}>
                <Pin className="h-3 w-3 fill-current" />
              </span>
            )}
            {post.isImportant && (
              <span className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-600 rounded text-[10px] font-bold" title={m("important")}>
                <AlertCircle className="h-3 w-3" />
              </span>
            )}
            {solved && (
              <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold" title={m("solved")}>
                <CheckCircle2 className="h-3 w-3" />
              </span>
            )}
            {post.isQuestion && (
              <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-bold" title={m("question")}>
                {m("question")}
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
                  aria-label={m("postOptions").replace("{name}", post.author.username)}
                  data-testid={`button-menu-${post.id}`}
                >
                  <MoreVertical className="h-4 w-4" />
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
                              {solved ? m("reopenQuestion") : m("markSolved")}
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
                            <Pencil className="h-4 w-4 text-slate-400" /> {m("editPost")}
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
                              <Trash2 className="h-4 w-4 text-red-500" /> {m("delete")}
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
                          <Flag className="h-4 w-4 text-slate-400" /> {m("report")}
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
          <div className="px-4 pt-1 pb-4" dir="auto">
            {post.title && (
              <h3 className="font-black text-[17px] text-slate-900 mb-1.5 leading-tight" dir="auto">
                {post.title}
              </h3>
            )}
            {post.content && (
              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-700 font-medium" dir="auto">
                {post.content}
              </p>
            )}
          </div>
        )}

        {/* Poll */}
        {post.postType === "poll" && post.pollOptions && post.pollOptions.length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 text-slate-700 font-bold text-sm">
                <BarChart2 className="w-4 h-4 text-orange-500" />
                {m("pollLabel")}
              </div>
              <div className="space-y-2">
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
                      className={`relative w-full text-right overflow-hidden rounded-xl border p-2.5 transition-all ${
                        isMyVote
                          ? "bg-orange-50 border-orange-200"
                          : post.myPollVote != null
                          ? "bg-white border-slate-200"
                          : "bg-white border-slate-200 hover:border-orange-200 hover:bg-orange-50/50"
                      }`}
                    >
                      {/* Progress Bar */}
                      {post.myPollVote != null && (
                        <div
                          className={`absolute top-0 right-0 bottom-0 opacity-10 ${
                            isMyVote ? "bg-orange-600" : "bg-slate-500"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      )}

                      <div className="relative z-10 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            isMyVote ? "border-orange-500" : "border-slate-300"
                          }`}>
                            {isMyVote && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                          </div>
                          <span className={`text-[14px] font-bold truncate ${isMyVote ? "text-orange-900" : "text-slate-700"}`} dir="auto">
                            {opt}
                          </span>
                        </div>
                        {post.myPollVote != null && (
                          <span className={`text-xs font-black shrink-0 ${isMyVote ? "text-orange-600" : "text-slate-500"}`}>
                            {percentage}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-[12px] font-bold text-slate-500">
                {totalPollVotes} {m("vote")}
              </div>
            </div>
          </div>
        )}

        {/* Media */}
        {post.media.length > 0 && (
          <div className="px-4 pb-4">
            <MediaGrid media={post.media} username={post.author.username} />
          </div>
        )}

        {/* Actions Footer */}
        <div className="mx-4 mb-2 border-t border-slate-100 flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={toggleLike}
              data-testid={`button-like-${post.id}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all active:scale-[0.97] ${
                liked ? "text-orange-600 bg-orange-50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <ThumbsUp className={`h-4 w-4 ${liked ? "fill-orange-500 text-orange-500" : "text-slate-400"}`} />
              <span data-testid={`text-likes-${post.id}`}>{likes > 0 ? likes : m("like")}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              data-testid={`button-comment-${post.id}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all active:scale-[0.97] ${
                showComments ? "text-orange-600 bg-orange-50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <MessageCircle className={`h-4 w-4 ${showComments ? "fill-orange-500/20 text-orange-500" : "text-slate-400"}`} />
              <span data-testid={`text-comments-${post.id}`}>{commentsCount > 0 ? commentsCount : m("comment")}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 font-bold px-2 text-[12px]" title={m("views")} aria-label={m("views")}>
            <Eye className="h-4 w-4 opacity-70" />
            <span data-testid={`text-views-${post.id}`}>{views}</span>
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
        <DialogContent className="rounded-3xl" dir={direction}>
          <DialogHeader>
            <DialogTitle>{m("editPost")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={5}
            className="resize-none rounded-2xl"
            placeholder={m("postBodyPlaceholder")}
            dir="auto"
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              {m("cancel")}
            </Button>
            <Button
              onClick={() => updM.mutate({ id: post.id, data: { content: editText.trim() || null } })}
              disabled={updM.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {updM.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {m("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={(v) => { if (!reporting) { setReportOpen(v); if (!v) { setReportReason(""); setReportSent(false); } } }}>
        <DialogContent className="rounded-3xl" dir={direction}>
          <DialogHeader>
            <DialogTitle>{m("reportPost")}</DialogTitle>
          </DialogHeader>
          {reportSent ? (
            <p className="py-4 text-center text-sm font-semibold text-green-600">
              {m("reportSent")}
            </p>
          ) : (
            <>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={3}
                className="resize-none rounded-2xl"
                placeholder={m("reportReason")}
              />
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reporting}>{m("cancel")}</Button>
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
                  {m("sendReport")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent className="rounded-3xl" dir={direction}>
          <DialogHeader>
            <DialogTitle>{m("deletePost")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            {m("confirmDelete")}
          </p>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="ghost" onClick={() => setConfirmDel(false)} className="rounded-xl">
              {m("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => delM.mutate({ id: post.id }, { onSettled: () => setConfirmDel(false) })}
              disabled={delM.isPending}
              className="rounded-xl"
            >
              {delM.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {m("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
