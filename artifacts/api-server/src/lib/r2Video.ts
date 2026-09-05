import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { pipeline } from "stream/promises";

let client: S3Client | null = null;

function getR2Client(): S3Client {
  if (client) return client;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 video storage is not configured");
  }
  client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured");
  return bucket;
}

const MIB = 1024 * 1024;
const MIN_PART_SIZE = 16 * MIB;
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024 * 1024;
const UPLOAD_RECEIPT_TTL_SECONDS = 24 * 60 * 60;
const R2_VIDEO_KEY_PATTERN = /^videos\/\d+\/(?:new|\d+)\/[0-9a-f-]{36}\.(?:mp4|mov)$/;

export type R2UploadReceipt = {
  kind: "r2-upload";
  sessionId: string;
  adminId: number;
  courseId: number;
  videoId: number | null;
  objectKey: string;
  uploadId: string;
  fileSize: number;
  contentType: "video/mp4" | "video/quicktime";
  expiresAt: number;
};

export type R2CommitReceipt = {
  kind: "r2-complete";
  sessionId: string;
  adminId: number;
  courseId: number;
  videoId: number | null;
  objectKey: string;
  fileSize: number;
  contentType: "video/mp4" | "video/quicktime";
  expiresAt: number;
};

function getUploadSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function signReceiptPayload(encodedPayload: string): string {
  return createHmac("sha256", getUploadSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function createSignedReceipt(payload: R2UploadReceipt | R2CommitReceipt): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signReceiptPayload(encoded)}`;
}

export function verifyR2UploadReceipt(receipt: string): R2UploadReceipt {
  const [encoded, suppliedSignature] = receipt.split(".");
  if (!encoded || !suppliedSignature) throw new Error("Invalid upload receipt");
  const expected = Buffer.from(signReceiptPayload(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Invalid upload receipt");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as R2UploadReceipt;
  if (
    !payload ||
    payload.kind !== "r2-upload" ||
    !/^[0-9a-f-]{36}$/.test(payload.sessionId) ||
    !Number.isSafeInteger(payload.adminId) ||
    payload.adminId <= 0 ||
    !Number.isSafeInteger(payload.courseId) ||
    payload.courseId <= 0 ||
    (payload.videoId !== null && (!Number.isSafeInteger(payload.videoId) || payload.videoId <= 0)) ||
    !R2_VIDEO_KEY_PATTERN.test(payload.objectKey) ||
    typeof payload.uploadId !== "string" ||
    !Number.isSafeInteger(payload.fileSize) ||
    payload.fileSize <= 0 ||
    payload.fileSize > MAX_VIDEO_SIZE ||
    !["video/mp4", "video/quicktime"].includes(payload.contentType) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Invalid or expired upload receipt");
  }
  return payload;
}

export function verifyR2CommitReceipt(receipt: string): R2CommitReceipt {
  const [encoded, suppliedSignature] = receipt.split(".");
  if (!encoded || !suppliedSignature) throw new Error("Invalid completion receipt");
  const expected = Buffer.from(signReceiptPayload(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Invalid completion receipt");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as R2CommitReceipt;
  if (
    !payload ||
    payload.kind !== "r2-complete" ||
    !/^[0-9a-f-]{36}$/.test(payload.sessionId) ||
    !Number.isSafeInteger(payload.adminId) ||
    payload.adminId <= 0 ||
    !Number.isSafeInteger(payload.courseId) ||
    payload.courseId <= 0 ||
    (payload.videoId !== null && (!Number.isSafeInteger(payload.videoId) || payload.videoId <= 0)) ||
    !R2_VIDEO_KEY_PATTERN.test(payload.objectKey) ||
    !Number.isSafeInteger(payload.fileSize) ||
    payload.fileSize <= 0 ||
    payload.fileSize > MAX_VIDEO_SIZE ||
    !["video/mp4", "video/quicktime"].includes(payload.contentType) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Invalid or expired completion receipt");
  }
  return payload;
}

export function isValidR2VideoObjectKey(key: string): boolean {
  return R2_VIDEO_KEY_PATTERN.test(key) || key === "videos/pilot/video-64-faststart.mp4";
}

export async function initiateR2MultipartVideoUpload(input: {
  adminId: number;
  courseId: number;
  videoId?: number | null;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{
  receipt: string;
  objectKey: string;
  partSize: number;
  totalParts: number;
}> {
  const extension = input.fileName.trim().toLowerCase().endsWith(".mov") ? "mov" : "mp4";
  const contentType = extension === "mov" ? "video/quicktime" : "video/mp4";
  if (
    !Number.isSafeInteger(input.courseId) ||
    input.courseId <= 0 ||
    (input.videoId != null && (!Number.isSafeInteger(input.videoId) || input.videoId <= 0)) ||
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > MAX_VIDEO_SIZE ||
    !["video/mp4", "video/quicktime", "application/octet-stream", ""].includes(input.contentType)
  ) {
    throw new Error("Invalid video upload metadata");
  }
  if (!/\.(mp4|mov)$/i.test(input.fileName.trim())) {
    throw new Error("Only MP4 and MOV video files are supported");
  }

  const sessionId = randomUUID();
  const objectKey = `videos/${input.courseId}/${input.videoId ?? "new"}/${sessionId}.${extension}`;
  const partSize = Math.max(
    MIN_PART_SIZE,
    Math.ceil(input.fileSize / 9_990 / MIB) * MIB,
  );
  const totalParts = Math.ceil(input.fileSize / partSize);
  const result = await getR2Client().send(new CreateMultipartUploadCommand({
    Bucket: getR2Bucket(),
    Key: objectKey,
    ContentType: contentType,
    ContentDisposition: "inline",
    Metadata: {
      originalname: Buffer.from(input.fileName).toString("base64url").slice(0, 900),
      expectedsize: String(input.fileSize),
    },
  }));
  if (!result.UploadId) throw new Error("R2 did not create a multipart upload");
  const payload: R2UploadReceipt = {
    kind: "r2-upload",
    sessionId,
    adminId: input.adminId,
    courseId: input.courseId,
    videoId: input.videoId ?? null,
    objectKey,
    uploadId: result.UploadId,
    fileSize: input.fileSize,
    contentType,
    expiresAt: Math.floor(Date.now() / 1000) + UPLOAD_RECEIPT_TTL_SECONDS,
  };
  return {
    receipt: createSignedReceipt(payload),
    objectKey,
    partSize,
    totalParts,
  };
}

export async function getPresignedR2UploadPartUrl(
  receipt: string,
  partNumber: number,
): Promise<string> {
  const payload = verifyR2UploadReceipt(receipt);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new Error("Invalid multipart part number");
  }
  return getSignedUrl(
    getR2Client(),
    new UploadPartCommand({
      Bucket: getR2Bucket(),
      Key: payload.objectKey,
      UploadId: payload.uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 15 * 60 },
  );
}

export async function completeR2MultipartVideoUpload(
  receipt: string,
  parts: { partNumber: number; etag: string }[],
): Promise<{ objectKey: string; fileSize: number; contentType: string; commitReceipt: string }> {
  const payload = verifyR2UploadReceipt(receipt);
  if (
    !Array.isArray(parts) ||
    parts.length === 0 ||
    parts.length > 10_000 ||
    parts.some((part, index) =>
      part.partNumber !== index + 1 ||
      typeof part.etag !== "string" ||
      !/^\"?[a-fA-F0-9-]{16,}\"?$/.test(part.etag)
    )
  ) {
    throw new Error("Invalid multipart completion data");
  }
  await getR2Client().send(new CompleteMultipartUploadCommand({
    Bucket: getR2Bucket(),
    Key: payload.objectKey,
    UploadId: payload.uploadId,
    MultipartUpload: {
      Parts: parts.map(part => ({
        ETag: part.etag,
        PartNumber: part.partNumber,
      })),
    },
  }));
  return getCompletedR2VideoUpload(receipt);
}

export async function getCompletedR2VideoUpload(
  receipt: string,
): Promise<{ objectKey: string; fileSize: number; contentType: string; commitReceipt: string }> {
  const payload = verifyR2UploadReceipt(receipt);
  const metadata = await getR2VideoMetadata(payload.objectKey);
  if (metadata.size !== payload.fileSize) {
    await getR2Client().send(new DeleteObjectCommand({
      Bucket: getR2Bucket(),
      Key: payload.objectKey,
    }));
    throw new Error("Uploaded video size verification failed");
  }
  return {
    objectKey: payload.objectKey,
    fileSize: metadata.size,
    contentType: metadata.contentType,
    commitReceipt: createSignedReceipt({
      kind: "r2-complete",
      sessionId: payload.sessionId,
      adminId: payload.adminId,
      courseId: payload.courseId,
      videoId: payload.videoId,
      objectKey: payload.objectKey,
      fileSize: metadata.size,
      contentType: payload.contentType,
      expiresAt: Math.floor(Date.now() / 1000) + UPLOAD_RECEIPT_TTL_SECONDS,
    }),
  };
}

export async function abortR2MultipartVideoUpload(receipt: string): Promise<void> {
  const payload = verifyR2UploadReceipt(receipt);
  await getR2Client().send(new AbortMultipartUploadCommand({
    Bucket: getR2Bucket(),
    Key: payload.objectKey,
    UploadId: payload.uploadId,
  }));
}

export async function deleteR2UploadedVideoObject(key: string): Promise<void> {
  if (!R2_VIDEO_KEY_PATTERN.test(key)) {
    throw new Error("Refusing to delete an unmanaged R2 object");
  }
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  }));
}

export async function getPresignedR2VideoUrl(
  key: string,
  expiresInSeconds = 15 * 60,
): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function getR2VideoMetadata(
  key: string,
): Promise<{ size: number; contentType: string }> {
  const result = await getR2Client().send(
    new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }),
  );
  const size = result.ContentLength;
  if (!Number.isSafeInteger(size) || size === undefined || size < 0) {
    throw new Error("R2 returned an invalid video size");
  }
  return {
    size,
    contentType: result.ContentType?.startsWith("video/")
      ? result.ContentType
      : "video/mp4",
  };
}

export async function streamR2Video(
  req: Request,
  res: Response,
  key: string,
): Promise<void> {
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", onClose);

  try {
    const result = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      }),
      { abortSignal: controller.signal },
    );
    if (!result.Body) throw new Error("R2 returned an empty video body");

    res.status(result.$metadata.httpStatusCode === 206 ? 206 : 200);
    res.setHeader("Accept-Ranges", result.AcceptRanges || "bytes");
    res.setHeader(
      "Content-Type",
      result.ContentType?.startsWith("video/") ? result.ContentType : "video/mp4",
    );
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Vary", "Range");
    res.setHeader("X-Accel-Buffering", "no");
    if (result.ContentLength !== undefined) {
      res.setHeader("Content-Length", String(result.ContentLength));
    }
    if (result.ContentRange) {
      res.setHeader("Content-Range", result.ContentRange);
    }

    await pipeline(result.Body as NodeJS.ReadableStream, res);
  } catch (error: unknown) {
    if (
      error instanceof S3ServiceException &&
      error.$metadata.httpStatusCode === 416 &&
      !res.headersSent
    ) {
      const metadata = await getR2VideoMetadata(key);
      res.status(416);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes */${metadata.size}`);
      res.setHeader("Content-Length", "0");
      res.end();
      return;
    }
    if (!controller.signal.aborted) throw error;
  } finally {
    res.off("close", onClose);
  }
}