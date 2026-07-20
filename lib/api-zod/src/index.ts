export * from "./generated/api";
export * from "./generated/types";
// These names exist in both generated modules (zod schema in ./generated/api,
// plain type in ./generated/types). Explicitly re-export the zod schemas to
// resolve the TS2308 ambiguity — consumers use them as runtime validators.
export {
  DownloadToolBody,
  MigrateVideoStorageResponse,
  ReportCommunityCommentBody,
  ReportCommunityPostBody,
  UpdateMyAvatarBody,
} from "./generated/api";
