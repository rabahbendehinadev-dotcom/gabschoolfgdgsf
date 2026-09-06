import type { Request } from "express";

/**
 * Resolve the real client IP.
 *
 * Express `trust proxy` is enabled, and the Replit edge proxy strips any
 * client-supplied X-Forwarded-For and replaces it with the true client chain,
 * so `req.ip` is the genuine, non-spoofable client address. We deliberately do
 * NOT read the raw X-Forwarded-For header here (its leftmost value would be
 * client-controllable on a hypothetical direct connection).
 */
export function getClientIp(req: Request): string {
  return req.ip || "unknown";
}
