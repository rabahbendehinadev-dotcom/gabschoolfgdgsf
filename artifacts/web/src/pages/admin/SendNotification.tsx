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
  all:      "Tous les utilisateurs",
  vip:      "VIP seulement",
  normal:   "Standard seulement",
  user:     "Utilisateur spécifique",
  category: "Catégorie",
};

const AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: SendNotificationInputAudienceType.all,    label: AUDIENCE_LABELS.all },
  { value: SendNotificationInputAudienceType.vip,    label: AUDIENCE_LABELS.vip },
  { value: SendNotificationInputAudienceType.normal, label: AUDIENCE_LABELS.normal },
  { value: SendNotificationInputAudienceType.user,   label: AUDIENCE_LABELS.user },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
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
      toast({ title: "Données manquantes", description: "Veuillez saisir le titre et le contenu.", variant: "destructive" });
      return;
    }
    if (audienceType === SendNotificationInputAudienceType.user && !audienceValue.trim()) {
      toast({ title: "Utilisateur requis", description: "Saisissez l'identifiant de l'utilisateur cible.", variant: "destructive" });
      return;
    }
    if (linkKind === "lesson" && (!lessonId.trim() || Number.isNaN(Number(lessonId)))) {
      toast({ title: "ID de leçon requis", description: "Saisissez l'identifiant correct de la leçon.", variant: "destructive" });
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
          title: "Lien invalide",
          description: "Saisissez un chemin interne commençant par / ex: /community",
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
            title: "Envoyé ✅",
            description: `Notification envoyée à ${res.recipientCount} utilisateur(s).`,
          });
          resetForm();
          queryClient.invalidateQueries({ queryKey: listKey });
        },
        onError: () => {
          toast({ title: "Échec de l'envoi", description: "Une erreur est survenue lors de l'envoi.", variant: "destructive" });
        },
      },
    );
  };

  const rows = log?.items ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Megaphone className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Envoyer une notification</h1>
          <p className="text-sm text-muted-foreground">Envoyez une alerte à un public ciblé d'utilisateurs.</p>
        </div>
      </div>

      <Card className="space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="notif-title">Titre</Label>
          <Input
            id="notif-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Nouvelle leçon disponible"
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notif-body">Contenu</Label>
          <Textarea
            id="notif-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Saisissez le contenu de la notification..."
            rows={4}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Public cible</Label>
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
              <Label htmlFor="audience-user">Identifiant utilisateur (ID)</Label>
              <Input
                id="audience-user"
                value={audienceValue}
                onChange={(e) => setAudienceValue(e.target.value)}
                placeholder="Ex: 42"
                dir="ltr"
                className="text-left"
              />
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Lien de destination (optionnel)</Label>
            <Select value={linkKind} onValueChange={(v) => setLinkKind(v as LinkKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                <SelectItem value="community">Communauté GAB</SelectItem>
                <SelectItem value="lesson">Leçon spécifique</SelectItem>
                <SelectItem value="custom">Lien personnalisé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {linkKind === "lesson" && (
            <div className="space-y-2">
              <Label htmlFor="lesson-id">ID de la leçon</Label>
              <Input
                id="lesson-id"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                placeholder="Ex: 7"
                dir="ltr"
                className="text-left"
              />
            </div>
          )}

          {linkKind === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-path">Chemin</Label>
              <Input
                id="custom-path"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="Ex: /community"
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
            Envoyer la notification
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Historique des notifications</h2>
        </div>

        <Card className="overflow-hidden">
          {logLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Aucune notification envoyée.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Titre</th>
                    <th className="px-4 py-3 font-medium">Public</th>
                    <th className="px-4 py-3 font-medium">Expéditeur</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <CheckCheck className="h-3.5 w-3.5" /> Reçus
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> Ouverts
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium">Heure</th>
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
