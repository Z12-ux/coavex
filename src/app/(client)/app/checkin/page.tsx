import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { tx } from "@/domain/catalog";
import { addDays, mean, round, startOfWeek } from "@/domain/stats";
import { FRICTION_CATEGORIES } from "@/domain/types";
import { Button, CtaArrow, Field, PageHeader, Panel, Scale, inputClass, textareaClass } from "@/components/ui";
import { submitCheckInAction } from "@/server/actions/client-app";

export const dynamic = "force-dynamic";

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/app" className="-ms-2 mb-1 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">
      <ArrowLeft className="size-4 rtl:rotate-180" />
      {label}
    </Link>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5">
      <span className="tnum grid size-7 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 font-display text-[15px] font-bold text-accent">{n}</span>
      <span className="text-[12.5px] font-semibold uppercase leading-5 tracking-[0.12em] text-ink-2">{title}</span>
    </h2>
  );
}

export default async function CheckInPage() {
  const user = await pageUser("client");
  const locale = user.locale;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const client = await db.client.findUnique({
    where: { id: user.clientId! },
    include: {
      checkIns: { where: { weekStart }, take: 1 },
      workoutSessions: { where: { scheduledFor: { gte: weekStart, lt: addDays(weekStart, 7) } } },
      dailyLogs: { where: { date: { gte: addDays(now, -7) } } },
      measurements: { orderBy: { date: "desc" }, take: 1 },
      habits: { where: { active: true }, include: { logs: { where: { date: { gte: addDays(now, -7) } } } } },
    },
  });
  if (!client) return null;
  const existing = client.checkIns[0];
  const done = client.workoutSessions.filter((s) => s.status === "COMPLETED").length;
  const planned = client.workoutSessions.filter((s) => s.status !== "SKIPPED" && s.status !== "RESCHEDULED").length || client.plannedSessionsPerWeek;
  const sleepAvg = mean(client.dailyLogs.map((l) => l.sleepHours).filter((x): x is number => x !== null));
  const habitsExpected = client.habits.reduce((a, h) => a + Math.min(7, h.daysPerWeek), 0);
  const habitsDone = client.habits.reduce((a, h) => a + h.logs.filter((l) => l.done).length, 0);
  const scale = [1, 2, 3, 4, 5].map((n) => t(locale, `scale.${n}`));

  if (existing?.submittedAt) {
    return (
      <div className="space-y-4">
        <div>
          <BackLink label={t(locale, "common.back")} />
          <PageHeader title={t(locale, "client.checkin.title")} />
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-good/40 bg-good-soft px-4 py-3.5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" />
          <p className="text-[13.5px] font-medium text-good">{t(locale, "client.checkin.already")}</p>
        </div>
      </div>
    );
  }

  return (
    <ActionForm action={submitCheckInAction} className="space-y-4">
      <div>
        <BackLink label={t(locale, "common.back")} />
        <PageHeader title={t(locale, "client.checkin.title")} sub={t(locale, "client.checkin.sub")} />
      </div>

      <Panel className="space-y-4 p-4">
        <SectionTitle n={1} title={t(locale, "client.checkin.section.body")} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t(locale, "client.checkin.weight")}>
            <input name="weightKg" type="number" step="0.1" min={20} max={400} defaultValue={client.measurements[0]?.weightKg ?? ""} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label={t(locale, "client.checkin.sleep")}>
            <input name="sleepAvgHours" type="number" step="0.1" min={0} max={16} defaultValue={sleepAvg === null ? "" : round(sleepAvg, 1)} className={inputClass} inputMode="decimal" />
          </Field>
        </div>
        <Field label={t(locale, "client.checkin.energy")}>
          <Scale name="energy" defaultValue={3} labels={scale} />
        </Field>
        <Field label={t(locale, "client.checkin.soreness")}>
          <Scale name="soreness" defaultValue={2} labels={scale} />
        </Field>
        <Field label={t(locale, "client.checkin.stress")}>
          <Scale name="stress" defaultValue={2} labels={scale} />
        </Field>
      </Panel>

      <Panel className="space-y-4 p-4">
        <SectionTitle n={2} title={t(locale, "client.checkin.section.training")} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t(locale, "client.checkin.training")}>
            <input name="trainingCompleted" type="number" min={0} max={14} defaultValue={done} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label={t(locale, "program.sessionsPerWeek")}>
            <input name="trainingPlanned" type="number" min={0} max={14} defaultValue={planned} className={inputClass} inputMode="numeric" />
          </Field>
        </div>
        <Field label={t(locale, "client.checkin.nutrition")}>
          <Scale name="nutritionAdherence" defaultValue={3} labels={scale} />
        </Field>
        <Field label={t(locale, "client.checkin.habits")}>
          <input name="habitAdherencePct" type="number" min={0} max={100} defaultValue={habitsExpected ? Math.round((habitsDone / habitsExpected) * 100) : ""} className={inputClass} inputMode="numeric" />
        </Field>
      </Panel>

      <Panel className="space-y-4 p-4">
        <SectionTitle n={3} title={t(locale, "client.checkin.section.week")} />
        <Field label={t(locale, "client.checkin.wins")}>
          <input name="wins" className={inputClass} maxLength={500} />
        </Field>
        <Field label={t(locale, "client.checkin.struggles")}>
          <input name="struggles" className={inputClass} maxLength={500} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">{t(locale, "client.checkin.friction")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {FRICTION_CATEGORIES.map((f) => (
              <label key={f} className="cursor-pointer">
                <input type="checkbox" name={`tag:${f}`} value="1" className="peer sr-only" />
                <span className="inline-flex min-h-11 items-center rounded-full border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium text-ink-2 transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {tx(locale, `friction.${f}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t(locale, "client.checkin.free")}>
          <textarea name="freeText" className={textareaClass} rows={3} maxLength={1000} />
        </Field>
      </Panel>

      <Button type="submit" variant="neon" size="lg" className="h-14 w-full justify-between rounded-lg ps-5 pe-3 text-[15px]">
        <span>{t(locale, "client.checkin.submit")}</span>
        <CtaArrow />
      </Button>
    </ActionForm>
  );
}
