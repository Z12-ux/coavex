/**
 * Stateless (signed) session tokens — used in DEMO MODE only.
 *
 * On a serverless host every instance owns its own copy of the demo SQLite
 * file, so a DB-backed session created on one instance is unknown to the
 * next. A signed token carries the user id itself; any instance can verify it
 * with SESSION_SECRET and load the (seeded, therefore identical) user row.
 *
 * Format: `d1.<userId>.<expiresAtMs>.<hmac-sha256 base64url>`
 * Pure module (no server-only, no DB) so it can be unit tested.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const STATELESS_PREFIX = "d1.";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSessionToken(userId: string, expiresAtMs: number, secret: string): string {
  if (!userId || userId.includes(".")) throw new Error("invalid user id for stateless token");
  const payload = `${userId}.${Math.floor(expiresAtMs)}`;
  return `${STATELESS_PREFIX}${payload}.${sign(payload, secret)}`;
}

export function isStatelessToken(token: string): boolean {
  return token.startsWith(STATELESS_PREFIX);
}

/** Returns the user id when the token is well-formed, correctly signed and not expired; otherwise null. */
export function verifySessionToken(token: string, secret: string, nowMs = Date.now()): string | null {
  if (!isStatelessToken(token)) return null;
  const parts = token.slice(STATELESS_PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp <= nowMs) return null;
  const expected = sign(`${userId}.${expRaw}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

/** Secret resolution: SESSION_SECRET, else a fixed demo value (demo credentials are public anyway). */
export function sessionSecret(): string {
  return process.env.SESSION_SECRET || "coachos-demo-mode-insecure-secret";
}
