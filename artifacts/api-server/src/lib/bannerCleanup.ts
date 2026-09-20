import { sql } from "drizzle-orm";
import { db, heroBannerCleanupQueueTable } from "@workspace/db";
import { deleteBannerImage } from "./bannerStorage";

type InsertExecutor = Pick<typeof db, "insert">;

export async function enqueueBannerCleanup(executor: InsertExecutor, objectPath: string | null | undefined) {
  if (!objectPath) return;
  await executor.insert(heroBannerCleanupQueueTable)
    .values({ objectPath })
    .onConflictDoNothing({ target: heroBannerCleanupQueueTable.objectPath });
}

export async function disposeBannerPath(objectPath: string | null | undefined) {
  if (!objectPath) return;
  try {
    await deleteBannerImage(objectPath);
  } catch (error) {
    await enqueueBannerCleanup(db, objectPath);
    await db.update(heroBannerCleanupQueueTable).set({
      attempts: sql`${heroBannerCleanupQueueTable.attempts} + 1`,
      lastError: error instanceof Error ? error.message : "Storage deletion failed",
      updatedAt: new Date(),
    }).where(sql`${heroBannerCleanupQueueTable.objectPath} = ${objectPath}`);
  }
}

export async function drainBannerCleanupQueue() {
  try {
    await db.transaction(async tx => {
      const result = await tx.execute(sql`
        SELECT id, object_path
        FROM hero_banner_cleanup_queue
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 50
      `);
      for (const row of result.rows as Array<{ id: number; object_path: string }>) {
        try {
          await deleteBannerImage(row.object_path);
          await tx.delete(heroBannerCleanupQueueTable).where(sql`${heroBannerCleanupQueueTable.id} = ${row.id}`);
        } catch (error) {
          await tx.update(heroBannerCleanupQueueTable).set({
            attempts: sql`${heroBannerCleanupQueueTable.attempts} + 1`,
            lastError: error instanceof Error ? error.message : "Storage deletion failed",
            updatedAt: new Date(),
          }).where(sql`${heroBannerCleanupQueueTable.id} = ${row.id}`);
        }
      }
    });
  } catch {
    // Startup and request cleanup must not prevent the API from serving traffic.
  }
}