import { ActionForm } from "@/components/action-form";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { tx } from "@/domain/catalog";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import type { ClientProfile } from "@/server/client-profile";
import { reviewCheckInAction } from "@/server/actions/checkins";
import { Badge, Button, EmptyState, Field, Panel, TrendIcon, cn, inputClass, textareaClass } from "@/components/ui";
import { CheckInNarrative } from "./checkin-narrative";

/** Bordered metric tile (label on top, condensed value). */
function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-1 rounded-md border border-border-strong bg-surface-2 px-2.5 py-2">
      <dt className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.06em] text-muted">{label}</dt>
      <dd className="tnum font-display text-[20px] font-bold leading-6 text-ink">{children}</dd>
    </div>
  );
}

const Unit = ({ children }: { children: ReactNode }) => <span className="font-sans text-[11.5px] font-medium text-muted">{children}</span>;

export function CheckInsTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  if (!p.checkIns.length) return <EmptyState title={t(locale, "client.noCheckins")} why={t(locale, "client.noCheckinsWhy")} />;
  return (
    <div className="space-y-4">
      {p.checkIns.map((ci) => {
        const s = ci.summary;
        const pending = ci.status === "SUBMITTED";
        return (
          <Panel key={ci.id} as="article" className={cn("overflow-hidden", pending && "neon-edge")}>
            <header className="flex flex-wrap items-end gap-x-3 gap-y-1 px-4 pt-4">
              <div className="min-w-0">
                <div className="t-kicker">{t(locale, "common.week")}</div>
                <h3 className="mt-0.5 font-display text-[22px] font-bold uppercase leading-6 text-ink">{fmtDate(ci.weekStart, locale, { day: "numeric", month: "short" })}</h3>
              </div>
              <Badge tone={ci.status === "REVIEWED" ? "good" : pending ? "warn" : "neutral"} className="mb-0.5">
                {ci.status}
              </Badge>
              {ci.submittedAt ? <span className="tnum mb-0.5 ms-auto text-[12px] text-muted">{fmtDate(ci.submittedAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : null}
            </header>
            {ci.submittedAt ? (
              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                <div className="min-w-0 text-[13px]">
                  <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <Tile label={t(locale, "client.checkin.weight")}>{ci.weightKg ?? "–"}</Tile>
                    <Tile label={t(locale, "client.checkin.sleep")}>{ci.sleepAvgHours ?? "–"}</Tile>
                    <Tile label={t(locale, "client.checkin.energy")}>
                      {ci.energy ?? "–"}
                      <Unit>/5</Unit>
                    </Tile>
                    <Tile label={t(locale, "client.checkin.stress")}>
                      {ci.stress ?? "–"}
                      <Unit>/5</Unit>
                    </Tile>
                    <Tile label={t(locale, "client.checkin.training")}>
                      {ci.trainingCompleted ?? "–"}
                      <Unit>/{ci.trainingPlanned ?? "–"}</Unit>
                    </Tile>
                    <Tile label={t(locale, "client.checkin.nutrition")}>
                      {ci.nutritionAdherence ?? "–"}
                      <Unit>/5</Unit>
                    </Tile>
                    <Tile label={t(locale, "client.checkin.habits")}>
                      {ci.habitAdherencePct ?? "–"}
                      <Unit>%</Unit>
                    </Tile>
                  </dl>
                  {ci.wins ? (
                    <p className="mt-3 flex gap-2 text-ink-2">
                      <span className="font-bold text-good">✓</span>
                      <span>{ci.wins}</span>
                    </p>
                  ) : null}
                  {ci.struggles ? (
                    <p className="mt-1.5 flex gap-2 text-ink-2">
                      <span className="font-bold text-warn">!</span>
                      <span>{ci.struggles}</span>
                    </p>
                  ) : null}
                  {ci.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ci.tags.map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tx(locale, `friction.${tag}`)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {ci.freeText ? <p className="mt-2 border-s-2 border-border-strong ps-2.5 text-[12.5px] italic text-muted">« {ci.freeText} »</p> : null}
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-surface-2 p-3.5 text-[13px]">
                  <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                    <Sparkles className="size-3.5 text-accent" aria-hidden />
                    {t(locale, "cmd.checkins")} · {t(locale, "common.assist").split(":")[0]}
                  </div>
                  {s ? (
                    <>
                      <div className="grid grid-cols-4 gap-1 text-center text-[11.5px]">
                        {(["progress", "training", "nutrition", "recovery"] as const).map((k) => (
                          <div key={k} className="min-w-0 rounded-md border border-border bg-surface px-1 py-1.5">
                            <div className="truncate text-muted">{k === "progress" ? t(locale, "nav.progress") : k === "training" ? t(locale, "client.training") : k === "nutrition" ? t(locale, "client.nutrition") : t(locale, "client.recovery")}</div>
                            <TrendIcon trend={s[k]} className="mx-auto mt-0.5 size-5" />
                          </div>
                        ))}
                      </div>
                      {s.mainIssue ? (
                        <p className="mt-2.5 text-ink-2">
                          <span className="font-semibold text-ink">{locale === "ar" ? "المشكلة الرئيسية" : locale === "en" ? "Main issue" : "Problème principal"} · </span>
                          {s.mainIssue}
                        </p>
                      ) : null}
                      {s.coachingFocus ? (
                        <p className="mt-1 text-ink-2">
                          <span className="font-semibold text-ink">{locale === "ar" ? "محور التدريب" : locale === "en" ? "Coaching focus" : "Focus coaching"} · </span>
                          {s.coachingFocus}
                        </p>
                      ) : null}
                      <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-2">
                        {s.highlights.map((h) => (
                          <li key={h}>• {h}</li>
                        ))}
                        {s.concerns.map((h) => (
                          <li key={h} className="text-warn">
                            • {h}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <CheckInNarrative checkInId={ci.id} locale={locale} />
                  {pending ? (
                    <ActionForm action={reviewCheckInAction} className="mt-3 space-y-2.5 border-t border-border pt-3" toast={t(locale, "toast.reviewed")}>
                      <input type="hidden" name="checkInId" value={ci.id} />
                      <Field label={locale === "ar" ? "محور التدريب (تعديل)" : locale === "en" ? "Coaching focus (edit)" : "Focus coaching (modifier)"}>
                        <input name="coachingFocus" defaultValue={s?.coachingFocus ?? ""} className={inputClass} />
                      </Field>
                      <input type="hidden" name="mainIssue" value={s?.mainIssue ?? ""} />
                      <Field label={locale === "ar" ? "الرد على العميل" : locale === "en" ? "Reply to client" : "Réponse au client"}>
                        <textarea name="coachResponse" className={textareaClass} rows={3} placeholder="…" />
                      </Field>
                      <label className="flex min-h-9 items-center gap-2 text-[12.5px] text-ink-2">
                        <input type="checkbox" name="sendMessage" value="1" defaultChecked className="size-4 accent-[var(--accent)]" />
                        {t(locale, "messages.sendAs")}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <Button name="decision" value="APPROVE" size="md">
                          {t(locale, "common.approve")}
                        </Button>
                        <Button name="decision" value="EDIT" size="md" variant="outline">
                          {t(locale, "common.edit")}
                        </Button>
                        <Button name="decision" value="IGNORE" size="md" variant="ghost">
                          {t(locale, "common.ignore")}
                        </Button>
                      </div>
                    </ActionForm>
                  ) : ci.coachResponse ? (
                    <p className="mt-3 border-t border-border pt-2.5 text-[12.5px] text-ink-2">
                      <span className="text-muted">↩</span> {ci.coachResponse}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="px-4 pb-4 pt-2 text-[13px] text-muted">{t(locale, "sig.CHECKIN_OVERDUE.title")}</p>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
