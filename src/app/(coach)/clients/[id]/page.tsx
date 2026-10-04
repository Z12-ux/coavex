import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCw, Target } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { loadClientProfile } from "@/server/client-profile";
import { recomputeClientAction } from "@/server/actions/intelligence";
import { updateClientStatusAction } from "@/server/actions/clients";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import { CLIENT_STATUSES } from "@/domain/types";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Tabs, cn, selectClass, statusTone } from "@/components/ui";
import { ProfileActions } from "@/components/client/profile-actions";
import { OverviewTab } from "@/components/client/overview";
import { TrainingTab } from "@/components/client/training";
import { NutritionTab, RecoveryTab, HabitsTab } from "@/components/client/wellbeing";
import { CheckInsTab } from "@/components/client/checkins";
import { TimelineTab } from "@/components/client/timeline";
import { NotesTab } from "@/components/client/notes";
import { BusinessTab } from "@/components/client/business";
import { PhotosTab } from "@/components/client/photos";
import { ProfileStats } from "@/components/client/profile-stats";
import { AvatarRing } from "@/components/stat-card";

export const dynamic = "force-dynamic";

const TABS = ["overview", "photos", "training", "nutrition", "recovery", "habits", "checkins", "timeline", "notes", "business"] as const;
type Tab = (typeof TABS)[number];

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; add?: string; done?: string; pr?: string }> }) {
  const user = await pageUser("staff");
  const locale = user.locale;
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const p = await loadClientProfile(id, user.orgId, locale);
  if (!p) notFound();
  const c = p.client;
  const name = `${c.firstName} ${c.lastName}`;
  const goal = c.goals.find((g) => g.isPrimary) ?? c.goals[0];
  const pendingCi = p.checkIns.filter((x) => x.status === "SUBMITTED").length;
  const negSignals = p.signals.filter((s) => s.polarity === "NEGATIVE").length;
  const base = `/clients/${c.id}`;
  const now = new Date();
  const nextSession = [...c.workoutSessions].filter((s) => s.status === "SCHEDULED" && s.scheduledFor >= new Date(now.getTime() - 86_400_000)).sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0] ?? null;
  const topAction = p.actions[0] && p.actions[0].kind !== "NO_ACTION" ? p.actions[0] : null;
  const momentumTone = p.momentum.status === "IMPROVING" ? "good" : p.momentum.status === "DECLINING" ? "bad" : "neutral";
  const actionProps = { clientId: c.id, clientName: name, locale, nextSessionId: nextSession?.id ?? null, doneMessage: sp.done, prMessage: sp.pr };
  const lastWeight = c.measurements.filter((m) => m.weightKg !== null).at(-1)?.weightKg ?? null;
  const goalPct = goal && goal.startValue !== null && goal.targetValue !== null && lastWeight !== null && goal.startValue !== goal.targetValue ? Math.max(0, Math.min(1, (goal.startValue - lastWeight) / (goal.startValue - goal.targetValue))) : null;

  return (
    <div className="mx-auto max-w-6xl pb-20 lg:pb-0">
      {/* Athlete card: identity → goal → status → next action → the one CTA. Sticky on phones so the coach never loses context. */}
      <header className="sticky top-14 z-20 -mx-4 mb-4 border-b border-border bg-bg/95 px-4 pt-2 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="relative lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-5">
          <span aria-hidden className="bg-grid pointer-events-none absolute inset-0 hidden opacity-60 [mask-image:radial-gradient(70%_140%_at_100%_0%,black,transparent_70%)] lg:block" />
          <div className="relative flex items-start gap-3 lg:gap-4">
            <AvatarRing name={name} size={48} value={goalPct} className="mt-0.5" label={t(locale, "client.goal")} />
            <div className="min-w-0 flex-1">
              {/* segments never break internally: on narrow desktops the line wraps between them */}
              <p className="t-kicker hidden sm:block">
                {[`${t(locale, "client.since")} ${fmtDate(c.onboardedAt, locale, { day: "numeric", month: "short", year: "numeric" })}`, `${c.plannedSessionsPerWeek} ${t(locale, "client.plannedSessions").toLowerCase()}`, `${t(locale, "client.checkInDay")}: ${t(locale, `day.${c.checkInWeekday}`)}`].map((seg, i) => (
                  <span key={i}>
                    {i ? " · " : null}
                    <span className="whitespace-nowrap">{seg}</span>
                  </span>
                ))}
              </p>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:mt-1">
                {/* .t-title is unlayered CSS: the desktop size needs the important modifier to win over it */}
                <h1 className="t-title min-w-0 max-w-full truncate lg:text-[38px]! lg:leading-[40px]!">{name}</h1>
                <Badge tone={statusTone(c.status)}>{t(locale, `status.${c.status}`)}</Badge>
                {p.momentum.status !== "INSUFFICIENT_DATA" ? (
                  <Badge tone={momentumTone}>
                    {p.momentum.status === "IMPROVING" ? "↑" : p.momentum.status === "DECLINING" ? "↓" : "→"} {t(locale, "client.momentum")}
                  </Badge>
                ) : null}
              </div>
              {goal ? (
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                  <Target className="size-3.5 shrink-0 text-accent" aria-hidden />
                  <span className="truncate font-medium">{goal.title}</span>
                  {goalPct !== null ? <span className="tnum shrink-0 font-display text-[15px] font-bold leading-none text-accent">{Math.round(goalPct * 100)}%</span> : null}
                </p>
              ) : null}
              {topAction ? (
                <p className="mt-1.5 hidden min-w-0 items-center gap-2 text-[13px] sm:flex">
                  <span className="t-kicker shrink-0">{t(locale, "cc.nextAction")}</span>
                  <span className="truncate font-medium text-ink">{topAction.title}</span>
                </p>
              ) : null}
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-2.5 lg:flex">
              <div className="flex items-center gap-1">
                <ActionForm action={updateClientStatusAction} className="flex items-center gap-1" toast={t(locale, "toast.updated")}>
                  <input type="hidden" name="clientId" value={c.id} />
                  <select name="status" defaultValue={c.status} className={cn(selectClass, "h-9 w-auto text-[12.5px]")} aria-label={t(locale, "clients.status")}>
                    {CLIENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(locale, `status.${s}`)}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" type="submit">
                    {t(locale, "common.save")}
                  </Button>
                </ActionForm>
                <ActionForm action={recomputeClientAction.bind(null, c.id)} toast={t(locale, "toast.updated")}>
                  <Button size="sm" variant="ghost" type="submit" title={t(locale, "cc.recompute")} aria-label={t(locale, "cc.recompute")}>
                    <RefreshCw className="size-4" />
                  </Button>
                </ActionForm>
              </div>
              <ProfileActions {...actionProps} variant="inline" />
            </div>
          </div>
        </div>
        <div className="mt-2 lg:mt-3">
          <Tabs
            base={base}
            current={tab}
            items={[
              { key: "overview", label: t(locale, "client.overview"), count: negSignals },
              { key: "photos", label: t(locale, "client.photos"), count: c.progressPhotos.length },
              { key: "training", label: t(locale, "client.training") },
              { key: "nutrition", label: t(locale, "client.nutrition") },
              { key: "recovery", label: t(locale, "client.recovery") },
              { key: "habits", label: t(locale, "client.habits") },
              { key: "checkins", label: t(locale, "client.checkins"), count: pendingCi },
              { key: "timeline", label: t(locale, "client.timeline") },
              { key: "notes", label: t(locale, "client.notes"), count: c.notes.filter((n) => n.pinned).length },
              { key: "business", label: t(locale, "client.business") },
            ]}
          />
        </div>
      </header>

      {/* Phones: contextual action bar pinned above the bottom nav */}
      <div className="lg:hidden">
        <ProfileActions {...actionProps} variant="bar" />
      </div>

      {tab === "overview" ? <ProfileStats p={p} locale={locale} nextSession={nextSession} /> : null}

      <div className="mt-2">
        {tab === "overview" ? <OverviewTab p={p} locale={locale} showAddMeasurement={sp.add === "measurement"} /> : null}
        {tab === "photos" ? <PhotosTab p={p} locale={locale} /> : null}
        {tab === "training" ? <TrainingTab p={p} locale={locale} nextSessionId={nextSession?.id ?? null} /> : null}
        {tab === "nutrition" ? <NutritionTab p={p} locale={locale} /> : null}
        {tab === "recovery" ? <RecoveryTab p={p} locale={locale} /> : null}
        {tab === "habits" ? <HabitsTab p={p} locale={locale} /> : null}
        {tab === "checkins" ? <CheckInsTab p={p} locale={locale} /> : null}
        {tab === "timeline" ? <TimelineTab p={p} locale={locale} /> : null}
        {tab === "notes" ? <NotesTab p={p} locale={locale} /> : null}
        {tab === "business" ? <BusinessTab p={p} locale={locale} /> : null}
      </div>
      <p className="t-meta mt-8 text-center">
        {t(locale, "common.assist")} · <Link href="/" className="hover:text-ink hover:underline">{t(locale, "nav.command")}</Link>
      </p>
    </div>
  );
}
