export type UserLocale = "ar" | "fr" | "en";

const titles: Record<string, Record<UserLocale, string>> = {
  solution_published: { ar: "🛠️ حل تقني جديد", fr: "🛠️ Nouvelle solution technique", en: "🛠️ New technical solution" },
  video: { ar: "🎬 فيديو جديد", fr: "🎬 Nouvelle vidéo", en: "🎬 New video" },
  community_vip_post: { ar: "منشور جديد", fr: "Nouvelle publication", en: "New post" },
  comment: { ar: "تعليق جديد", fr: "Nouveau commentaire", en: "New comment" },
  reply: { ar: "رد جديد", fr: "Nouvelle réponse", en: "New reply" },
  like: { ar: "إعجاب جديد", fr: "Nouveau j'aime", en: "New like" },
  vip: { ar: "إشعار VIP", fr: "Notification VIP", en: "VIP notification" },
  system: { ar: "إشعار من GAB ONLINE", fr: "Notification GAB ONLINE", en: "GAB ONLINE notification" },
};

export function normalizeLocale(value: unknown): UserLocale {
  return value === "fr" || value === "en" ? value : "ar";
}

/** Localizes only platform-generated notification titles; authored bodies remain unchanged. */
export function localizedNotificationTitle(type: string, fallback: string, locale: unknown): string {
  return titles[type]?.[normalizeLocale(locale)] ?? fallback;
}

/** Localizes generated community activity copy while preserving authored text. */
export function localizedNotificationBody(
  type: string,
  fallback: string,
  locale: unknown,
  metadata: Record<string, unknown> = {},
): string {
  const actor = typeof metadata.actorName === "string" ? metadata.actorName : "";
  const snippet = typeof metadata.snippet === "string" ? metadata.snippet : "";
  if (!actor) return fallback;
  const lang = normalizeLocale(locale);
  if (type === "like") {
    return lang === "fr"
      ? `${actor} a aimé votre publication`
      : lang === "en"
        ? `${actor} liked your post`
        : `أعجب ${actor} بمنشورك`;
  }
  if (type === "comment") {
    return lang === "fr"
      ? `${actor} a commenté : ${snippet}`
      : lang === "en"
        ? `${actor} commented: ${snippet}`
        : `علّق ${actor}: ${snippet}`;
  }
  if (type === "reply") {
    return lang === "fr"
      ? `${actor} a répondu : ${snippet}`
      : lang === "en"
        ? `${actor} replied: ${snippet}`
        : `رد ${actor}: ${snippet}`;
  }
  return fallback;
}