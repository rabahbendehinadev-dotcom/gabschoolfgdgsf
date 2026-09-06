export function buildCommunityPostNotification(args: {
  authorUserId: number;
  postId: number;
  body: string;
}) {
  return {
    type: "community_vip_post" as const,
    title: "منشور جديد",
    body: args.body,
    actorUserId: args.authorUserId,
    audienceType: "all" as const,
    excludeUserIds: [args.authorUserId],
    targetType: "post" as const,
    targetId: args.postId,
    targetPath: "/community",
    dedupeKey: `community-post-${args.postId}`,
  };
}