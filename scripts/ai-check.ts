import { PrismaClient } from "@prisma/client";
import { draftMessage, summarizeClient, aiStatus } from "../src/server/ai";
const db = new PrismaClient();
(async () => {
  console.log("aiStatus:", aiStatus());
  const c = await db.client.findFirst({ where: { firstName: "Ahmed" } });
  if (!c) throw new Error("no client");
  const t0 = Date.now();
  const d = await draftMessage({ clientId: c.id, situation: "MISSED_WORKOUTS", tone: "FRIENDLY", locale: "fr", coachName: "Sami" });
  console.log(`draft provider=${d.provider} note=${d.note ?? "-"} ${Date.now() - t0}ms\n---\n${d.text}\n---`);
  const s = await summarizeClient(c.id, "fr");
  console.log(`summary provider=${s.provider} note=${s.note ?? "-"}\n---\n${s.text.slice(0, 600)}\n---`);
  await db.$disconnect();
})();
