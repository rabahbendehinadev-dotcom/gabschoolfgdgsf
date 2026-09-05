import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
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