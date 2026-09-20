import { db, notificationsTable, solutionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { createNotification, type CreateNotificationInput } from "./notifications";

export function isFirstSolutionPublication(publishedAt: Date | null): boolean {
  return publishedAt === null;
}

export function buildSolutionPublishedNotification(
  solution: {
    id: number;
    slug: string;
    publicTitle: string;
    publicExcerpt: string;
    brand: string;
    model: string;
    category: string;
    publicCategory: string;
  },
  adminId: number | null,
): CreateNotificationInput {
  const subject = [solution.brand, solution.model].filter(Boolean).join(" ").trim() || solution.publicTitle;
  const operation = solution.publicCategory || solution.publicTitle;
  return {
    type: "solution_published",
    title: "🛠️ حل تقني جديد",
    body: `${subject} — ${operation}`,
    adminId,
    audienceType: "all",
    targetType: "page",
    targetId: solution.id,
    targetPath: `/solutions/${encodeURIComponent(solution.slug)}`,
    metadata: {
      solutionTitle: solution.publicTitle,
      brand: solution.brand,
      model: solution.model,
      category: solution.publicCategory,
      cta: "عرض الحل",
    },
    dedupeKey: `solution-published-${solution.id}`,
  };
}

export async function retryPendingSolutionNotifications(): Promise<void> {
  const pending = await db.select().from(solutionsTable).where(and(
    eq(solutionsTable.status, "published"),
    isNull(solutionsTable.publicationNotificationSentAt),
  ));
  for (const solution of pending) {
    try {
      await createNotification(buildSolutionPublishedNotification(solution, null));
      await db.update(solutionsTable).set({
        publicationNotificationSentAt: new Date(),
      }).where(and(
        eq(solutionsTable.id, solution.id),
        isNull(solutionsTable.publicationNotificationSentAt),
      ));
      console.info("[solutions] Retried pending first-publication notification", { solutionId: solution.id });
    } catch (error) {
      console.error("[solutions] Pending first-publication notification retry failed", {
        solutionId: solution.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function redactExistingSolutionNotifications(): Promise<void> {
  const existing = await db.select().from(notificationsTable).where(eq(notificationsTable.type, "solution_published"));
  for (const notification of existing) {
    if (!notification.targetId) continue;
    const [solution] = await db.select().from(solutionsTable).where(eq(solutionsTable.id, notification.targetId)).limit(1);
    if (!solution) continue;
    await db.update(notificationsTable).set({
      body: solution.publicTitle,
      targetPath: `/solutions/${encodeURIComponent(solution.slug)}`,
      metadata: {
        solutionTitle: solution.publicTitle,
        brand: solution.brand,
        model: solution.model,
        category: solution.publicCategory,
        cta: "عرض الحل",
      },
    }).where(eq(notificationsTable.id, notification.id));
  }
}