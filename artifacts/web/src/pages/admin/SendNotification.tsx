import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useSendAdminNotification,
  getAdminNotifications,
  getGetAdminNotificationsQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import {
  SendNotificationInputAudienceType,
  SendNotificationInputTargetType,
} from "@workspace/api-client-react/src/generated/api.schemas";
import type { SendNotificationInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import {
  Button,
  Card,
  Input,
  Label,
  Textarea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Send, Megaphone, Loader2, Users, CheckCheck, Eye } from "lucide-react";

type LinkKind = "none" | "community" | "lesson" | "custom";

const AUDIENCE_LABELS: Record<string, string> = {
  all: "كل المستخدمين",
  vip: "VIP فقط",
  normal: "العاديون فقط",
  user: "مستخدم محدد",
  category: "تصنيف",
};

const AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: SendNotificationInputAudienceType.all, label: AUDIENCE_LABELS.all },
  { value: SendNotificationInputAudienceType.vip, label: AUDIENCE_LABELS.vip },
  { value: SendNotificationInputAudienceType.normal, label: AUDIENCE_LABELS.normal },
  { value: SendNotificationInputAudienceType.user, label: AUDIENCE_LABELS.user },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-DZ", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminSendNotification() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<string>(SendNotificationInputAudienceType.all);
  const [audienceValue, setAudienceValue] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("none");
  const [lessonId, setLessonId] = useState("");
  const [customPath, setCustomPath] = useState("");

  const listKey = getGetAdminNotificationsQueryKey();
  const { data: log, isLoading: logLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => getAdminNotifications(getAdminAuthHeaders()),
  });

  const sendMutation = useSendAdminNotification({ request: getAdminAuthHeaders() });

  const resetForm = () => {
    setTitle("");
    setBody("");
    setAudienceType(SendNotificationInputAudienceType.all);
    setAudienceValue("");
    setLinkKind("none");
    setLessonId("");
    setCustomPath("");
  };

  const buildTarget = (): Pick<SendNotificationInput, "targetType" | "targetId" | "targetPath"> => {
    switch (linkKind) {
      case "community":
        return { targetType: SendNotificationInputTargetType.post, targetPath: "/community" };
      case "lesson":
        return {
          targetType: SendNotificationInputTargetType.lesson,
          targetId: Number(lessonId),
          targetPath: `/videos/${Number(lessonId)}`,
        };
      case "custom":
        return { targetType: SendNotificationInputTargetType.page, targetPath: customPath.trim() };
      default:
        return { targetType: SendNotificationInputTargetType.none, targetPath: null };
    }
  };

  const submit = () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "بيانات ناقصة", description: "الرجاء إدخال العنوان والنص.", variant: "destructive" });
      return;
    }
    if (audienceType === SendNotificationInputAudienceType.user && !audienceValue.trim()) {
      toast({ title: "مستخدم مطلوب", description: "أدخل معرّف المستخدم (ID) المستهدف.", variant: "destructive" });
      return;
    }
    if (linkKind === "lesson" && (!lessonId.trim() || Number.isNaN(Number(lessonId)))) {
      toast({ title: "رقم الدرس مطلوب", description: "أدخل رقم الدرس (ID) الصحيح.", variant: "destructive" });
      return;
    }
    if (linkKind === "custom") {
      const p = customPath.trim();
      const safe =
        !!p &&
        p.startsWith("/") &&
        !p.startsWith("//") &&
        !p.includes("\\") &&
        !p.includes("://") &&
        !/\s/.test(p);
      if (!safe) {
        toast({
          title: "الرابط غير صالح",
          description: "أدخل مساراً داخلياً يبدأ بـ / مثل: /community",
          variant: "destructive",
        });
        return;
      }
    }

    const payload: SendNotificationInput = {
      title: title.trim(),
      body: body.trim(),
      audienceType: audienceType as SendNotificationInput["audienceType"],
      audienceValue:
        audienceType === SendNotificationInputAudienceType.user ? audienceValue.trim() : null,
      ...buildTarget(),
    };

    sendMutation.mutate(
      { data: payload },
      {
        onSuccess: (res) => {
          toast({
            title: "تم الإرسال ✅",
            description: `وصل الإشعار إلى ${res.recipientCount} مستخدم.`,
          });
          resetForm();
          queryClient.invalidateQueries({ queryKey: listKey });
        },
        onError: () => {
          toast({ title: "فشل الإرسال", description: "حدث خطأ أثناء إرسال الإشعار.", variant: "destructive" });
        },
      },
    );
  };

  const rows = log?.items ?? [];

  return (
    <div className="space-y-8 rtl" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Megaphone className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">إرسال إشعار</h1>
          <p className="text-sm text-muted-foreground">أرسل تنبيهاً إلى جمهور محدد من المستخدمين.</p>
        </div>
      </div>

      <Card className="space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="notif-title">العنوان</Label>
          <Input
            id="notif-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: درس جديد متاح الآن"
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notif-body">النص</Label>
          <Textarea
            id="notif-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="اكتب نص الإشعار هنا..."
            rows={4}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>الجمهور المستهدف</Label>
            <Select value={audienceType} onValueChange={setAudienceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {audienceType === SendNotificationInputAudienceType.user && (
            <div className="space-y-2">
              <Label htmlFor="audience-user">معرّف المستخدم (ID)</Label>
              <Input
                id="audience-user"
                value={audienceValue}
                onChange={(e) => setAudienceValue(e.target.value)}
                placeholder="مثال: 42"
                dir="ltr"
                className="text-left"
              />
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>رابط الوجهة (اختياري)</Label>
            <Select value={linkKind} onValueChange={(v) => setLinkKind(v as LinkKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                <SelectItem value="community">صفحة المجتمع</SelectItem>
                <SelectItem value="lesson">درس محدد</SelectItem>
                <SelectItem value="custom">رابط مخصص</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {linkKind === "lesson" && (
            <div className="space-y-2">
              <Label htmlFor="lesson-id">رقم الدرس (ID)</Label>
              <Input
                id="lesson-id"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                placeholder="مثال: 7"
                dir="ltr"
                className="text-left"
              />
            </div>
          )}

          {linkKind === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-path">المسار</Label>
              <Input
                id="custom-path"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="مثال: /community"
                dir="ltr"
                className="text-left"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={submit} disabled={sendMutation.isPending} className="gap-2">
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            إرسال الإشعار
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">سجل الإشعارات المُرسلة</h2>
        </div>

        <Card className="overflow-hidden">
          {logLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              لم يتم إرسال أي إشعار بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-white/10 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">العنوان</th>
                    <th className="px-4 py-3 font-medium">الجمهور</th>
                    <th className="px-4 py-3 font-medium">المُرسِل</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <CheckCheck className="h-3.5 w-3.5" /> وصلت
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> فُتحت
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{r.title}</div>
                        <div className="line-clamp-1 max-w-[260px] text-xs text-muted-foreground">
                          {r.body}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="font-normal">
                          {AUDIENCE_LABELS[r.audienceType ?? ""] ?? r.audienceType ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.senderName ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{r.recipientCount}</td>
                      <td className="px-4 py-3 font-semibold text-primary">{r.openedCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
