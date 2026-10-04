import Link from "next/link";
import { ChevronRight, CornerUpLeft } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtRelative } from "@/lib/format";
import { Avatar, Badge, EmptyState, PageHeader, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await pageUser("staff");
  const locale = user.locale;
  const clients = await db.client.findMany({
    where: { orgId: user.orgId },
    select: { id: true, firstName: true, lastName: true, preferredChannel: true, messages: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { messages: { where: { direction: "CLIENT_TO_COACH", readAt: null } } } } },
  });
  const rows = clients
    .filter((c) => c.messages.length)
    .sort((a, b) => b._count.messages - a._count.messages || b.messages[0].createdAt.getTime() - a.messages[0].createdAt.getTime());
  const others = clients.filter((c) => !c.messages.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t(locale, "messages.title")} sub={t(locale, "messages.sub")} />
      {!rows.length ? (
        <EmptyState title={t(locale, "messages.empty")} />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const m = c.messages[0];
            const unread = c._count.messages;
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className={cn("press relative flex min-h-[64px] items-center gap-3 overflow-hidden rounded-lg border bg-surface py-3 pe-3 ps-4 hover:border-border-strong hover:bg-surface-2/60", unread ? "border-border-strong" : "border-border")}>
                  {unread ? <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-bad" /> : null}
                  <Avatar name={`${c.firstName} ${c.lastName}`} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-[14.5px] text-ink", unread ? "font-bold" : "font-medium")}>
                        {c.firstName} {c.lastName}
                      </span>
                      {unread ? <Badge tone="bad">{unread}</Badge> : null}
                      {c.preferredChannel !== "APP" ? <Badge tone="neutral">{c.preferredChannel}</Badge> : null}
                    </div>
                    <div className={cn("mt-0.5 flex items-center gap-1 truncate text-[13px]", unread ? "font-medium text-ink-2" : "text-muted")}>
                      {m.direction === "COACH_TO_CLIENT" ? (
                        <>
                          <CornerUpLeft className="size-3.5 shrink-0 text-muted-2" aria-hidden />
                          <span className="sr-only">↩ </span>
                        </>
                      ) : null}
                      <span className="truncate">{m.body}</span>
                    </div>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("tnum text-[11.5px]", unread ? "font-semibold text-ink-2" : "text-muted-2")}>{fmtRelative(m.createdAt, locale)}</span>
                    <ChevronRight className="size-4 text-muted-2 rtl:rotate-180" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {others.length ? (
        <div className="mt-6">
          <h2 className="t-section mb-2">{t(locale, "clients.title")}</h2>
          <div className="flex flex-wrap gap-1.5">
            {others.map((c) => (
              <Link key={c.id} href={`/messages/${c.id}`} className="press inline-flex min-h-11 items-center rounded-full sm:min-h-9 border border-border bg-surface px-3.5 text-[13px] text-ink-2 hover:border-accent/40 hover:text-ink">
                {c.firstName} {c.lastName}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
