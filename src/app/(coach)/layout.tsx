import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CoachShell } from "@/components/coach-shell";
import { logoutAction } from "@/server/actions/auth";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser("staff");
  const [unanswered, attention, pendingCheckins] = await Promise.all([
    db.message.count({ where: { orgId: user.orgId, direction: "CLIENT_TO_COACH", readAt: null } }),
    db.action.count({ where: { coachId: user.id, status: "OPEN", priority: { gte: 60 } } }),
    db.checkIn.count({ where: { client: { orgId: user.orgId }, status: "SUBMITTED", coachReviewedAt: null } }),
  ]);
  return (
    <CoachShell locale={user.locale} userName={user.name} orgName={user.orgName} badges={{ unanswered, attention, pendingCheckins }} logout={logoutAction}>
      {children}
    </CoachShell>
  );
}
