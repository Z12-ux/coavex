import { rmSync } from "node:fs";
for (const f of ["prisma/dev.db", "prisma/dev.db-journal"]) {
  try { rmSync(f); } catch {}
}
console.log("db reset");
