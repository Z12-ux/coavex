/**
 * Provider-aware Prisma generate (+ Next build).
 *   node scripts/build.mjs --generate-only   → postinstall
 *   node scripts/build.mjs                   → prisma generate + next build
 * DATABASE_URL starting with postgres:// → prisma/schema.postgres.prisma,
 * anything else (file:, unset) → prisma/schema.prisma (SQLite).
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
const schema = /^postgres(ql)?:\/\//.test(url) ? "prisma/schema.postgres.prisma" : "prisma/schema.prisma";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
console.log(`[build] prisma schema: ${schema}`);
run("npx", ["prisma", "generate", `--schema=${schema}`]);
if (!process.argv.includes("--generate-only")) run("npx", ["next", "build"]);
