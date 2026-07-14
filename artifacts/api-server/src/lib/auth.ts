import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "cours-online-secret-key-change-in-production";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "cours-online-admin-secret-key-change-in-production";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: { userId: number }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch {
    return null;
  }
}

// Short-lived token used to authorize community media streaming requests.
// <img>/<video> tags cannot send Authorization headers, so the feed embeds a
// signed token in the media URL. Entitlement is still re-checked server-side at
// stream time — this token only proves the request was issued by our API.
export function generateMediaToken(payload: {
  userId: number;
  mediaId: number;
  variant: "preview" | "full";
}): string {
  return jwt.sign({ ...payload, kind: "community-media" }, JWT_SECRET, { expiresIn: "2h" });
}

export function verifyMediaToken(
  token: string,
): { userId: number; mediaId: number; variant: "preview" | "full" } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      mediaId: number;
      variant?: "preview" | "full";
      kind?: string;
    };
    if (decoded.kind !== "community-media") return null;
    if (decoded.variant !== "preview" && decoded.variant !== "full") return null;
    return { userId: decoded.userId, mediaId: decoded.mediaId, variant: decoded.variant };
  } catch {
    return null;
  }
}

// Short-lived token used to authorize course-video streaming requests.
// The native <video> element cannot send Authorization headers, so the player
// embeds this signed token in the stream URL. Entitlement (VIP / subscription)
// is STILL re-checked server-side at stream time — this token only proves the
// request was issued by our API for a specific user + video + part.
//
// TTL is 2 h — long enough for a native iOS HLS session on a slow connection,
// short enough to limit replay attacks. The player refreshes the token
// every ~90 min via GET /api/videos/:id/token/:part (cookie-authenticated).
export function generateVideoStreamToken(payload: {
  userId: number;
  videoId: number;
  part: number;
}): string {
  return jwt.sign({ ...payload, kind: "course-video" }, JWT_SECRET, { expiresIn: "2h" });
}

export function verifyVideoStreamToken(
  token: string,
): { userId: number; videoId: number; part: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId?: number;
      videoId?: number;
      part?: number;
      kind?: string;
    };
    if (decoded.kind !== "course-video") return null;
    if (
      typeof decoded.userId !== "number" ||
      typeof decoded.videoId !== "number" ||
      typeof decoded.part !== "number"
    ) {
      return null;
    }
    return { userId: decoded.userId, videoId: decoded.videoId, part: decoded.part };
  } catch {
    return null;
  }
}

export function generateAdminToken(payload: { adminId: number }): string {
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): { adminId: number } | null {
  try {
    return jwt.verify(token, ADMIN_JWT_SECRET) as { adminId: number };
  } catch {
    return null;
  }
}
