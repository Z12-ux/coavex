/**
 * Run a command with the variables of an env file loaded into process.env.
 *   node scripts/with-env.mjs .env.production.local npx prisma db push
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [file, cmd, ...args] = process.argv.slice(2);
if (!file || !cmd) {
  console.error("usage: node scripts/with-env.mjs <envfile> <command> [args…]");
  process.exit(2);
}
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m || line.trim().startsWith("#")) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
