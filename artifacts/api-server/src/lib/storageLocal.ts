import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { randomUUID } from "crypto";

const LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR || "/app/data";

function resolvePath(bucketName: string, objectName: string): string {
  const full = path.join(LOCAL_DATA_DIR, bucketName, objectName);
  const base = path.join(LOCAL_DATA_DIR, bucketName);
  if (!full.startsWith(base)) throw new Error("Path traversal blocked");
  return full;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

export class LocalFile {
  public readonly name: string;

  constructor(
    public readonly bucketName: string,
    public readonly objectName: string,
  ) {
    this.name = objectName;
  }

  private get absPath() {
    return resolvePath(this.bucketName, this.objectName);
  }
  private get metaPath() {
    return this.absPath + ".meta.json";
  }

  async exists(): Promise<[boolean]> {
    try {
      await fsp.access(this.absPath);
      return [true];
    } catch {
      return [false];
    }
  }

  private async _readMeta(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await fsp.readFile(this.metaPath, "utf-8"));
    } catch {
      return {};
    }
  }

  async getMetadata(): Promise<[Record<string, unknown>]> {
    let stat: { size: number } = { size: 0 };
    try {
      stat = await fsp.stat(this.absPath);
    } catch {}
    const ext = path.extname(this.objectName).toLowerCase();
    const custom = await this._readMeta();
    return [
      {
        contentType: MIME[ext] || "application/octet-stream",
        size: stat.size,
        metadata: custom,
      },
    ];
  }

  async setMetadata(opts: { metadata?: Record<string, string> }): Promise<void> {
    const existing = await this._readMeta();
    const merged = { ...existing, ...(opts.metadata ?? {}) };
    await fsp.mkdir(path.dirname(this.metaPath), { recursive: true });
    await fsp.writeFile(this.metaPath, JSON.stringify(merged, null, 2));
  }

  createReadStream(): Readable {
    return fs.createReadStream(this.absPath);
  }

  async save(data: Buffer): Promise<void> {
    await fsp.mkdir(path.dirname(this.absPath), { recursive: true });
    await fsp.writeFile(this.absPath, data);
  }

  async delete(): Promise<void> {
    await fsp.unlink(this.absPath).catch(() => {});
    await fsp.unlink(this.metaPath).catch(() => {});
  }
}

class LocalBucket {
  constructor(public readonly name: string) {}
  file(objectName: string): LocalFile {
    return new LocalFile(this.name, objectName);
  }
}

export class LocalStorage {
  bucket(name: string): LocalBucket {
    return new LocalBucket(name);
  }
}

export const localStorage = new LocalStorage();

export async function signLocalObjectURL({
  bucketName,
  objectName,
}: {
  bucketName: string;
  objectName: string;
  method: string;
  ttlSec: number;
}): Promise<string> {
  const token = randomUUID();
  const expires = Date.now() + 900_000;
  const signedPath = `/api/storage/local-signed?b=${encodeURIComponent(bucketName)}&o=${encodeURIComponent(objectName)}&t=${token}&exp=${expires}`;
  const configuredBaseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (
    process.env.NODE_ENV === "production" &&
    (!configuredBaseUrl || !configuredBaseUrl.startsWith("https://"))
  ) {
    throw new Error("APP_BASE_URL must use HTTPS in production");
  }
  const baseUrl = configuredBaseUrl || "http://localhost:3000";
  return `${baseUrl}${signedPath}`;
}
