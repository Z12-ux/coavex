import { ActionForm } from "@/components/action-form";
import { MessageSquare, Send } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDateTime } from "@/lib/format";
import { Avatar, Button, cn, textareaClass } from "@/components/ui";
import { markCoachMessagesReadAction, sendClientMessageAction } from "@/server/actions/client-app";

export const dynamic = "force-dynamic";

export default async function ClientMessagesPage() {
  const user = await pageUser("client");
  const locale = user.locale;
  const [messages, client] = await Promise.all([
    db.message.findMany({ where: { clientId: user.clientId! }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.client.findUnique({ where: { id: user.clientId! }, select: { coach: { select: { name: true } } } }),
  ]);
  if (messages.some((m) => m.direction === "COACH_TO_CLIENT" && !m.readAt)) await markCoachMessagesReadAction();
  const coachName = client?.coach.name ?? "";
  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 10rem)" }}>
      <header className="mb-4 flex items-end justify-between gap-3">
        <h1 className="font-display text-[30px] font-extrabold uppercase leading-8 text-ink">{t(locale, "nav.messages")}</h1>
        {coachName ? (
          <span className="flex min-w-0 items-center gap-2 pb-0.5">
            <Avatar name={coachName} size={30} />
            <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-2">
              {t(locale, "client.coachLabel")} {coachName}
            </span>
          </span>
        ) : null}
      </header>
      <ol className="flex-1 space-y-2.5">
        {messages.length ? (
          messages.map((m) => {
            const mine = m.direction === "CLIENT_TO_COACH";
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-[14px] leading-5 text-ink", mine ? "neon-edge rounded-ee-md bg-accent-soft" : "rounded-es-md border-border bg-surface-2")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className={cn("tnum mt-1 text-[11px] text-muted", mine && "text-end")}>{fmtDateTime(m.createdAt, locale)}</div>
                </div>
              </li>
            );
          })
        ) : (
          <li className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
            <MessageSquare className="size-6 text-muted" />
            <p className="text-[13.5px] text-muted">{t(locale, "client.noMessages")}</p>
          </li>
        )}
      </ol>
      <ActionForm action={sendClientMessageAction} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 flex items-end gap-2 rounded-lg border border-border-strong bg-surface p-2 shadow-[var(--shadow)]" toast={t(locale, "toast.sent")}>
        <textarea name="body" required rows={2} className={cn(textareaClass, "min-h-[44px] flex-1 resize-none border-transparent bg-surface-2")} placeholder={t(locale, "messages.placeholder")} />
        <Button type="submit" size="lg" className="h-11 shrink-0 px-4">
          <Send className="size-4 rtl:-scale-x-100" />
          {t(locale, "common.send")}
        </Button>
      </ActionForm>
    </div>
  );
}
