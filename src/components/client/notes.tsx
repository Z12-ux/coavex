import { ActionForm } from "@/components/action-form";
import { Pin, Trash2 } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import type { ClientProfile } from "@/server/client-profile";
import { addNoteAction, deleteNoteAction, toggleNotePinAction, updateClientSettingsAction } from "@/server/actions/clients";
import { Badge, Button, EmptyState, Field, Panel, PanelHeader, cn, inputClass, selectClass, textareaClass } from "@/components/ui";

const CATS = ["PREFERENCE", "CONSTRAINT", "INJURY", "EQUIPMENT", "COMMUNICATION", "IMPORTANT_DATE", "DISLIKE", "GENERAL"];

export function NotesTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const c = p.client;
  const a = c.assessments[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        {c.notes.length ? (
          <ul className="space-y-2">
            {c.notes.map((n) => (
              <li key={n.id} className={cn("rounded-lg border bg-surface px-4 py-3 text-[13.5px]", n.pinned ? "neon-edge" : "border-border")}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {n.pinned ? <Pin className="size-3.5 text-accent" aria-hidden /> : null}
                      <Badge tone={n.category === "INJURY" ? "bad" : n.category === "CONSTRAINT" || n.category === "EQUIPMENT" ? "warn" : "neutral"}>{n.category}</Badge>
                      <span className="text-[12px] text-muted">
                        {n.author.name} · <span className="tnum">{fmtDate(n.createdAt, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-[21px] text-ink">{n.content}</p>
                  </div>
                  <ActionForm action={toggleNotePinAction} toast={t(locale, "toast.updated")}>
                    <input type="hidden" name="noteId" value={n.id} />
                    <Button size="sm" variant="ghost" type="submit" aria-label={t(locale, "form.pinned")} aria-pressed={n.pinned} className={cn("size-9 px-0", n.pinned && "text-accent")}>
                      <Pin className="size-4" />
                    </Button>
                  </ActionForm>
                  <ActionForm action={deleteNoteAction} toast={t(locale, "toast.updated")} confirm="Supprimer cette note ?">
                    <input type="hidden" name="noteId" value={n.id} />
                    <Button size="sm" variant="ghost" type="submit" aria-label={t(locale, "common.delete")} className="size-9 px-0 hover:text-bad">
                      <Trash2 className="size-4" />
                    </Button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t(locale, "client.noNotes")} why={t(locale, "client.noNotesWhy")} />
        )}
        <Panel>
          <PanelHeader title={t(locale, "client.addNote")} />
          <ActionForm action={addNoteAction} className="grid gap-3 px-4 pb-4" toast={t(locale, "toast.noteAdded")}>
            <input type="hidden" name="clientId" value={c.id} />
            <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
              <Field label={t(locale, "form.category")}>
                <select name="category" className={selectClass} defaultValue="GENERAL">
                  {CATS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <label className="flex min-h-11 items-end gap-2 pb-2.5 text-[13px] text-ink-2">
                <input type="checkbox" name="pinned" value="1" className="size-4 accent-[var(--accent)]" /> {t(locale, "form.pinned")}
              </label>
            </div>
            <Field label={t(locale, "form.content")}>
              <textarea name="content" required className={textareaClass} rows={3} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit">{t(locale, "form.addNote")}</Button>
            </div>
          </ActionForm>
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <Panel>
          <PanelHeader title={t(locale, "client.assessment")} />
          <div className="px-4 pb-4 text-[13px]">
            {a ? (
              <dl className="grid grid-cols-[110px_1fr] divide-y divide-border">
                {[
                  ["Niveau", a.experience],
                  ["Dispo", `${a.daysAvailable} j · ${a.minutesPerSession} min`],
                  ["Matériel", a.equipment || "–"],
                  ["Blessures", a.injuries ?? "–"],
                  ["Préférences", a.preferences ?? "–"],
                ].map(([k, v]) => (
                  <div key={k} className="col-span-2 grid grid-cols-subgrid py-1.5">
                    <dt className="text-[11.5px] font-semibold uppercase leading-5 tracking-[0.08em] text-muted">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted">—</p>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title={t(locale, "nav.settings")} />
          <ActionForm action={updateClientSettingsAction} className="grid gap-2.5 px-4 pb-4" toast={t(locale, "toast.saved")}>
            <input type="hidden" name="clientId" value={c.id} />
            <Field label={t(locale, "form.sessionsPerWeek")}>
              <input name="plannedSessionsPerWeek" type="number" min={1} max={7} defaultValue={c.plannedSessionsPerWeek} className={inputClass} />
            </Field>
            <Field label={t(locale, "form.checkInDay")}>
              <select name="checkInWeekday" defaultValue={c.checkInWeekday} className={selectClass}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {t(locale, `day.${d}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t(locale, "form.locale")}>
              <select name="preferredLocale" defaultValue={c.preferredLocale} className={selectClass}>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label={t(locale, "form.phone")}>
              <input name="phone" defaultValue={c.phone ?? ""} className={inputClass} />
            </Field>
            <Field label="Tags">
              <input name="tags" defaultValue={c.tags} className={inputClass} placeholder="matin, débutant" />
            </Field>
            <Button type="submit" variant="outline" className="mt-1">
              {t(locale, "form.saveSettings")}
            </Button>
          </ActionForm>
        </Panel>
      </div>
    </div>
  );
}
