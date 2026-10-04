/**
 * Lists the files that make up a source deployment (what `vercel deploy`
 * would upload after .vercelignore) with sizes. Used to sanity-check the
 * payload before deploying without the CLI.
 *   node scripts/deploy-manifest.mjs [--json out.json]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".next", "e2e-shots", "scripts", "docs", ".git", ".claude"]);
const SKIP_FILE = (f) => /\.(png|db|log|md)$/.test(f) || /\.test\.ts$/.test(f) || f.startsWith(".env") || /fixtures\.ts$/.test(f) || f === "vitest.config.ts" || f === "tsconfig.tsbuildinfo";

const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const rel = p.split(path.sep).join("/").replace(/^\.\//, "");
    if (e.isDirectory()) walk(p);
    else if (!SKIP_FILE(rel)) files.push(rel);
  }
}
walk(".");
files.sort();
let total = 0;
for (const f of files) total += statSync(f).size;
console.log(`files: ${files.length}  bytes: ${total}`);
for (const f of files.slice().sort((a, b) => statSync(b).size - statSync(a).size).slice(0, 10)) console.log(`  ${statSync(f).size}\t${f}`);

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx >= 0) {
  const out = process.argv[jsonIdx + 1] || "deploy-files.json";
  const payload = files.map((file) => ({ file, data: readFileSync(file, "utf8"), encoding: "utf-8" }));
  writeFileSync(out, JSON.stringify(payload));
  console.log(`wrote ${out}`);
}
