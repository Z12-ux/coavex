import { ActionForm } from "@/components/action-form";
import type { ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { tx } from "@/domain/catalog";
import { fmtDate } from "@/lib/format";
import { addDays, isSameDay, mean, round, startOfDay } from "@/domain/stats";
import type { ClientProfile } from "@/server/client-profile";
import { addHabitAction, setNutritionPlanAction, toggleHabitAction } from "@/server/actions/clients";
import { Badge, Button, EmptyState, Field, Panel, PanelHeader, cn, inputClass, selectClass, textareaClass } from "@/components/ui";
import { RingGauge, Sparkline } from "@/components/charts";

/** Bordered stat tile: kicker label, big condensed number (reference "SETS · REPS · REST"). */
function Tile({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 py-2.5">
      <div className="truncate text-[11px] font-semibold uppercase leading-[13px] tracking-[0.08em] text-muted">{label}</div>
      <div className="tnum mt-1 flex items-baseline gap-1 font-display text-[24px] font-bold leading-7 text-ink">
        {value}
        {unit ? <span className="font-sans text-[12px] font-medium text-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

const summaryCls = "inline-flex min-h-9 cursor-pointer items-center text-[12.5px] font-semibold text-accent";

export function NutritionTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const c = p.client;
  const plan = c.nutritionPlans[0];
  const logs = [...c.dailyLogs].reverse();
  const adh7 = mean(logs.filter((l) => l.date >= addDays(new Date(), -7)).map((l) => l.nutritionAdherence).filter((x): x is number => x !== null));
  const macro = (label: string, v: number | null | undefined, unit: string) => <Tile label={label.replace(/\s*\((g|kcal)\)$/, "")} value={v ? v : "–"} unit={v ? unit : undefined} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader title={t(locale, "client.nutritionPlan")} action={plan ? <Badge tone="neutral">{plan.approach}</Badge> : null} />
        <div className="px-4 pb-4 text-[13px]">
          {plan ? (
            <>
              <div className="flex items-center gap-4">
                <RingGauge value={adh7 === null ? null : adh7 / 5} size={76} stroke={6} tone={adh7 === null || adh7 >= 3.5 ? "accent" : adh7 >= 2.5 ? "warn" : "bad"} label={t(locale, "clients.adherence")}>
                  <span className="tnum block font-display text-[20px] font-bold leading-5 text-ink">{adh7 === null ? "–" : round(adh7, 1)}</span>
                  <span className="text-[10.5px] text-muted">/5</span>
                </RingGauge>
                <div className="min-w-0">
                  <div className="t-kicker">{t(locale, "clients.adherence")}</div>
                  <div className="tnum mt-1 text-[13px] text-ink-2">{adh7 === null ? "–" : `${round(adh7, 1)}/5 (7 j)`}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {macro(t(locale, "form.calories"), plan.caloriesTarget, "kcal")}
                {macro(t(locale, "form.protein"), plan.proteinG, "g")}
                {macro(t(locale, "form.carbs"), plan.carbsG, "g")}
                {macro(t(locale, "form.fat"), plan.fatG, "g")}
              </div>
              {plan.notes ? <p className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{plan.notes}</p> : null}
            </>
          ) : (
            <EmptyState compact title={t(locale, "client.nutrition.none")} why={t(locale, "client.nutrition.noneWhy")} />
          )}
          <details className="mt-3 border-t border-border pt-2">
            <summary className={summaryCls}>{plan ? t(locale, "common.edit") : t(locale, "client.nutrition.create")}</summary>
            <ActionForm action={setNutritionPlanAction} className="mt-2 grid grid-cols-2 gap-2" toast={t(locale, "toast.saved")}>
              <input type="hidden" name="clientId" value={c.id} />
              <Field label="Approche" className="col-span-2">
                <select name="approach" className={selectClass} defaultValue={plan?.approach ?? "FLEXIBLE"}>
                  <option value="FLEXIBLE">Flexible (macros)</option>
                  <option value="MEAL_PLAN">Plan de repas</option>
                  <option value="HABIT_BASED">Habitudes</option>
                </select>
              </Field>
              <Field label={t(locale, "form.calories")}>
                <input name="caloriesTarget" type="number" defaultValue={plan?.caloriesTarget ?? ""} className={inputClass} />
              </Field>
              <Field label={t(locale, "form.protein")}>
                <input name="proteinG" type="number" defaultValue={plan?.proteinG ?? ""} className={inputClass} />
              </Field>
              <Field label={t(locale, "form.carbs")}>
                <input name="carbsG" type="number" defaultValue={plan?.carbsG ?? ""} className={inputClass} />
              </Field>
              <Field label={t(locale, "form.fat")}>
                <input name="fatG" type="number" defaultValue={plan?.fatG ?? ""} className={inputClass} />
              </Field>
              <Field label={t(locale, "form.note")} className="col-span-2">
                <textarea name="notes" className={textareaClass} defaultValue={plan?.notes ?? ""} rows={2} />
              </Field>
              <Button type="submit" size="sm" className="col-span-2">
                {t(locale, "form.saveTargets")}
              </Button>
            </ActionForm>
          </details>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title={t(locale, "client.checkin.nutrition")} sub="28 j" />
        <div className="px-4 pb-4">
          {logs.length >= 2 ? <Sparkline values={logs.map((l) => l.nutritionAdherence)} labels={logs.map((l) => fmtDate(l.date, locale))} width={420} height={72} unit="/5" goodWhen="up" area className="w-full" /> : <p className="text-[13px] text-muted">—</p>}
          <ul className="mt-3 max-h-64 divide-y divide-border overflow-auto border-t border-border text-[12.5px]">
            {[...logs].reverse().map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2">
                <span className="tnum w-20 shrink-0 text-muted">{fmtDate(l.date, locale)}</span>
                <span className="tnum shrink-0 font-display text-[15px] font-bold text-ink">
                  {l.nutritionAdherence ?? "–"}
                  <span className="font-sans text-[11.5px] font-medium text-muted">/5</span>
                </span>
                {l.note ? <span className="truncate text-muted">{l.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

export function RecoveryTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const c = p.client;
  const logs = [...c.dailyLogs].reverse();
  const labels = logs.map((l) => fmtDate(l.date, locale));
  const metric = (k: "sleepHours" | "energy" | "soreness" | "stress" | "perceivedRecovery", title: string, unit: string, goodWhen: "up" | "down") => {
    const m = mean(logs.slice(-7).map((l) => l[k]).filter((x): x is number => x !== null));
    return (
      <Panel key={k} className="flex flex-col px-4 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold uppercase leading-5 tracking-[0.12em] text-ink-2">{title}</h3>
          <span className="shrink-0 text-[11.5px] text-muted">7 j</span>
        </div>
        <div className="tnum mt-1 flex items-baseline gap-1 font-display text-[30px] font-bold leading-8 text-ink">
          {m === null ? "–" : round(m, 1)}
          {m === null ? null : <span className="font-sans text-[13px] font-medium text-muted">{unit.trim()}</span>}
        </div>
        <div className="mt-2">{logs.length >= 2 ? <Sparkline values={logs.map((l) => l[k])} labels={labels} width={380} height={48} unit={unit} goodWhen={goodWhen} area className="w-full" /> : <p className="text-[13px] text-muted">—</p>}</div>
      </Panel>
    );
  };
  const th = "py-2 pe-3 text-start text-[11px] font-semibold uppercase tracking-[0.08em] text-muted";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metric("sleepHours", t(locale, "client.checkin.sleep"), " h", "up")}
        {metric("energy", t(locale, "client.checkin.energy"), "/5", "up")}
        {metric("perceivedRecovery", tx(locale, "ev.recovery"), "/5", "up")}
        {metric("soreness", t(locale, "client.checkin.soreness"), "/5", "down")}
        {metric("stress", t(locale, "client.checkin.stress"), "/5", "down")}
      </div>
      <Panel>
        <PanelHeader title={t(locale, "client.dailyLogs")} sub="28 j" />
        <div className="overflow-x-auto px-4 pb-4">
          {logs.length ? (
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>{t(locale, "form.date")}</th>
                  <th className={th}>{t(locale, "client.checkin.sleep")}</th>
                  <th className={th}>{t(locale, "client.checkin.energy")}</th>
                  <th className={th}>{tx(locale, "ev.recovery")}</th>
                  <th className={th}>{t(locale, "client.checkin.soreness")}</th>
                  <th className={th}>{t(locale, "client.checkin.stress")}</th>
                  <th className={th}>{t(locale, "client.checkin.nutrition")}</th>
                  <th className={th}>{t(locale, "form.note")}</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-border text-ink-2">
                {c.dailyLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-2">
                    <td className="py-1.5 pe-3 text-muted">{fmtDate(l.date, locale)}</td>
                    <td className="py-1.5 pe-3 font-medium text-ink">{l.sleepHours ?? "–"}</td>
                    <td className="py-1.5 pe-3">{l.energy ?? "–"}</td>
                    <td className="py-1.5 pe-3">{l.perceivedRecovery ?? "–"}</td>
                    <td className="py-1.5 pe-3">{l.soreness ?? "–"}</td>
                    <td className="py-1.5 pe-3">{l.stress ?? "–"}</td>
                    <td className="py-1.5 pe-3">{l.nutritionAdherence ?? "–"}</td>
                    <td className="py-1.5 text-muted">{l.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="—" why={t(locale, "client.noCheckinsWhy")} />
          )}
        </div>
      </Panel>
    </div>
  );
}

export function HabitsTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const c = p.client;
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), -13 + i));
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title={t(locale, "client.habits")} sub="14 j" />
        <div className="overflow-x-auto px-4 pb-4">
          {c.habits.length ? (
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="py-1 text-start font-medium"></th>
                  {days.map((d) => (
                    <th key={d.toISOString()} className="tnum py-1 text-center font-medium">
                      {fmtDate(d, locale, { day: "numeric" })}
                    </th>
                  ))}
                  <th className="py-1 text-end font-medium">%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.habits.map((h) => {
                  const done = h.logs.filter((l) => l.done && l.date >= days[0]).length;
                  const expected = Math.round((h.daysPerWeek / 7) * 14);
                  const pct = expected ? Math.round((done / expected) * 100) : 0;
                  return (
                    <tr key={h.id} className={cn(!h.active && "opacity-50")}>
                      <td className="py-2 pe-3">
                        <div className="font-semibold text-ink">{h.name}</div>
                        <div className="tnum text-[11.5px] text-muted">
                          {h.target} {h.unit} · {h.daysPerWeek}/7
                        </div>
                      </td>
                      {days.map((d) => {
                        const log = h.logs.find((l) => isSameDay(l.date, d));
                        return (
                          <td key={d.toISOString()} className="py-2 text-center">
                            <span className={cn("inline-block size-4 rounded-[4px]", log?.done ? "bg-accent" : log ? "border border-border-strong bg-surface-3" : "bg-surface-2")} title={log ? `${log.value} ${h.unit}` : ""} />
                          </td>
                        );
                      })}
                      <td className={cn("tnum py-2 text-end font-display text-[17px] font-bold", pct >= 75 ? "text-ink" : pct >= 50 ? "text-warn" : "text-bad")}>{pct}%</td>
                      <td className="py-2 text-end">
                        <ActionForm action={toggleHabitAction} toast={t(locale, "toast.habit")}>
                          <input type="hidden" name="habitId" value={h.id} />
                          <Button size="sm" variant="ghost" type="submit">
                            {h.active ? "⏸" : "▶"}
                          </Button>
                        </ActionForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title={t(locale, "client.habits.none")} why={t(locale, "client.habits.noneWhy")} />
          )}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title={t(locale, "client.habits.create")} />
        <ActionForm action={addHabitAction} className="grid gap-2 px-4 pb-4 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] sm:items-end" toast={t(locale, "toast.saved")}>
          <input type="hidden" name="clientId" value={c.id} />
          <Field label={t(locale, "form.habitName")}>
            <input name="name" required className={inputClass} placeholder="10 000 pas" />
          </Field>
          <Field label="Type">
            <select name="kind" className={selectClass} defaultValue="CUSTOM">
              {["STEPS", "WATER", "SLEEP", "MOBILITY", "PROTEIN", "CUSTOM"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label={t(locale, "form.habitTarget")}>
            <input name="target" type="number" step="0.1" defaultValue={1} className={inputClass} />
          </Field>
          <Field label={t(locale, "form.habitUnit")}>
            <input name="unit" className={inputClass} placeholder="pas" />
          </Field>
          <Field label={t(locale, "form.daysPerWeek")}>
            <input name="daysPerWeek" type="number" min={1} max={7} defaultValue={7} className={inputClass} />
          </Field>
          <Button type="submit" variant="outline" className="h-11">
            {t(locale, "form.addHabit")}
          </Button>
        </ActionForm>
      </Panel>
    </div>
  );
}
