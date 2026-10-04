/**
 * Starts the production server, waits for /api/health, runs the e2e smoke,
 * then stops the server. Exit code = e2e exit code.
 *   node scripts/run-e2e.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const PORT = process.env.PORT || "3210";
const BASE = `http://localhost:${PORT}`;
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");

// Spawn node directly (no shell) so `server.pid` is the real server process.
// Deterministic runs: restore the dev database from the seeded snapshot (KEEP_DB=1 to skip).
if (!process.env.KEEP_DB && !process.env.COACHOS_DEMO_DB) {
  const { copyFileSync, existsSync, rmSync } = await import("node:fs");
  if (existsSync("prisma/seed.db")) {
    rmSync("prisma/dev.db-journal", { force: true });
    copyFileSync("prisma/seed.db", "prisma/dev.db");
    console.log("[e2e] prisma/dev.db restored from prisma/seed.db");
  }
}
const server = spawn(process.execPath, [nextBin, process.env.DEV ? "dev" : "start", "-p", PORT], { stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

async function waitFor(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let code = 1;
try {
  const up = await waitFor(`${BASE}/api/health`, 60_000);
  if (!up) throw new Error("server did not start (port busy?)");
  code = await new Promise((resolve) => {
    const e2e = spawn(process.execPath, [process.argv[2] || "scripts/e2e.mjs", BASE], { stdio: "inherit" });
    e2e.on("exit", (c) => resolve(c ?? 1));
  });
} catch (e) {
  console.error(e);
} finally {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}
process.exit(code);
