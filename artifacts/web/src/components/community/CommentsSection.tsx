import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCommunityComments,
  useCreateCommunityComment,
  useDeleteCommunityComment,
  getGetCommunityCommentsQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import {
  CommunityComment,
  CommunityReply,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui";
import { Crown, Loader2, Send, Trash2, CornerDownLeft } from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  return `قبل ${d} ي`;
}

function Avatar({ name, vip, imageUrl }: { name: string; vip: boolean; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-full object-cover shadow-sm"
      />
    );
  }
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${
        vip ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-slate-400 to-slate-500"
      }`}
    >
      {name.trim().charAt(0) || "؟"}
    </div>
  );
}

function CommentBubble({
  author,
  body,
  createdAt,
  canDelete,
  onDelete,
  deleting,
  onReply,
}: {
  author: CommunityComment["author"];
  body: string;
  createdAt: string;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
  onReply?: () => void;
}) {
  const vip = author.accountType === "vip";
  return (
    <div className="flex gap-2.5">
      <Avatar name={author.username} vip={vip} imageUrl={author.profileImageUrl} />
      <div className="flex-1">
        <div className="rounded-2xl rounded-tr-sm bg-muted/70 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-foreground">{author.username}</span>
            {vip && <Crown className="h-3 w-3 text-orange-500" />}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {body}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-3 px-1 text-xs text-muted-foreground">
          <span>{timeAgo(createdAt)}</span>
          {onReply && (
            <button type="button" onClick={onReply} className="font-semibold hover:text-primary">
              رد
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-1 font-semibold text-destructive/80 hover:text-destructive disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              حذف
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentsSection({
  postId,
  onCountChange,
}: {
  postId: number;
  onCountChange?: (delta: number) => void;
}) {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const commentsKey = getGetCommunityCommentsQueryKey(postId);
  const { data, isLoading } = useGetCommunityComments(postId, {
    request: getAuthHeaders(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: commentsKey });

  const createComment = useCreateCommunityComment({
    request: getAuthHeaders(),
    mutation: {
      onSuccess: () => {
        invalidate();
        onCountChange?.(1);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (msg === "PROFILE_PICTURE_REQUIRED") {
          toast({ title: "يجب إضافة صورة شخصية أولاً للتعليق", variant: "destructive" });
        } else {
          toast({ title: "تعذّر إرسال التعليق", variant: "destructive" });
        }
      },
    },
  });

  const deleteComment = useDeleteCommunityComment({
    request: getAuthHeaders(),
    mutation: {
      onSuccess: () => {
        invalidate();
        onCountChange?.(-1);
      },
      onError: () => toast({ title: "تعذّر حذف التعليق", variant: "destructive" }),
    },
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdd = () => {
    const text = body.trim();
    if (!text) return;
    createComment.mutate({ id: postId, data: { body: text } });
    setBody("");
  };

  const handleReply = (parentId: number) => {
    const text = replyBody.trim();
    if (!text) return;
    createComment.mutate({ id: postId, data: { body: text, parentId } });
    setReplyBody("");
    setReplyTo(null);
  };

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deleteComment.mutate({ id }, { onSettled: () => setDeletingId(null) });
  };

  const comments = data?.comments ?? [];

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      {/* New comment */}
      {user ? (
        <div className="flex items-end gap-2">
          <Avatar name={user.username} vip={user.accountType === "vip"} imageUrl={user.profileImageUrl} />
          <div className="flex flex-1 items-end gap-2 rounded-2xl border border-border bg-background px-3 py-1.5 focus-within:border-primary/50">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              rows={1}
              placeholder="اكتب تعليقاً…"
              className="max-h-28 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              onClick={handleAdd}
              disabled={!body.trim() || createComment.isPending}
            >
              {createComment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-muted/60 px-4 py-3 text-center text-sm text-muted-foreground">
          <Link href="/login">
            <span className="cursor-pointer font-bold text-primary hover:underline">سجّل الدخول</span>
          </Link>{" "}
          للمشاركة في النقاش
        </div>
      )}

      {/* List */}
      <div className="mt-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">كن أول من يعلّق</p>
        ) : (
          comments.map((c: CommunityComment) => (
            <div key={c.id}>
              <CommentBubble
                author={c.author}
                body={c.body}
                createdAt={c.createdAt}
                canDelete={c.canDelete}
                deleting={deletingId === c.id}
                onDelete={() => handleDelete(c.id)}
                onReply={user ? () => setReplyTo(replyTo === c.id ? null : c.id) : undefined}
              />

              {/* Replies */}
              {c.replies?.length > 0 && (
                <div className="mr-11 mt-3 space-y-3 border-r-2 border-border/50 pr-3">
                  {c.replies.map((r: CommunityReply) => (
                    <CommentBubble
                      key={r.id}
                      author={r.author}
                      body={r.body}
                      createdAt={r.createdAt}
                      canDelete={r.canDelete}
                      deleting={deletingId === r.id}
                      onDelete={() => handleDelete(r.id)}
                    />
                  ))}
                </div>
              )}

              {/* Reply box */}
              <AnimatePresence>
                {replyTo === c.id && user && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mr-11 mt-2 overflow-hidden"
                  >
                    <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-1.5 focus-within:border-primary/50">
                      <CornerDownLeft className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleReply(c.id);
                          }
                        }}
                        rows={1}
                        autoFocus
                        placeholder={`الرد على ${c.author.username}…`}
                        className="max-h-28 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
                      />
                      <Button
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full"
                        onClick={() => handleReply(c.id)}
                        disabled={!replyBody.trim() || createComment.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
