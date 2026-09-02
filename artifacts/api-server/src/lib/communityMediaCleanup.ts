import { db, communityPostMediaTable, communityPostsTable } from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

function pathsFromMedia(
  media: Pick<
    typeof communityPostMediaTable.$inferSelect,
    "objectPath" | "previewObjectPath" | "thumbnailObjectPath"
  >,
): string[] {
  return [media.objectPath, media.previewObjectPath, media.thumbnailObjectPath].filter(
    (path): path is string => Boolean(path),
  );
}

export async function deleteCommunityMediaForPosts(postIds: number[]): Promise<void> {
  const uniquePostIds = [...new Set(postIds)];
  if (uniquePostIds.length === 0) return;

  const targetMedia = await db
    .select({
      objectPath: communityPostMediaTable.objectPath,
      previewObjectPath: communityPostMediaTable.previewObjectPath,
      thumbnailObjectPath: communityPostMediaTable.thumbnailObjectPath,
    })
    .from(communityPostMediaTable)
    .where(inArray(communityPostMediaTable.postId, uniquePostIds));

  const candidatePaths = [...new Set(targetMedia.flatMap(pathsFromMedia))];
  if (candidatePaths.length === 0) return;

  const allReferences = await db
    .select({
      postId: communityPostMediaTable.postId,
      objectPath: communityPostMediaTable.objectPath,
      previewObjectPath: communityPostMediaTable.previewObjectPath,
      thumbnailObjectPath: communityPostMediaTable.thumbnailObjectPath,
    })
    .from(communityPostMediaTable)
    .where(
      or(
        inArray(communityPostMediaTable.objectPath, candidatePaths),
        inArray(communityPostMediaTable.previewObjectPath, candidatePaths),
        inArray(communityPostMediaTable.thumbnailObjectPath, candidatePaths),
      ),
    );

  const targetIds = new Set(uniquePostIds);
  const sharedPaths = new Set(
    allReferences
      .filter((reference) => !targetIds.has(reference.postId))
      .flatMap(pathsFromMedia)
      .filter((path) => candidatePaths.includes(path)),
  );

  await Promise.all(
    candidatePaths
      .filter((objectPath) => !sharedPaths.has(objectPath))
      .map(async (objectPath) => {
        try {
          const file = await objectStorageService.getObjectEntityFile(objectPath);
          await file.delete();
        } catch (error) {
          if (error instanceof ObjectNotFoundError) return;
          throw error;
        }
      }),
  );
}

export async function deleteCommunityMediaForAuthor(authorUserId: number): Promise<void> {
  const posts = await db
    .select({ id: communityPostsTable.id })
    .from(communityPostsTable)
    .where(eq(communityPostsTable.authorUserId, authorUserId));

  await deleteCommunityMediaForPosts(posts.map((post) => post.id));
}