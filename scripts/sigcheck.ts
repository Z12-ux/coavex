import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const clients = await db.client.findMany({ include: { signals: { where: { resolvedAt: null } }, actions: { where: { status: "OPEN" }, orderBy: { priority: "desc" } } }, orderBy: { firstName: "asc" } });
  for (const c of clients) console.log(`${c.firstName.padEnd(9)} ${c.status.padEnd(10)} S[${c.signals.map(s=>s.key+":"+s.severity[0]).join(", ")}] → ${c.actions[0]?.kind ?? "-"} (${c.actions[0]?.priority ?? ""})`);
  await db.$disconnect();
})();
