import { createHmac, timingSafeEqual } from "node:crypto";

export type CommunityUploadReceipt = {
  objectPath: string;
  userId: number;
  contentType: string;
  sizeBytes: number;
  expiresAt: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required for Community uploads");
  return value;
}

function signature(encodedPayload: string): Buffer {
  return createHmac("sha256", secret()).update(encodedPayload).digest();
}

export function signCommunityUploadReceipt(
  payload: Omit<CommunityUploadReceipt, "expiresAt">,
): string {
  const fullPayload: CommunityUploadReceipt = {
    ...payload,
    expiresAt: Date.now() + 60 * 60 * 1_000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload).toString("base64url")}`;
}

export function verifyCommunityUploadReceipt(
  token: string,
  expected: { objectPath: string; userId: number },
): CommunityUploadReceipt | null {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expectedSignature = signature(encodedPayload);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<CommunityUploadReceipt>;
    if (
      payload.objectPath !== expected.objectPath ||
      payload.userId !== expected.userId ||
      typeof payload.contentType !== "string" ||
      typeof payload.sizeBytes !== "number" ||
      !Number.isFinite(payload.sizeBytes) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }
    return payload as CommunityUploadReceipt;
  } catch {
    return null;
  }
}