import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { ClientShell } from "@/components/client-shell";
import { logoutAction } from "@/server/actions/auth";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser("client");
  const client = await db.client.findUnique({ where: { id: user.clientId! }, select: { firstName: true, coach: { select: { name: true } }, _count: { select: { messages: { where: { direction: "COACH_TO_CLIENT", readAt: null } } } } } });
  return (
    <ClientShell locale={user.locale} firstName={client?.firstName ?? user.name} coachName={client?.coach.name ?? ""} unread={client?._count.messages ?? 0} logout={logoutAction}>
      {children}
    </ClientShell>
  );
}
