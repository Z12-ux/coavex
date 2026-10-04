import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Sparkles, Zap } from "lucide-react";
import type { Locale, Severity } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { fmtRelative } from "@/lib/format";
import { decideActionAction, decideSignalAction } from "@/server/actions/intelligence";
import type { QueueAction, QueueItem, QueueSignal } from "@/server/queries";
import { ActionForm } from "./action-form";
import { Avatar, Badge, Button, cn, severityTone } from "./ui";

/** Severity → the coloured start edge of a card (semantic colour only, never decorative). */
function edgeClass(severity: Severity | null, positive = false) {
  if (positive) return "bg-good";
  return severity === "URGENT" ? "bg-bad" : severity === "ATTENTION" ? "bg-warn" : severity === "WATCH" ? "bg-info" : "bg-border-strong";
}

function Edge({ className }: { className: string }) {
  return <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", className)} />;
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("me-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted", className)}>{children}</span>;
}

/**
 * Signal card: OBSERVATION (what) → WHY it may matter → DATA → SUGGESTED ACTION.
 * Labels make the epistemic status explicit: observations are facts from the
 * data, the "why" is an interpretation, the action is a suggestion.
 */
export function SignalCard({ s, locale, compact, decidable }: { s: QueueSignal; locale: Locale; compact?: boolean; decidable?: boolean }) {
  const positive = s.polarity === "POSITIVE";
  return (
    <article className={cn("relative overflow-hidden rounded-lg border ps-4 pe-3.5 py-3", positive ? "border-good/30 bg-good-soft/30" : "border-border bg-surface")}>
      <Edge className={edgeClass(s.severity, positive)} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {positive ? <Sparkles className="size-4 shrink-0 text-good" /> : <AlertTriangle className={cn("size-4 shrink-0", s.severity === "URGENT" ? "text-bad" : s.severity === "ATTENTION" ? "text-warn" : "text-info")} />}
          <h4 className="truncate text-[14px] font-semibold text-ink">{s.title}</h4>
        </div>
        <Badge tone={positive ? "good" : severityTone(s.severity)} className="uppercase tracking-[0.08em]">
          {t(locale, `sev.${s.severity}`)}
        </Badge>
      </div>
      <p className="mt-2 text-[13.5px] leading-5 text-ink">
        <Label>{t(locale, "signal.observation")}</Label>
        {s.what}
      </p>
      {!compact ? (
        <>
          <p className="mt-1.5 text-[12.5px] leading-[18px] text-ink-2">
            <Label>{t(locale, "signal.why")}</Label>
            {s.why}
          </p>
          {s.evidence.length ? (
            <dl className="mt-2.5 flex flex-wrap gap-1.5 text-[12px]">
              {s.evidence.map((e, i) => (
                <div key={i} className="flex items-baseline gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1">
                  <dt className="text-muted">{e.label}</dt>
                  <dd className="tnum font-display text-[14px] font-bold leading-4 text-ink">{e.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {s.suggestedAction ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[12.5px] leading-[18px] text-ink-2">
              <Zap className="mt-px size-3.5 shrink-0 text-accent" />
              <span>
                <Label>{t(locale, "signal.action")}</Label>
                {s.suggestedAction}
              </span>
            </p>
          ) : null}
          {decidable ? (
            <ActionForm action={decideSignalAction} className="mt-2.5 flex flex-wrap gap-1.5" toast={t(locale, "toast.updated")}>
              <input type="hidden" name="signalId" value={s.id} />
              <Button name="decision" value="RESOLVED" variant="outline" size="sm" className="h-11 sm:h-9">
                {t(locale, "client.markResolved")}
              </Button>
              <Button name="decision" value="DISMISSED" variant="ghost" size="sm" className="h-11 sm:h-9">
                {t(locale, "client.markDismissed")}
              </Button>
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export function ActionRow({ a, locale, clientId, showReason }: { a: QueueAction; locale: Locale; clientId: string; showReason?: boolean }) {
  const noAction = a.kind === "NO_ACTION";
  const link = actionLink(a.kind, clientId);
  const tone = noAction ? "good" : a.priority >= 80 ? "bad" : a.priority >= 60 ? "warn" : "muted";
  return (
    <div className={cn("relative flex flex-wrap items-center gap-2 overflow-hidden rounded-lg border py-2.5 ps-4 pe-3", noAction ? "border-good/30 bg-good-soft/30" : "border-border bg-surface")}>
      <Edge className={tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-border-strong"} />
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {noAction ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
        ) : (
          <span className={cn("tnum grid h-7 min-w-7 shrink-0 place-items-center rounded-md border px-1 font-display text-[14px] font-bold leading-none", tone === "bad" ? "border-bad/30 bg-bad-soft text-bad" : tone === "warn" ? "border-warn/30 bg-warn-soft text-warn" : "border-border bg-surface-2 text-muted")}>
            {a.priority}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-5 text-ink">{link ? <Link href={link} className="hover:text-accent hover:underline">{a.title}</Link> : a.title}</div>
          {showReason && a.reason ? <div className="text-[12.5px] leading-[18px] text-muted">{a.reason}</div> : null}
          {a.dueAt && !noAction ? (
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-2">
              <Clock className="size-3" /> {fmtRelative(a.dueAt, locale)}
            </div>
          ) : null}
        </div>
      </div>
      {!noAction ? (
        <ActionForm action={decideActionAction} className="flex gap-1" toast={t(locale, "toast.updated")}>
          <input type="hidden" name="actionId" value={a.id} />
          <Button name="decision" value="DONE" variant="outline" size="sm" className="h-11 sm:h-9">
            {t(locale, "common.done")}
          </Button>
          <Button name="decision" value="SNOOZED" variant="ghost" size="sm" className="h-11 sm:h-9" title="+2 j">
            {t(locale, "common.snooze")}
          </Button>
          <Button name="decision" value="DISMISSED" variant="ghost" size="sm" className="h-11 sm:h-9">
            {t(locale, "common.dismiss")}
          </Button>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function actionLink(kind: string, clientId: string): string | null {
  switch (kind) {
    case "REPLY_MESSAGE":
    case "RE_ENGAGE":
    case "SEND_ENCOURAGEMENT":
    case "REQUEST_CHECKIN":
    case "CELEBRATE":
      return `/messages/${clientId}`;
    case "REVIEW_CHECKIN":
      return `/clients/${clientId}?tab=checkins`;
    case "CREATE_PROGRAM":
    case "UPDATE_PROGRAM":
    case "ADJUST_PROGRESSION":
      return `/clients/${clientId}?tab=training`;
    case "REVIEW_RECOVERY":
      return `/clients/${clientId}?tab=recovery`;
    case "REVIEW_NUTRITION":
      return `/clients/${clientId}?tab=nutrition`;
    case "REVIEW_PAYMENT":
    case "SCHEDULE_FOLLOWUP":
      return `/clients/${clientId}?tab=business`;
    case "REVIEW_MISSED":
    case "REVIEW_FRICTION":
      return `/clients/${clientId}?tab=training`;
    default:
      return `/clients/${clientId}`;
  }
}

/** Attention-queue row: WHO · WHAT HAPPENED · WHY IT MATTERS · ACTION. Severity on the start edge. */
export function QueueRow({ item, locale }: { item: QueueItem; locale: Locale }) {
  const neg = item.signals.filter((s) => s.polarity === "NEGATIVE");
  const pos = item.signals.filter((s) => s.polarity === "POSITIVE");
  const top = item.topAction;
  const href = top ? (actionLink(top.kind, item.client.id) ?? `/clients/${item.client.id}`) : `/clients/${item.client.id}`;
  const onlyGood = item.maxSeverity === "INFO" && pos.length > 0;
  return (
    <li className="relative overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <Edge className={edgeClass(item.maxSeverity, onlyGood)} />
      <div className="flex items-start gap-3 py-3.5 ps-4 pe-3.5">
        <Link href={`/clients/${item.client.id}`} className="shrink-0" aria-label={t(locale, "cc.openClient")}>
          <Avatar name={`${item.client.firstName} ${item.client.lastName}`} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-10 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-2">
              <Link href={`/clients/${item.client.id}`} className="text-[15px] font-semibold leading-5 text-ink hover:underline">
                {item.client.firstName} {item.client.lastName}
              </Link>
              {item.client.status !== "ACTIVE" ? <Badge tone="neutral">{t(locale, `status.${item.client.status}`)}</Badge> : null}
            </div>
            {top && top.kind !== "NO_ACTION" ? (
              <ActionForm action={decideActionAction} className="shrink-0" toast={t(locale, "toast.done")}>
                <input type="hidden" name="actionId" value={top.id} />
                <Button name="decision" value="DONE" variant="outline" size="sm" className="h-11 gap-1.5 px-3 sm:h-10">
                  <CheckCircle2 className="size-4 text-muted" />
                  {t(locale, "common.done")}
                </Button>
              </ActionForm>
            ) : null}
          </div>
          {neg.length ? (
            <ul className="mt-1.5 space-y-1 text-[13px] leading-[18px] text-ink-2">
              {neg.slice(0, 3).map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", s.severity === "URGENT" ? "bg-bad" : s.severity === "ATTENTION" ? "bg-warn" : "bg-info")} />
                  <span>{s.what}</span>
                </li>
              ))}
              {neg.length > 3 ? <li className="t-meta ps-3.5">+{neg.length - 3}</li> : null}
            </ul>
          ) : pos.length ? (
            <ul className="mt-1.5 space-y-1 text-[13px] leading-[18px] text-ink-2">
              {pos.slice(0, 2).map((s) => (
                <li key={s.id} className="flex gap-2">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-good" />
                  <span>{s.what}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {top ? (
            <Link href={href} className="press group mt-2.5 flex min-h-[44px] items-center gap-2.5 rounded-md border border-accent/25 bg-accent-soft px-3 py-1.5 hover:border-accent/50">
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold uppercase leading-3 tracking-[0.14em] text-accent">{t(locale, "cc.nextAction")}</span>
                <span className="mt-0.5 block text-[13.5px] font-semibold leading-[18px] text-ink sm:truncate">{top.title}</span>
              </span>
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-accent/15 text-accent transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                <ChevronRight className="size-4 rtl:rotate-180" />
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
