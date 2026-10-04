import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pin, Sparkles } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDateTime } from "@/lib/format";
import { Avatar, Badge, PageHeader, cn } from "@/components/ui";
import { Composer } from "@/components/composer";
import { isLocale } from "@/lib/i18n/dictionary";
import { aiStatus } from "@/server/ai";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await pageUser("staff");
  const locale = user.locale;
  const { clientId } = await params;
  const client = await db.client.findFirst({ where: { id: clientId, orgId: user.orgId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 100 }, notes: { where: { pinned: true, category: "COMMUNICATION" } } } });
  if (!client) notFound();
  // Reading the thread marks the client messages as read (plain DB write: no revalidatePath during render).
  if (client.messages.some((m) => m.direction === "CLIENT_TO_COACH" && !m.readAt)) await db.message.updateMany({ where: { clientId: client.id, direction: "CLIENT_TO_COACH", readAt: null }, data: { readAt: new Date() } });
  const pinned = client.notes[0]?.content;
  const ai = aiStatus();

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: "calc(100dvh - 8rem)" }}>
      <Link href="/messages" className="-ms-1 mb-1 inline-flex min-h-11 w-fit items-center px-1 gap-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-muted hover:text-ink">
        <ChevronLeft className="size-4 rtl:rotate-180" />
        {t(locale, "messages.title")}
      </Link>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={`${client.firstName} ${client.lastName}`} size={40} />
            <Link href={`/clients/${client.id}`} className="truncate hover:underline">
              {client.firstName} {client.lastName}
            </Link>
          </span>
        }
        sub={
          pinned ? (
            <span className="inline-flex items-start gap-1.5">
              <Pin className="mt-0.5 size-3.5 shrink-0 text-accent" />
              {pinned}
            </span>
          ) : client.preferredChannel !== "APP" ? (
            client.preferredChannel
          ) : undefined
        }
        action={
          <Badge tone={ai.enabled ? "good" : "neutral"} className="gap-1.5 px-2.5 py-1">
            <Sparkles className="size-3.5" />
            {ai.enabled ? t(locale, "messages.aiOn") : t(locale, "messages.aiOff")}
          </Badge>
        }
      />
      <div className="flex-1 space-y-2.5 overflow-y-auto rounded-lg border border-border bg-surface p-3 sm:p-4">
        {client.messages.length ? (
          client.messages.map((m) => {
            const mine = m.direction === "COACH_TO_CLIENT";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[82%] rounded-2xl border px-3.5 py-2 text-[14px] leading-5", mine ? "rounded-ee-md border-accent/20 bg-accent-soft text-ink" : "rounded-es-md border-border bg-surface-2 text-ink")}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <div className={cn("tnum mt-1 flex items-center gap-1 text-[11px] text-muted", mine && "justify-end")}>
                    {fmtDateTime(m.createdAt, locale)}
                    {m.channel !== "APP" ? ` · ${m.channel}` : ""}
                    {m.source === "ASSISTED" ? (
                      <>
                        {" · "}
                        <Sparkles className="size-3 text-accent" aria-label="✨" />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">{t(locale, "client.noMessages")}</p>
        )}
      </div>
      <Composer clientId={client.id} clientFirstName={client.firstName} clientLocale={isLocale(client.preferredLocale) ? client.preferredLocale : "fr"} locale={locale} channel={client.preferredChannel} />
    </div>
  );
}
