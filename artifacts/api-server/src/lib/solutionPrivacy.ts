import { db, solutionsTable, solutionSlugHistoryTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { safePublicMetadata } from "./solutions";

export async function repairSolutionPublicMetadata(): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('solutions-public-metadata'))`);
    const rows = await tx.select().from(solutionsTable).orderBy(asc(solutionsTable.id));
    const history = await tx.select().from(solutionSlugHistoryTable);
    const reserved = new Set<string>();
    const planned = rows.map(row => {
      const metadata = safePublicMetadata(row);
      let slug = metadata.slug;
      const unavailable = (candidate: string) => reserved.has(candidate) || history.some(item => item.oldSlug === candidate && item.solutionId !== row.id);
      if (unavailable(slug)) slug = `${slug}-${row.id}`;
      let suffix = 2;
      while (unavailable(slug)) slug = `${metadata.slug}-${row.id}-${suffix++}`;
      reserved.add(slug);
      return { row, metadata, slug };
    });
    const changed = planned.filter(item => item.row.slug !== item.slug);
    const occupied = new Set([...rows.map(row => row.slug), ...planned.map(item => item.slug)]);
    const temporary = new Map<number, string>();
    for (const item of changed) {
      let candidate = `privacy-safe-temp-${item.row.id}`;
      let suffix = 2;
      while (occupied.has(candidate)) candidate = `privacy-safe-temp-${item.row.id}-${suffix++}`;
      occupied.add(candidate);
      temporary.set(item.row.id, candidate);
    }
    for (const item of changed) {
      await tx.insert(solutionSlugHistoryTable).values({
        oldSlug: item.row.slug,
        solutionId: item.row.id,
      }).onConflictDoNothing();
      await tx.update(solutionsTable).set({ slug: temporary.get(item.row.id)! }).where(eq(solutionsTable.id, item.row.id));
    }
    for (const item of planned) {
      await tx.update(solutionsTable).set({
        slug: item.slug,
        publicTitle: item.metadata.title,
        publicExcerpt: item.metadata.excerpt,
        publicCategory: item.metadata.category,
        ...(item.row.publicTitle ? {} : { coverImageId: null, aiCoverImageId: null, customCoverImageId: null }),
      }).where(eq(solutionsTable.id, item.row.id));
    }
  });
}