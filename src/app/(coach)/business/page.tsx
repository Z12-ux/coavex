import { ActionForm } from "@/components/action-form";
import Link from "next/link";
import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtMoney } from "@/lib/format";
import { addDays } from "@/domain/stats";
import { Avatar, Badge, Button, EmptyState, PageHeader, Panel, PanelHeader, cn, selectClass } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { markPaymentPaidAction } from "@/server/actions/business";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const user = await pageUser("staff");
  const locale = user.locale;
  const now = new Date();
  const [subs, overdue, upcoming] = await Promise.all([
    db.subscription.findMany({ where: { client: { orgId: user.orgId }, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } }, include: { client: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { endDate: "asc" } }),
    db.payment.findMany({ where: { client: { orgId: user.orgId }, status: { in: ["PENDING", "OVERDUE"] }, dueAt: { lt: now } }, include: { client: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { dueAt: "asc" } }),
    db.payment.findMany({ where: { client: { orgId: user.orgId }, status: "PENDING", dueAt: { gte: now, lt: addDays(now, 30) } }, include: { client: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { dueAt: "asc" } }),
  ]);
  const mrr = subs.filter((s) => s.billingCycle === "MONTHLY" && s.status !== "TRIAL").reduce((a, s) => a + s.amount, 0);
  const overdueSum = overdue.reduce((a, p) => a + p.amount, 0);
  const upcomingSum = upcoming.reduce((a, p) => a + p.amount, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t(locale, "business.title")} sub={`${t(locale, "business.sub")} · MRR ${fmtMoney(mrr)}`} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard label="MRR" value={fmtMoney(mrr)} />
        <StatCard label={t(locale, "business.subscriptions")} value={subs.length} />
        <StatCard label={t(locale, "business.overdue")} value={overdue.length} tone={overdue.length ? "bad" : "good"} hint={fmtMoney(overdueSum)} />
        <StatCard label={t(locale, "business.upcoming")} value={upcoming.length} hint={fmtMoney(upcomingSum)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className={cn("relative overflow-hidden", overdue.length && "border-bad/30")}>
          {overdue.length ? <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-bad" /> : null}
          <PanelHeader title={t(locale, "business.overdue")} action={<Badge tone={overdue.length ? "bad" : "good"}>{overdue.length}</Badge>} />
          <div className="px-4 pb-4">
            {overdue.length ? (
              <ul className="divide-y divide-border">
                {overdue.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-[13px]">
                    <Link href={`/clients/${p.client.id}?tab=business`} className="flex min-w-0 flex-1 items-center gap-2.5 font-semibold text-ink hover:underline">
                      <Avatar name={`${p.client.firstName} ${p.client.lastName}`} size={30} />
                      <span className="truncate">
                        {p.client.firstName} {p.client.lastName}
                      </span>
                    </Link>
                    <span className="flex flex-col items-end">
                      <span className="tnum font-display text-[17px] font-bold leading-5 text-bad">{fmtMoney(p.amount)}</span>
                      <span className="tnum text-[12px] text-muted">{fmtDate(p.dueAt, locale)}</span>
                    </span>
                    <ActionForm action={markPaymentPaidAction} className="flex w-full items-center gap-1.5 sm:w-auto" toast={t(locale, "toast.paid")}>
                      <input type="hidden" name="paymentId" value={p.id} />
                      <select name="method" className={cn(selectClass, "h-11 flex-1 text-[13px] sm:w-auto sm:flex-none")} defaultValue="CASH" aria-label={t(locale, "business.payments")}>
                        {(["CASH", "TRANSFER", "CCP", "CARD"] as const).map((m) => (
                          <option key={m} value={m}>
                            {t(locale, `pay.method.${m}`)}
                          </option>
                        ))}
                      </select>
                      <Button variant="outline" className="h-11">
                        {t(locale, "business.markPaid")}
                      </Button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-[13px] text-muted">—</p>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title={t(locale, "business.upcoming")} action={<Badge tone="neutral">{upcoming.length}</Badge>} />
          <div className="px-4 pb-4">
            {upcoming.length ? (
              <ul className="divide-y divide-border">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex min-h-[48px] items-center gap-3 py-2 text-[13px]">
                    <Link href={`/clients/${p.client.id}?tab=business`} className="flex min-w-0 flex-1 items-center gap-2.5 font-semibold text-ink hover:underline">
                      <Avatar name={`${p.client.firstName} ${p.client.lastName}`} size={30} />
                      <span className="truncate">
                        {p.client.firstName} {p.client.lastName}
                      </span>
                    </Link>
                    <span className="tnum font-display text-[16px] font-bold text-ink">{fmtMoney(p.amount)}</span>
                    <span className="tnum w-20 text-end text-[12px] text-muted">{fmtDate(p.dueAt, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-[13px] text-muted">—</p>
            )}
          </div>
        </Panel>
      </div>
      <Panel className="mt-4">
        <PanelHeader title={t(locale, "business.subscriptions")} action={<Badge tone="neutral">{subs.length}</Badge>} />
        <div className="px-4 pb-4">
          {subs.length ? (
            <table className="w-full text-[13px]">
              <thead className="border-b border-border text-[11px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="py-2 text-start font-semibold">{t(locale, "clients.title")}</th>
                  <th className="py-2 text-start font-semibold">{t(locale, "business.package")}</th>
                  <th className="hidden py-2 text-start font-semibold sm:table-cell">{t(locale, "business.amount")}</th>
                  <th className="hidden py-2 text-start font-semibold sm:table-cell">{t(locale, "business.end")}</th>
                  <th className="py-2 text-start font-semibold">{t(locale, "clients.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2/50">
                    <td className="py-2.5 pe-2">
                      <Link href={`/clients/${s.client.id}?tab=business`} className="font-semibold text-ink hover:underline">
                        {s.client.firstName} {s.client.lastName}
                      </Link>
                    </td>
                    <td className="py-2.5 pe-2 text-ink-2">{s.packageName}</td>
                    <td className="tnum hidden py-2.5 pe-2 font-display text-[15px] font-bold text-ink sm:table-cell">{fmtMoney(s.amount)}</td>
                    <td className="tnum hidden py-2.5 pe-2 text-muted sm:table-cell">{fmtDate(s.endDate, locale)}</td>
                    <td className="py-2.5">
                      <Badge tone={s.status === "PAST_DUE" ? "bad" : s.status === "TRIAL" ? "info" : "good"}>{t(locale, `sub.status.${s.status}`)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={t(locale, "business.empty")} why={t(locale, "business.emptyWhy")} compact />
          )}
        </div>
      </Panel>
    </div>
  );
}
