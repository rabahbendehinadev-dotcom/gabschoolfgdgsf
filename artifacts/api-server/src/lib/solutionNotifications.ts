import { db, solutionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { createNotification, type CreateNotificationInput } from "./notifications";

export function isFirstSolutionPublication(publishedAt: Date | null): boolean {
  return publishedAt === null;
}

export function buildSolutionPublishedNotification(
  solution: {
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    brand: string;
    model: string;
    category: string;
    tool: string;
  },
  adminId: number | null,
): CreateNotificationInput {
  const subject = [solution.brand, solution.model].filter(Boolean).join(" ").trim() || solution.title;
  const operation = solution.category || solution.title;
  const tool = solution.tool ? ` باستخدام ${solution.tool}` : "";
  return {
    type: "solution_published",
    title: "🛠️ حل تقني جديد",
    body: `${subject} — ${operation}${tool}`,
    adminId,
    audienceType: "all",
    targetType: "page",
    targetId: solution.id,
    targetPath: `/solutions/${encodeURIComponent(solution.slug)}`,
    metadata: {
      solutionTitle: solution.title,
      brand: solution.brand,
      model: solution.model,
      category: solution.category,
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