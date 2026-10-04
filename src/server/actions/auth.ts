"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";

const LoginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), next: z.string().max(300).optional() });

// Minimal in-memory rate limit per email (5 attempts / 10 min per server instance).
const attempts = new Map<string, { n: number; until: number }>();

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") || undefined });
  if (!parsed.success) return { error: "invalid" };
  const email = parsed.data.email.toLowerCase().trim();
  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) return { error: "locked" };

  const user = await db.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) {
    attempts.set(email, { n: (a?.n ?? 0) + 1, until: Date.now() + 10 * 60_000 });
    return { error: "invalid" };
  }
  attempts.delete(email);
  const ua = (await headers()).get("user-agent");
  await createSession(user.id, ua);
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : null;
  redirect(next ?? (user.role === "CLIENT" ? "/app" : "/"));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
