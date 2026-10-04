import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Datasource resolution (demo mode also switches sessions to signed cookies, see auth/stateless.ts):
 *  - postgres://… → used as is (production).
 *  - file:… or unset on a serverless host (VERCEL=1) → DEMO MODE: the seeded
 *    SQLite file bundled with the app is copied to the instance's temp dir on
 *    first access. Writes persist for the life of that instance only.
 *  - file:… locally → the path as configured (prisma/dev.db).
 */
function resolveDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL ?? "";
  if (/^postgres(ql)?:\/\//.test(url)) return undefined; // let Prisma read env
  const serverless = !!process.env.VERCEL || !!process.env.COACHOS_DEMO_DB;
  if (!serverless) return undefined;
  const target = path.join(os.tmpdir(), "coachos-demo.db");
  if (!existsSync(target)) {
    const seed = path.join(process.cwd(), "prisma", "seed.db");
    if (existsSync(seed)) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(seed, target);
    }
  }
  return `file:${target.replace(/\\/g, "/")}`;
}

const overrideUrl = resolveDatasourceUrl();
export const DEMO_MODE = !!overrideUrl;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(overrideUrl ? { datasources: { db: { url: overrideUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
