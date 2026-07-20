import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable, PassThrough, Writable } from "stream";

/* ────────────────────────────────────────────────────────────────────────────
   S3-compatible storage adapter.

   Wraps @aws-sdk/client-s3 behind the same duck-typed interface that
   @google-cloud/storage exposes, so the rest of the codebase (objectStorage.ts,
   videoStorage.ts, hlsStorage.ts, objectAcl.ts) can call the same methods
   regardless of which provider is active.

   Activated when STORAGE_PROVIDER=s3 (or when S3_ENDPOINT / S3_ACCESS_KEY_ID
   is set without STORAGE_PROVIDER).

   Required env vars:
     S3_BUCKET            — bucket name
     S3_REGION            — AWS region (default: us-east-1)
     S3_ACCESS_KEY_ID     — access key
     S3_SECRET_ACCESS_KEY — secret key
     S3_ENDPOINT          — custom endpoint for MinIO / R2 / etc. (omit for AWS)
   ────────────────────────────────────────────────────────────────────────── */

let _client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_client) return _client;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  _client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: !!endpoint,
  });
  return _client;
}

function getS3Bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET environment variable is not set");
  return b;
}

/* ────────────────────────────────────────────────────────────────────────────
   S3File — duck-typed equivalent of @google-cloud/storage File
   ────────────────────────────────────────────────────────────────────────── */
export class S3File {
  constructor(
    public readonly name: string,
    public readonly bucket: { name: string },
  ) {}

  async exists(): Promise<[boolean]> {
    try {
      await getS3Client().send(
        new HeadObjectCommand({ Bucket: getS3Bucket(), Key: this.name }),
      );
      return [true];
    } catch {
      return [false];
    }
  }

  async download(): Promise<[Buffer]> {
    const resp = await getS3Client().send(
      new GetObjectCommand({ Bucket: getS3Bucket(), Key: this.name }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return [Buffer.concat(chunks)];
  }

  createReadStream(options?: { start?: number; end?: number }): Readable {
    const rangeHeader =
      options !== undefined && (options.start !== undefined || options.end !== undefined)
        ? `bytes=${options.start ?? 0}-${options.end ?? ""}`
        : undefined;

    const pass = new PassThrough();

    getS3Client()
      .send(
        new GetObjectCommand({
          Bucket: getS3Bucket(),
          Key: this.name,
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        }),
      )
      .then((resp) => {
        (resp.Body as Readable).pipe(pass);
      })
      .catch((err) => pass.destroy(err));

    return pass;
  }

  createWriteStream(opts?: {
    contentType?: string;
    metadata?: Record<string, string>;
  }): Writable {
    const pass = new PassThrough();
    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: getS3Bucket(),
        Key: this.name,
        Body: pass,
        ContentType: opts?.contentType ?? "application/octet-stream",
        Metadata: opts?.metadata ?? {},
      },
    });
    upload.done().catch((err: Error) => pass.destroy(err));
    return pass;
  }

  async getMetadata(): Promise<
    [
      {
        contentType?: string;
        size?: string | number;
        metadata?: Record<string, string>;
      },
    ]
  > {
    const resp = await getS3Client().send(
      new HeadObjectCommand({ Bucket: getS3Bucket(), Key: this.name }),
    );
    return [
      {
        contentType: resp.ContentType,
        size: resp.ContentLength,
        metadata: resp.Metadata ?? {},
      },
    ];
  }

  async setMetadata(meta: { metadata: Record<string, string> }): Promise<void> {
    const head = await getS3Client().send(
      new HeadObjectCommand({ Bucket: getS3Bucket(), Key: this.name }),
    );
    await getS3Client().send(
      new CopyObjectCommand({
        Bucket: getS3Bucket(),
        Key: this.name,
        CopySource: `${getS3Bucket()}/${this.name}`,
        ContentType: head.ContentType,
        Metadata: { ...(head.Metadata ?? {}), ...meta.metadata },
        MetadataDirective: "REPLACE",
      }),
    );
  }

  async delete(): Promise<void> {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: getS3Bucket(), Key: this.name }),
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   S3Bucket — duck-typed equivalent of @google-cloud/storage Bucket
   ────────────────────────────────────────────────────────────────────────── */
export class S3Bucket {
  constructor(public readonly name: string) {}

  file(objectName: string): S3File {
    return new S3File(objectName, this);
  }

  async deleteFiles(opts: { prefix: string; force?: boolean }): Promise<void> {
    const bucket = getS3Bucket();
    let continuationToken: string | undefined;
    do {
      const list = await getS3Client().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: opts.prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length > 0) {
        await getS3Client().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
      }
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   S3Storage — duck-typed equivalent of @google-cloud/storage Storage
   ────────────────────────────────────────────────────────────────────────── */
export class S3Storage {
  bucket(_bucketName: string): S3Bucket {
    return new S3Bucket(getS3Bucket());
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   S3 implementation of signObjectURL
   ────────────────────────────────────────────────────────────────────────── */
export async function signS3ObjectURL({
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const bucket = getS3Bucket();
  let command;

  if (method === "PUT") {
    command = new PutObjectCommand({ Bucket: bucket, Key: objectName });
  } else if (method === "DELETE") {
    command = new DeleteObjectCommand({ Bucket: bucket, Key: objectName });
  } else {
    command = new GetObjectCommand({ Bucket: bucket, Key: objectName });
  }

  return getSignedUrl(getS3Client(), command, { expiresIn: ttlSec });
}

export const s3Storage = new S3Storage();
