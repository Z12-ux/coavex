/**
 * DB-backed sessions. The cookie holds an opaque random token; only its hash
 * is stored. Every server action / route handler goes through `requireUser`
 * (or the role-specific helpers) so authorization is enforced server-side.
 */

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db, DEMO_MODE } from "@/server/db";
import { can, type Permission } from "@/lib/rbac";
import type { Locale, Role } from "@/domain/types";
import { isLocale } from "@/lib/i18n/dictionary";
import { isStatelessToken, sessionSecret, signSessionToken, verifySessionToken } from "./stateless";

export const SESSION_COOKIE = "coachos_session";
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
  clientId: string | null;
  orgName: string;
  orgLocale: Locale;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  let token: string;
  if (DEMO_MODE) {
    // Demo mode (per-instance SQLite): a signed token is valid on every instance; see ./stateless.ts.
    token = signSessionToken(userId, expiresAt.getTime(), sessionSecret());
  } else {
    token = randomBytes(32).toString("base64url");
    await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 200) } });
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && !isStatelessToken(token)) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

const USER_INCLUDE = { org: true, clientProfile: { select: { id: true } } } as const;

/** Resolves the cookie token to a user row: signed token (demo mode) or DB session (default). */
async function resolveSessionUser(token: string) {
  if (isStatelessToken(token)) {
    const userId = verifySessionToken(token, sessionSecret());
    if (!userId) return null;
    return db.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
  }
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: USER_INCLUDE } } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/** Returns the current user or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const u = await resolveSessionUser(token);
  if (!u) return null;
  // touch activity (cheap, throttled to once per 10 minutes; awaited so no query outlives the request)
  if (!u.lastActiveAt || Date.now() - u.lastActiveAt.getTime() > 600_000) {
    try {
      await db.user.update({ where: { id: u.id }, data: { lastActiveAt: new Date() } });
      if (u.clientProfile) await db.client.update({ where: { id: u.clientProfile.id }, data: { lastActiveAt: new Date() } });
    } catch {
      /* non-critical */
    }
  }
  return {
    id: u.id,
    orgId: u.orgId,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    locale: isLocale(u.locale) ? u.locale : "fr",
    clientId: u.clientProfile?.id ?? null,
    orgName: u.org.name,
    orgLocale: isLocale(u.org.locale) ? u.org.locale : "fr",
  };
});

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "FORBIDDEN",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("UNAUTHORIZED");
  return u;
}

export async function requirePermission(p: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, p)) throw new AuthError("FORBIDDEN", `Missing permission ${p}`);
  return u;
}

/** Staff member (anyone but CLIENT). */
export async function requireStaff(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role === "CLIENT") throw new AuthError("FORBIDDEN");
  return u;
}

/** The logged-in client; returns the user plus their client profile id. */
export async function requireClientSelf(): Promise<CurrentUser & { clientId: string }> {
  const u = await requireUser();
  if (u.role !== "CLIENT" || !u.clientId) throw new AuthError("FORBIDDEN");
  return { ...u, clientId: u.clientId };
}

/** Page-level guard: redirect instead of throwing. */
export async function pageUser(kind: "staff" | "client"): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (kind === "staff" && u.role === "CLIENT") redirect("/app");
  if (kind === "client" && u.role !== "CLIENT") redirect("/");
  return u;
}

/** Throws unless the client belongs to the caller's organization. */
export async function assertClientInOrg(clientId: string, orgId: string) {
  const c = await db.client.findFirst({ where: { id: clientId, orgId }, select: { id: true, coachId: true, preferredLocale: true, firstName: true } });
  if (!c) throw new AuthError("FORBIDDEN", "Client not in organization");
  return c;
}
