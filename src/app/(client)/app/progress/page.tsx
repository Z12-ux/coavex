import { pageUser } from "@/server/auth/session";
import { buildSnapshot } from "@/server/snapshot";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtSigned } from "@/lib/format";
import { addDays, bestE1rmByExercise, round, weeklyCompletion, weeklyTopLoad } from "@/domain/stats";
import { Badge, PageHeader, Panel, PanelHeader, cn } from "@/components/ui";
import { Trophy } from "lucide-react";
import { BarStrip, Sparkline } from "@/components/charts";
import { db } from "@/server/db";
import { toPhotoItems } from "@/lib/photos";
import { addMyPhotoAction, deleteMyPhotoAction } from "@/server/actions/client-app";
import { PhotoGallery } from "@/components/photos/photo-gallery";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const user = await pageUser("client");
  const locale = user.locale;
  const snap = await buildSnapshot(user.clientId!);
  if (!snap) return null;
  const photoRows = await db.progressPhoto.findMany({ where: { clientId: user.clientId! }, orderBy: { date: "asc" } });
  const photos = toPhotoItems(photoRows, snap.measurements);
  const goal = snap.goals.find((g) => g.isPrimary);
  const weights = snap.measurements.filter((m) => m.weightKg !== null);
  const weekly = weeklyCompletion(snap.sessions, snap.now, 8);
  const loads = weeklyTopLoad(snap.sets, snap.now, 8);
  const prs = [...bestE1rmByExercise(snap.sets, addDays(snap.now, -365), addDays(snap.now, 1)).values()].sort((a, b) => b.e1rm - a.e1rm);

  const lastW = weights.at(-1)?.weightKg ?? null;
  const firstW = weights[0]?.weightKg ?? null;
  const deltaW = lastW !== null && firstW !== null && weights.length >= 2 ? lastW - firstW : null;
  const goodDir = goal?.type === "MUSCLE_GAIN" ? 1 : goal?.type === "FAT_LOSS" ? -1 : 0;
  const deltaTone = deltaW === null || deltaW === 0 || goodDir === 0 ? "neutral" : Math.sign(deltaW) === goodDir ? "good" : "warn";
  const weeklyDone = weekly.reduce((a, w) => a + w.completed, 0);
  const weeklyPlanned = weekly.reduce((a, w) => a + w.planned, 0);

  return (
    <div className="space-y-4">
      <PageHeader title={t(locale, "client.progress.title")} />

      {/* Weight — big current value + area chart */}
      <Panel>
        <PanelHeader title={t(locale, "client.progress.weight")} action={deltaW !== null ? <Badge tone={deltaTone}>{fmtSigned(deltaW, 1, " kg")}</Badge> : null} />
        <div className="px-4 pb-4">
          {lastW !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className="t-metric-lg text-ink">{round(lastW, 1)}</span>
              <span className="text-[14px] font-semibold text-muted">kg</span>
              {weights.length ? <span className="ms-auto text-[12px] text-muted">{fmtDate(weights.at(-1)!.date, locale)}</span> : null}
            </div>
          ) : null}
          {weights.length >= 2 ? (
            <>
              {/* The SVG time axis runs left → right in every locale: keep its date labels in the same order in RTL. */}
              <div dir="ltr">
                <Sparkline values={weights.map((m) => m.weightKg)} labels={weights.map((m) => fmtDate(m.date, locale))} width={420} height={104} unit=" kg" area stroke={2.5} goodWhen={goal?.type === "MUSCLE_GAIN" ? "up" : goal?.type === "FAT_LOSS" ? "down" : undefined} className="mt-3 w-full" />
                <div className="tnum mt-1.5 flex justify-between text-[11.5px] text-muted">
                  <span>{fmtDate(weights[0].date, locale)}</span>
                  <span>{fmtDate(weights.at(-1)!.date, locale)}</span>
                </div>
              </div>
              {goal?.targetValue ? (
                <p className="mt-2.5 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                  {goal.title} · <span className="tnum font-semibold text-ink">{goal.startValue} → {goal.targetValue} kg</span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-muted">—</p>
          )}
        </div>
      </Panel>

      {/* Photos (gallery owned elsewhere — container only) */}
      <Panel>
        <PanelHeader title={t(locale, "client.progress.photos")} sub={photos.length ? `${photos.length} · ${t(locale, "photos.unit")}` : undefined} />
        <div className="px-4 pb-4">
          <PhotoGallery photos={photos} locale={locale} addAction={addMyPhotoAction} deleteAction={deleteMyPhotoAction} canDelete goalType={goal?.type ?? null} />
        </div>
      </Panel>

      {/* Regularity — 8 weekly bars */}
      <Panel>
        <PanelHeader
          title={t(locale, "client.progress.consistency")}
          sub={t(locale, "client.progress.last8w")}
          action={
            weeklyPlanned ? (
              <span className="tnum font-display text-[20px] font-bold leading-5 text-ink">
                {weeklyDone}
                <span className="text-[15px] text-muted">/{weeklyPlanned}</span>
              </span>
            ) : null
          }
        />
        {/* Bars (SVG) run oldest → newest left to right: the per-week counts under them must not flip in RTL. */}
        <div className="px-4 pb-4" dir="ltr">
          <BarStrip items={weekly.map((w, i) => ({ label: `S-${8 - i}`, value: w.rate, hint: `${w.completed}/${w.planned}` }))} width={420} height={56} className="w-full" />
          <div className="tnum mt-1.5 flex justify-between text-[11px] text-muted">
            {weekly.map((w, i) => (
              <span key={i}>
                {w.completed}/{w.planned}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      {/* Strength — top load per main lift */}
      {loads.size ? (
        <Panel>
          <PanelHeader title={t(locale, "client.progress.strength")} sub={t(locale, "client.progress.last8w")} />
          <ul className="divide-y divide-border px-4 pb-2">
            {[...loads.entries()].map(([id, l]) => {
              const current = [...l.loads].reverse().find((x) => x !== null) ?? null;
              return (
                <li key={id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{l.name}</div>
                    <div className="tnum mt-0.5 text-[11.5px] text-muted">{l.loads.map((x) => (x === null ? "–" : x)).join(" · ")} kg</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {current !== null ? (
                      <span className="tnum font-display text-[20px] font-bold leading-5 text-ink">
                        {current}
                        <span className="ms-0.5 text-[12px] font-semibold text-muted">kg</span>
                      </span>
                    ) : null}
                    <Sparkline values={l.loads} width={96} height={28} unit=" kg" goodWhen="up" area />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {/* Personal records — the top one in lime */}
      {prs.length ? (
        <Panel>
          <PanelHeader title={t(locale, "client.progress.prs")} />
          <ul className="grid grid-cols-2 gap-2 px-4 pb-4 text-[13px]">
            {prs.map((p, i) => (
              <li key={p.name} className={cn("rounded-lg border px-3 py-2.5", i === 0 ? "neon-edge bg-accent-soft" : "border-border-strong bg-surface-2")}>
                <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <Trophy className={cn("size-3.5 shrink-0", i === 0 ? "text-accent" : "text-muted")} />
                  <span className="truncate">{p.name}</span>
                </div>
                <div className={cn("tnum mt-1 font-display text-[24px] font-bold leading-7", i === 0 ? "text-accent" : "text-ink")}>
                  {p.weightKg}
                  <span className="ms-0.5 text-[13px] font-semibold text-muted">kg</span>
                  <span className="ms-1 text-[14px] font-semibold text-ink-2">× {p.reps}</span>
                </div>
                <div className="tnum text-[11.5px] text-muted">1RM ~{round(p.e1rm, 0)} kg</div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
