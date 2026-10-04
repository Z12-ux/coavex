import { ActionForm } from "@/components/action-form";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtMoney, fmtRelative } from "@/lib/format";
import { isoDate } from "@/domain/stats";
import type { ClientProfile } from "@/server/client-profile";
import { createSubscriptionAction, markPaymentPaidAction } from "@/server/actions/business";
import { Badge, Button, EmptyState, Field, Panel, PanelHeader, cn, inputClass, selectClass } from "@/components/ui";

export function BusinessTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const c = p.client;
  const current = c.subscriptions.find((s) => ["ACTIVE", "TRIAL", "PAST_DUE"].includes(s.status));
  const now = new Date();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Panel>
          <PanelHeader title={t(locale, "client.business")} action={current ? <Badge tone={current.status === "PAST_DUE" ? "bad" : current.status === "TRIAL" ? "info" : "good"}>{current.status}</Badge> : null} />
          <div className="px-4 pb-4 text-[13px]">
            {current ? (
              <>
                <p className="font-display text-[22px] font-bold uppercase leading-6 text-ink">{current.packageName}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.08em] text-muted">{t(locale, "business.amount")}</div>
                    <div className="tnum mt-1 font-display text-[22px] font-bold leading-7 text-ink">{fmtMoney(current.amount)}</div>
                    <div className="text-[12px] text-muted">{current.billingCycle}</div>
                  </div>
                  <div className="min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.08em] text-muted">{t(locale, "business.start")}</div>
                    <div className="tnum mt-1 font-display text-[18px] font-bold leading-6 text-ink">{fmtDate(current.startDate, locale, { day: "numeric", month: "short", year: "numeric" })}</div>
                  </div>
                  <div className="min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.08em] text-muted">{t(locale, "business.end")}</div>
                    <div className="tnum mt-1 font-display text-[18px] font-bold leading-6 text-ink">{fmtDate(current.endDate, locale, { day: "numeric", month: "short", year: "numeric" })}</div>
                    {current.endDate ? <div className="text-[12px] text-muted">{fmtRelative(current.endDate, locale, now)}</div> : null}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState compact title={t(locale, "business.empty")} why={t(locale, "business.emptyWhy")} />
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title={t(locale, "business.newSubscription")} />
          <ActionForm action={createSubscriptionAction} className="grid grid-cols-2 gap-2.5 px-4 pb-4" toast={t(locale, "toast.saved")}>
            <input type="hidden" name="clientId" value={c.id} />
            <Field label={t(locale, "business.package")} className="col-span-2">
              <input name="packageName" required className={inputClass} placeholder="Coaching Premium 3 mois" />
            </Field>
            <Field label={`${t(locale, "business.amount")} (DA)`}>
              <input name="amount" type="number" min={0} required className={inputClass} defaultValue={12000} />
            </Field>
            <Field label={t(locale, "business.cycle")}>
              <select name="billingCycle" className={selectClass} defaultValue="MONTHLY">
                <option value="MONTHLY">Mensuel</option>
                <option value="QUARTERLY">Trimestriel</option>
                <option value="YEARLY">Annuel</option>
                <option value="ONE_OFF">Unique</option>
              </select>
            </Field>
            <Field label={t(locale, "business.start")}>
              <input name="startDate" type="date" defaultValue={isoDate(new Date())} className={inputClass} required />
            </Field>
            <Field label="Durée (mois)">
              <input name="months" type="number" min={1} max={24} defaultValue={3} className={inputClass} />
            </Field>
            <Field label={t(locale, "clients.status")}>
              <select name="status" className={selectClass} defaultValue="ACTIVE">
                <option value="ACTIVE">ACTIVE</option>
                <option value="TRIAL">TRIAL</option>
              </select>
            </Field>
            <Button type="submit" className="col-span-2 mt-1">
              {t(locale, "form.saveSubscription")}
            </Button>
          </ActionForm>
        </Panel>
      </div>
      <Panel className="min-w-0">
        <PanelHeader title={t(locale, "business.payments")} action={c.payments.length ? <span className="tnum rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{c.payments.length}</span> : null} />
        <div className="px-4 pb-3">
          {c.payments.length ? (
            <ul className="divide-y divide-border text-[13px]">
              {c.payments.map((pay) => {
                const late = pay.status !== "PAID" && pay.dueAt < now;
                return (
                  <li key={pay.id} className={cn("relative flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 ps-3")}>
                    <span aria-hidden className={cn("absolute inset-y-2.5 start-0 w-[3px] rounded-full", pay.status === "PAID" ? "bg-good" : late ? "bg-bad" : "bg-border-strong")} />
                    <span className="tnum w-24 text-muted">{fmtDate(pay.dueAt, locale, { day: "numeric", month: "short", year: "2-digit" })}</span>
                    <span className="tnum flex-1 font-display text-[17px] font-bold text-ink">{fmtMoney(pay.amount)}</span>
                    <Badge tone={pay.status === "PAID" ? "good" : late ? "bad" : "neutral"}>{late && pay.status !== "PAID" ? "OVERDUE" : pay.status}</Badge>
                    {pay.status !== "PAID" ? (
                      <ActionForm action={markPaymentPaidAction} className="flex items-center gap-1" toast={t(locale, "toast.paid")}>
                        <input type="hidden" name="paymentId" value={pay.id} />
                        <select name="method" className={cn(selectClass, "h-9 w-auto text-[12.5px]")} defaultValue="CASH" aria-label={t(locale, "business.markPaid")}>
                          <option value="CASH">Cash</option>
                          <option value="TRANSFER">Virement</option>
                          <option value="CCP">CCP</option>
                          <option value="CARD">Carte</option>
                        </select>
                        <Button size="sm" variant="outline" className="h-9">
                          {t(locale, "business.markPaid")}
                        </Button>
                      </ActionForm>
                    ) : (
                      <span className="text-[12px] text-muted">
                        {pay.method} · {fmtDate(pay.paidAt, locale)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pb-1 text-[13px] text-muted">—</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
