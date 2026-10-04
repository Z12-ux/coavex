import { ActionForm } from "@/components/action-form";
import { Star } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { can } from "@/lib/rbac";
import { Avatar, Badge, Button, Field, PageHeader, Panel, PanelHeader, inputClass, selectClass } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { MUSCLE_GROUPS } from "@/components/muscle-map";
import { addExerciseAction, setLocaleAction, updateOrgAction } from "@/server/actions/settings";
import { aiStatus } from "@/server/ai";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await pageUser("staff");
  const locale = user.locale;
  const [org, team, exercises] = await Promise.all([
    db.organization.findUnique({ where: { id: user.orgId } }),
    db.user.findMany({ where: { orgId: user.orgId, role: { not: "CLIENT" } }, select: { id: true, name: true, email: true, role: true, lastActiveAt: true } }),
    db.exercise.findMany({ where: { OR: [{ orgId: null }, { orgId: user.orgId }] }, orderBy: [{ isMainLift: "desc" }, { name: "asc" }] }),
  ]);
  const ai = aiStatus();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t(locale, "settings.title")} />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <PanelHeader title={t(locale, "settings.appearance")} sub={t(locale, "settings.appearance.sub")} />
          <div className="px-4 pb-4">
            <ThemeToggle labels={{ toLight: t(locale, "theme.toLight"), toDark: t(locale, "theme.toDark") }} withLabel className="h-11 w-full justify-start border border-border-strong bg-surface-2 px-3 font-medium text-ink hover:border-accent/40" />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title={t(locale, "settings.locale")} />
          <ActionForm action={setLocaleAction} className="flex items-end gap-2 px-4 pb-4" toast={t(locale, "toast.saved")}>
            <Field label={t(locale, "settings.locale")} className="flex-1">
              <select name="locale" defaultValue={locale} className={selectClass}>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Button type="submit" className="h-11">
              {t(locale, "form.saveSettings")}
            </Button>
          </ActionForm>
        </Panel>
      </div>
      <Panel>
        <PanelHeader title={t(locale, "settings.ai")} />
        <div className="px-4 pb-4 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-muted">{t(locale, "settings.aiStatus")}</span>
            <Badge tone={ai.enabled ? "good" : "neutral"}>{ai.enabled ? `${t(locale, "messages.aiOn")} · ${ai.model}` : t(locale, "messages.aiOff")}</Badge>
          </div>
          <p className="mt-2 leading-5 text-ink-2">{t(locale, ai.enabled ? "settings.ai.on" : "settings.ai.off")}</p>
        </div>
      </Panel>
      {can(user.role, "org:manage") && org ? (
        <Panel>
          <PanelHeader title={t(locale, "settings.org")} />
          <ActionForm action={updateOrgAction} className="grid gap-3 px-4 pb-4 sm:grid-cols-[1fr_200px_auto] sm:items-end" toast={t(locale, "toast.saved")}>
            <Field label={t(locale, "settings.org")}>
              <input name="name" defaultValue={org.name} className={inputClass} />
            </Field>
            <Field label={t(locale, "settings.locale")}>
              <select name="locale" defaultValue={org.locale} className={selectClass}>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Button type="submit" className="h-11">
              {t(locale, "form.saveSettings")}
            </Button>
          </ActionForm>
        </Panel>
      ) : null}
      <Panel>
        <PanelHeader title={t(locale, "settings.team")} action={<Badge tone="neutral">{team.length}</Badge>} />
        <ul className="divide-y divide-border px-4 pb-3">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
              <Avatar name={m.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{m.name}</span>
                <span className="block truncate text-[12.5px] text-muted">{m.email}</span>
              </span>
              <Badge tone="neutral" className="uppercase tracking-[0.08em]">
                {t(locale, `role.${m.role}`)}
              </Badge>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel id="exercises">
        <PanelHeader title={t(locale, "settings.exercises")} action={<Badge tone="neutral">{exercises.length}</Badge>} />
        <div className="px-4 pb-4">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {exercises.map((e) => (
              <span key={e.id} className={e.isMainLift ? "inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-ink" : "rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[12.5px] text-ink-2"} title={t(locale, `muscle.${e.muscleGroup}`)}>
                {e.name}
                {e.isMainLift ? (
                  <>
                    <Star className="size-3 fill-current text-accent" aria-hidden />
                    <span className="sr-only">★</span>
                  </>
                ) : null}
              </span>
            ))}
          </div>
          {can(user.role, "programs:write") ? (
            <ActionForm action={addExerciseAction} className="grid gap-2 border-t border-border pt-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end" toast={t(locale, "toast.saved")}>
              <Field label={t(locale, "settings.ex.name")}>
                <input name="name" required className={inputClass} />
              </Field>
              <Field label={t(locale, "settings.ex.group")}>
                <select name="muscleGroup" className={selectClass}>
                  {MUSCLE_GROUPS.map((x) => (
                    <option key={x} value={x}>
                      {t(locale, `muscle.${x}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t(locale, "settings.ex.pattern")}>
                <select name="pattern" className={selectClass}>
                  {["SQUAT", "HINGE", "PUSH_H", "PUSH_V", "PULL_H", "PULL_V", "LUNGE", "CARRY", "CORE", "CARDIO"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label={t(locale, "settings.ex.equipment")}>
                <select name="equipment" className={selectClass}>
                  {["BARBELL", "DUMBBELL", "MACHINE", "CABLE", "BODYWEIGHT", "BAND", "KETTLEBELL"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Button type="submit" variant="outline" className="h-11" aria-label={t(locale, "common.save")}>
                +
              </Button>
            </ActionForm>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
