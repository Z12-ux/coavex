"use client";

import { useActionState, useState, type ReactNode } from "react";
import { KeyRound, Target, UserRound } from "lucide-react";
import type { Locale } from "@/domain/types";
import { GOAL_TYPES } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { createClientAction, type FormState } from "@/server/actions/clients";
import { Button, CtaArrow, Field, inputClass, selectClass } from "@/components/ui";

function Legend({ icon: Icon, children }: { icon: typeof UserRound; children: ReactNode }) {
  return (
    <legend className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-2">
      <span className="grid size-7 place-items-center rounded-md border border-accent/25 bg-accent-soft text-accent">
        <Icon className="size-3.5" />
      </span>
      {children}
    </legend>
  );
}

export function NewClientForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createClientAction, undefined);
  const [login, setLogin] = useState(false);
  return (
    <form action={action} className="space-y-6 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <fieldset>
        <Legend icon={UserRound}>{t(locale, "client.contact")}</Legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t(locale, "form.firstName")} required>
            <input name="firstName" required className={inputClass} autoFocus />
          </Field>
          <Field label={t(locale, "form.lastName")} required>
            <input name="lastName" required className={inputClass} />
          </Field>
          <Field label={t(locale, "form.phone")}>
            <input name="phone" className={inputClass} placeholder="+213 …" inputMode="tel" />
          </Field>
          <Field label={t(locale, "form.email")}>
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label={t(locale, "form.locale")}>
            <select name="preferredLocale" className={selectClass} defaultValue="fr">
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t(locale, "form.checkInDay")}>
            <select name="checkInWeekday" className={selectClass} defaultValue="0">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {t(locale, `day.${d}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-t border-border pt-5">
        <Legend icon={Target}>{t(locale, "client.goal")}</Legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t(locale, "form.goalType")} required>
            <select name="goalType" className={selectClass} defaultValue="FAT_LOSS">
              {GOAL_TYPES.map((g) => (
                <option key={g} value={g}>
                  {t(locale, `goal.type.${g}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t(locale, "form.goalTitle")} required>
            <input name="goalTitle" required className={inputClass} placeholder={t(locale, "form.goalTitle.placeholder")} />
          </Field>
          <Field label={t(locale, "form.startWeight")}>
            <input name="startWeight" type="number" step="0.1" min="20" max="400" className={inputClass} inputMode="decimal" />
          </Field>
          <Field label={t(locale, "form.targetWeight")}>
            <input name="targetWeight" type="number" step="0.1" min="20" max="400" className={inputClass} inputMode="decimal" />
          </Field>
          <Field label={t(locale, "form.targetDate")}>
            <input name="targetDate" type="date" className={inputClass} />
          </Field>
          <Field label={t(locale, "form.sessionsPerWeek")}>
            <input name="plannedSessionsPerWeek" type="number" min="1" max="7" defaultValue={3} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-border pt-5">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-2 px-3 text-[13.5px] text-ink-2 has-[:checked]:border-accent/50 has-[:checked]:bg-accent-soft has-[:checked]:text-ink">
          <input type="checkbox" name="createLogin" value="1" checked={login} onChange={(e) => setLogin(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          <KeyRound className="size-4 shrink-0 text-muted" />
          <span className="font-medium">{t(locale, "form.createLogin")}</span>
        </label>
        {login ? (
          <Field label={t(locale, "form.password")} hint={t(locale, "form.password.hint")} required>
            <input name="password" type="password" minLength={8} className={inputClass} required />
          </Field>
        ) : null}
      </fieldset>

      {state?.error ? (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {t(locale, state.error === "email_taken" ? "form.error.emailTaken" : state.error === "password" ? "form.error.passwordRequired" : "error.generic")}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="neon" size="lg" disabled={pending} className="w-full justify-between pe-2.5 ps-5 sm:w-auto sm:min-w-[280px]">
          <span>{pending ? t(locale, "common.loading") : t(locale, "form.createClient")}</span>
          <CtaArrow />
        </Button>
      </div>
    </form>
  );
}
