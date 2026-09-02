import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCommunityPost,
  getGetCommunityFeedQueryKey,
  getGetCommunitySummaryQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import {
  CommunityMediaInput,
  CreateCommunityPostInputPostType,
  CreateCommunityPostInputCategory,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
  Input,
  Label,
} from "@/components/ui";
import { buildMediaInput, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_FILE_BYTES } from "@/lib/communityUpload";
import { ImagePlus, X, Loader2, Crown, Send, Video, FileText, BarChart2, CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";

type PickedFile = { file: File; url: string; type: 'image' | 'video' | 'file' };

const MAX_FILES = 6;
const CATEGORIES: { id: CreateCommunityPostInputCategory, label: string }[] = [
  { id: "help", label: "مساعدة عامة" },
  { id: "iphone", label: "iPhone" },
  { id: "android", label: "Android" },
  { id: "frp", label: "FRP & Unlock" },
  { id: "hw", label: "Hardware" },
  { id: "sw", label: "Software" },
  { id: "tools", label: "Tools & برامج" },
  { id: "news", label: "أخبار وتحديثات" },
];

export function CreatePostDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"compose" | "preview">("compose");
  const [category, setCategory] = useState<CreateCommunityPostInputCategory>("help");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);

  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [postMode, setPostMode] = useState<"standard" | "poll">("standard");

  const [submitting, setSubmitting] = useState(false);

  const createPost = useCreateCommunityPost({ request: getAuthHeaders() });

  const reset = () => {
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    setTitle("");
    setContent("");
    setPicked([]);
    setPollOptions(["", ""]);
    setPostMode("standard");
    setCategory("help");
    setIsQuestion(false);
    setSubmitting(false);
    setStep("compose");
  };

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    if (postMode === "poll") setPostMode("standard");

    const newFiles = Array.from(list);
    const parsedFiles: PickedFile[] = [];

    for (const f of newFiles) {
      if (f.type.startsWith("image/")) {
        if (f.size > MAX_IMAGE_BYTES) {
          toast({ title: `الصورة ${f.name} كبيرة جداً (الحد 15MB)`, variant: "destructive" });
          continue;
        }
        parsedFiles.push({ file: f, url: URL.createObjectURL(f), type: "image" });
      } else if (f.type.startsWith("video/")) {
        if (f.size > MAX_VIDEO_BYTES) {
          toast({ title: `الفيديو ${f.name} كبير جداً (الحد 120MB)`, variant: "destructive" });
          continue;
        }
        parsedFiles.push({ file: f, url: URL.createObjectURL(f), type: "video" });
      } else {
        if (f.size > MAX_FILE_BYTES) {
          toast({ title: `الملف ${f.name} كبير جداً (الحد 50MB)`, variant: "destructive" });
          continue;
        }
        parsedFiles.push({ file: f, url: URL.createObjectURL(f), type: "file" });
      }
    }

    const merged = [...picked, ...parsedFiles];
    if (merged.length > MAX_FILES) {
      toast({ title: `الحد الأقصى ${MAX_FILES} ملفات` });
    }
    setPicked(merged.slice(0, MAX_FILES));
  };

  const removeAt = (idx: number) => {
    setPicked((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  const updatePollOption = (idx: number, val: string) => {
    const next = [...pollOptions];
    next[idx] = val;
    setPollOptions(next);
  };

  const addPollOption = () => {
    if (pollOptions.length >= 6) return;
    setPollOptions([...pollOptions, ""]);
  };

  const removePollOption = (idx: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, i) => i !== idx));
  };

  const validPollOptions = pollOptions.filter(o => o.trim().length > 0);
  const canPreview = (content.trim().length > 0 || picked.length > 0 || (postMode === "poll" && validPollOptions.length >= 2)) && !submitting;

  const submit = async () => {
    if (!canPreview) return;
    setSubmitting(true);
    try {
      const media: CommunityMediaInput[] = [];
      for (let i = 0; i < picked.length; i++) {
        media.push(await buildMediaInput(picked[i].file, i, getAuthHeaders()?.headers));
      }

      let postType: CreateCommunityPostInputPostType = "text";
      if (postMode === "poll") {
        postType = "poll";
      } else if (picked.length > 0) {
        const hasVideo = picked.some(p => p.type === "video");
        const hasFile = picked.some(p => p.type === "file");
        if (hasVideo) postType = "video";
        else if (hasFile) postType = "file";
        else postType = picked.length > 1 ? "gallery" : "image";
      }

      await createPost.mutateAsync({
        data: {
          title: title.trim() || null,
          content: content.trim() || null,
          category,
          isQuestion,
          postType,
          media: media.length ? media : undefined,
          pollOptions: postMode === "poll" ? validPollOptions : undefined,
        },
      });

      queryClient.invalidateQueries({ queryKey: getGetCommunityFeedQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCommunitySummaryQueryKey() });
      toast({ title: "تم نشر منشورك بنجاح" });
      reset();
      onOpenChange(false);
    } catch {
      toast({ title: "تعذّر نشر المنشور، حاول مجدداً", variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl rounded-3xl p-0 overflow-hidden flex flex-col max-h-[90vh]" dir="rtl">
        <DialogHeader className="px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2">
            {step === "preview" && (
              <button onClick={() => setStep("compose")} className="p-1 rounded-full hover:bg-slate-100 ml-1">
                 <ChevronRight className="w-5 h-5 text-slate-500" />
              </button>
            )}
            <Crown className="h-5 w-5 text-orange-500" />
            {step === "compose" ? "مشاركة جديدة" : "معاينة المنشور"}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {step === "compose" ? (
            <>
              {/* Category & Title */}
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-700 font-bold mb-2 inline-block">القسم</Label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                        className={`px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all border ${
                          category === c.id
                            ? "bg-orange-50 text-orange-600 border-orange-200"
                            : "bg-white text-slate-600 border-slate-200 hover:border-orange-200"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-bold mb-2 inline-block">عنوان المنشور (اختياري)</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="عنوان قصير يلخص موضوعك..."
                    className="rounded-xl border-slate-200 bg-slate-50 focus:bg-white text-[15px]"
                  />
                </div>
              </div>

              {/* Content area */}
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-base font-bold text-white shadow-sm ring-1 ring-slate-100 border-2 border-white">
                  {user?.username?.trim().charAt(0) || "؟"}
                </div>
                <div className="flex-1 space-y-3">
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={5}
                    placeholder="شارك خبرتك، سؤالاً، أو إنجازاً مع Community GAB…"
                    className="resize-none rounded-2xl border-slate-200 bg-slate-50 focus:bg-white text-[15px]"
                  />

                  {/* Previews */}
                  {picked.length > 0 && postMode !== "poll" && (
                    <div className={`grid gap-2 ${picked.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
                      {picked.map((p, idx) => (
                        <div key={p.url} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          {p.type === "image" ? (
                            <img src={p.url} alt="" className="h-full w-full object-cover" />
                          ) : p.type === "video" ? (
                            <video src={p.url} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                               <FileText className="w-8 h-8 mb-2 opacity-50" />
                               <span className="text-xs truncate w-full px-2 text-center">{p.file.name}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAt(idx)}
                            disabled={submitting}
                            className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Poll Builder */}
                  {postMode === "poll" && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-slate-700 font-bold mb-2">
                        <BarChart2 className="w-5 h-5 text-orange-500" />
                        خيارات الاستطلاع
                      </div>
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={opt}
                            onChange={(e) => updatePollOption(idx, e.target.value)}
                            placeholder={`الخيار ${idx + 1}`}
                            className="bg-white rounded-xl"
                          />
                          {pollOptions.length > 2 && (
                             <button onClick={() => removePollOption(idx)} className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-white rounded-xl border border-slate-200">
                                <X className="w-4 h-4" />
                             </button>
                          )}
                        </div>
                      ))}
                      {pollOptions.length < 6 && (
                        <Button variant="outline" onClick={addPollOption} className="w-full rounded-xl border-dashed bg-transparent hover:bg-white text-slate-500">
                          + إضافة خيار
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </>
          ) : (
            /* PREVIEW STEP */
            <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-sm space-y-4">
               <div className="flex items-center gap-3">
                 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow-sm">
                   {user?.username?.trim().charAt(0) || "؟"}
                 </div>
                 <div>
                   <div className="font-black text-slate-900 text-[15px]">{user?.username}</div>
                   <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      الآن
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      {CATEGORIES.find(c => c.id === category)?.label}
                   </div>
                 </div>
               </div>

               {title && (
                 <h3 className="font-black text-[18px] text-slate-900 leading-tight">
                   {title}
                 </h3>
               )}

               {content && (
                 <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-slate-800 font-medium">
                   {content}
                 </p>
               )}

               {picked.length > 0 && postMode !== "poll" && (
                 <div className={`grid gap-2 ${picked.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                   {picked.map((item) => (
                     <div key={item.url} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                       {item.type === "image" ? (
                         <img src={item.url} alt="" className="max-h-64 w-full object-contain" />
                       ) : item.type === "video" ? (
                         <video src={item.url} controls preload="metadata" className="max-h-64 w-full bg-black object-contain" />
                       ) : (
                         <div className="flex items-center gap-3 p-4">
                           <FileText className="h-6 w-6 shrink-0 text-purple-500" />
                           <div className="min-w-0">
                             <p className="truncate text-sm font-black text-slate-800">{item.file.name}</p>
                             <p className="mt-0.5 text-xs font-bold text-slate-400">
                               {(item.file.size / 1024 / 1024).toFixed(2)} MB
                             </p>
                           </div>
                         </div>
                       )}
                     </div>
                   ))}
                 </div>
               )}

               {postMode === "poll" && validPollOptions.length >= 2 && (
                 <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                   {validPollOptions.map((opt, idx) => (
                     <div key={idx} className="w-full text-right rounded-xl border border-slate-200 bg-white p-3 text-[14px] font-bold text-slate-700">
                       {opt}
                     </div>
                   ))}
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 z-10">

          {step === "compose" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 whitespace-nowrap">
                  <ImagePlus className="h-4 w-4 text-emerald-500" />
                  صور
                  <input type="file" accept="image/*" multiple hidden disabled={submitting} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 whitespace-nowrap">
                  <Video className="h-4 w-4 text-blue-500" />
                  فيديو
                  <input type="file" accept="video/*" multiple hidden disabled={submitting} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 whitespace-nowrap">
                  <FileText className="h-4 w-4 text-purple-500" />
                  ملف
                  <input type="file" accept="*/*" multiple hidden disabled={submitting} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
                </label>
                <button
                  onClick={() => { setPostMode(postMode === "poll" ? "standard" : "poll"); setPicked([]); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                    postMode === "poll" ? "bg-orange-50 text-orange-600 border-orange-200" : "bg-white text-slate-600 border-slate-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200"
                  }`}
                >
                  <BarChart2 className={`h-4 w-4 ${postMode === "poll" ? "text-orange-600" : "text-amber-500"}`} />
                  استطلاع
                </button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => setIsQuestion(!isQuestion)}
                  className={`flex items-center gap-1.5 text-sm font-bold transition-colors ${isQuestion ? "text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isQuestion ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"}`}>
                    {isQuestion && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  نشر كسؤال
                </button>
                <Button
                  onClick={() => setStep("preview")}
                  disabled={!canPreview}
                  className="rounded-xl px-8 bg-slate-900 hover:bg-slate-800 text-white font-black shadow-sm"
                >
                  معاينة
                  <ChevronRight className="ml-2 h-4 w-4 rotate-180" />
                </Button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-xl bg-orange-500/5 px-3 py-2 text-xs font-bold text-slate-500 border border-orange-100/50">
                <Crown className="ml-1 inline h-3.5 w-3.5 text-orange-500" />
                الوسائط حصرية لأعضاء VIP
              </div>
              <Button
                onClick={submit}
                disabled={submitting}
                className="rounded-xl px-8 bg-orange-500 hover:bg-orange-600 text-white font-black shadow-sm shadow-orange-500/20 active:scale-[0.98] transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جارٍ النشر…
                  </>
                ) : (
                  <>
                    <Send className="ml-2 h-4 w-4" />
                    تأكيد ونشر
                  </>
                )}
              </Button>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
