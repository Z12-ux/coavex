import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { RefreshCw, Sparkles, Zap } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db, parseJson } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import { startOfWeek } from "@/domain/stats";
import { tx } from "@/domain/catalog";
import type { WeeklyReviewSummary } from "@/domain/types";
import { Avatar, Badge, Button, EmptyState, PageHeader, Panel, cn, textareaClass } from "@/components/ui";
import { RingGauge } from "@/components/charts";
import { completeReviewAction, decideReviewItemAction, generateWeeklyReviewAction } from "@/server/actions/review";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await pageUser("staff");
  const locale = user.locale;
  const weekStart = startOfWeek(new Date());
  const review = await db.weeklyReview.findUnique({ where: { coachId_weekStart: { coachId: user.id, weekStart } }, include: { items: { include: { client: { select: { id: true, firstName: true, lastName: true, status: true } } } } } });
  const items = (review?.items ?? [])
    .map((it) => ({ ...it, summary: parseJson<WeeklyReviewSummary | null>(it.summaryJson, null) }))
    .sort((a, b) => rank(b.summary?.status) - rank(a.summary?.status) || (a.decision === "PENDING" ? -1 : 1));
  const decided = items.filter((i) => i.decision !== "PENDING").length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t(locale, "review.title")}
        sub={`${t(locale, "common.week")} ${fmtDate(weekStart, locale)} · ${t(locale, "review.sub")}`}
        action={
          <ActionForm action={generateWeeklyReviewAction}>
            <Button type="submit" variant={review ? "outline" : "primary"}>
              {review ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
              {review ? t(locale, "review.regenerate") : t(locale, "review.generate")}
            </Button>
          </ActionForm>
        }
      />
      {!review || !items.length ? (
        <EmptyState
          title={t(locale, "review.empty")}
          why={t(locale, "review.emptyWhy")}
          cta={
            <ActionForm action={generateWeeklyReviewAction}>
              <Button type="submit">
                <Sparkles className="size-4" />
                {t(locale, "review.generate")}
              </Button>
            </ActionForm>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <RingGauge value={decided / items.length} size={56} stroke={5} tone={decided === items.length ? "good" : "accent"} label={t(locale, "review.progress")}>
                <span className="tnum font-display text-[12px] font-bold text-ink-2">{Math.round((decided / items.length) * 100)}%</span>
              </RingGauge>
              <div className="min-w-0">
                <div className="t-kicker">{t(locale, "review.progress")}</div>
                <div className="tnum font-display text-[28px] font-bold leading-8 text-ink">
                  {decided}
                  <span className="text-[17px] text-muted">/{items.length}</span>
                </div>
              </div>
            </div>
            {review.status === "COMPLETED" ? (
              <Badge tone="good" className="px-2.5 py-1 uppercase tracking-[0.08em]">
                {t(locale, "common.done")}
              </Badge>
            ) : (
              <ActionForm action={completeReviewAction} toast={t(locale, "toast.updated")}>
                <input type="hidden" name="reviewId" value={review.id} />
                <Button type="submit" variant="outline" disabled={decided < items.length}>
                  {t(locale, "review.complete")}
                </Button>
              </ActionForm>
            )}
          </div>
          <ol className="space-y-3">
            {items.map((it) => {
              const s = it.summary;
              const pending = it.decision === "PENDING";
              const edge = s?.status === "NEEDS_ATTENTION" ? "bg-bad" : s?.status === "WATCH" ? "bg-warn" : s?.status === "NEW" ? "bg-info" : s ? "bg-good" : "bg-border-strong";
              return (
                <li key={it.id}>
                  <Panel className={cn("relative overflow-hidden", !pending && "opacity-80")}>
                    <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", edge)} />
                    <div className="flex flex-wrap items-start gap-3 pe-4 ps-5 pt-4">
                      <Avatar name={`${it.client.firstName} ${it.client.lastName}`} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/clients/${it.client.id}`} className="text-[16px] font-semibold text-ink hover:underline">
                            {it.client.firstName} {it.client.lastName}
                          </Link>
                          {s ? <Badge tone={s.status === "NEEDS_ATTENTION" ? "bad" : s.status === "WATCH" ? "warn" : s.status === "NEW" ? "info" : "good"}>{tx(locale, `rev.status.${s.status}`)}</Badge> : null}
                          {!pending ? <Badge tone="neutral">{t(locale, `review.decision.${it.decision}`)}</Badge> : null}
                        </div>
                        {s ? (
                          <dl className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                            <Metric label={t(locale, "program.workouts")} value={`${s.metrics.sessionsDone}/${s.metrics.sessionsPlanned}`} tone={s.metrics.sessionsPlanned && s.metrics.sessionsDone < s.metrics.sessionsPlanned ? "warn" : undefined} />
                            <Metric label={t(locale, "nav.checkin")} value={s.metrics.checkInDone ? "✓" : "✗"} tone={s.metrics.checkInDone ? "good" : "bad"} />
                            <Metric label={t(locale, "client.weight")} value={s.metrics.weightDeltaKg === null ? "–" : `${s.metrics.weightDeltaKg > 0 ? "+" : ""}${s.metrics.weightDeltaKg} kg`} />
                          </dl>
                        ) : null}
                      </div>
                    </div>
                    {s ? (
                      <div className="grid gap-x-5 gap-y-3 pe-4 ps-5 py-3.5 text-[13px] sm:grid-cols-2">
                        <Block title={t(locale, "review.changed")} items={s.whatChanged} />
                        <Block title={t(locale, "review.well")} items={s.wentWell} tone="good" />
                        <Block title={t(locale, "review.wrong")} items={s.wentWrong} tone="bad" />
                        <Block title={t(locale, "review.attention")} items={s.needsAttention} tone="warn" />
                      </div>
                    ) : null}
                    {s?.possibleAction ? (
                      <div className="mb-3.5 me-4 ms-5 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
                        <Zap className="mt-0.5 size-3.5 shrink-0 text-accent" />
                        <span>
                          <span className="me-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{t(locale, "review.action")}</span>
                          {s.possibleAction}
                        </span>
                      </div>
                    ) : null}
                    {pending ? (
                      <ActionForm action={decideReviewItemAction} className="flex flex-col gap-2 border-t border-border bg-surface-2/40 pe-4 ps-5 py-3 sm:flex-row sm:items-end" toast={t(locale, "toast.decided")}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <textarea name="coachNote" className={cn(textareaClass, "min-h-[44px] flex-1 bg-surface")} placeholder={t(locale, "review.note")} rows={1} aria-label={t(locale, "review.note")} />
                        <div className="flex flex-wrap gap-1.5">
                          <Button name="decision" value="APPROVED" className="h-11">
                            {t(locale, "common.approve")}
                          </Button>
                          <Button name="decision" value="EDITED" variant="outline" className="h-11">
                            {t(locale, "common.edit")}
                          </Button>
                          <Button name="decision" value="FOLLOW_UP" variant="outline" className="h-11">
                            {t(locale, "common.followup")}
                          </Button>
                          <Button name="decision" value="IGNORED" variant="ghost" className="h-11">
                            {t(locale, "common.ignore")}
                          </Button>
                        </div>
                      </ActionForm>
                    ) : it.coachNote ? (
                      <p className="border-t border-border pe-4 ps-5 py-2.5 text-[12.5px] text-muted">{it.coachNote}</p>
                    ) : null}
                  </Panel>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function rank(s?: WeeklyReviewSummary["status"]) {
  return s === "NEEDS_ATTENTION" ? 3 : s === "WATCH" ? 2 : s === "NEW" ? 1 : 0;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tnum font-display text-[15px] font-bold leading-4", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink")}>{value}</dd>
    </div>
  );
}

function Block({ title, items, tone }: { title: string; items: string[]; tone?: "good" | "bad" | "warn" }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className={cn("size-1.5 rounded-full", tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-muted")} />
        <span className={tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-muted"}>{title}</span>
      </div>
      {items.length ? (
        <ul className="space-y-1 leading-[18px] text-ink-2">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-muted-2">•</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted-2">—</span>
      )}
    </div>
  );
}
