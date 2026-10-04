import { pageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { clientRows } from "@/server/queries";
import { t } from "@/lib/i18n/dictionary";
import { fmtMoney } from "@/lib/format";
import { addDays } from "@/domain/stats";
import { tx } from "@/domain/catalog";
import { PageHeader, Panel, PanelHeader, cn } from "@/components/ui";
import { Bars } from "@/components/charts";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await pageUser("staff");
  const locale = user.locale;
  const now = new Date();
  const rows = await clientRows(user.orgId, locale, now);
  const active = rows.filter((r) => r.status === "ACTIVE" || r.status === "TRIAL");
  const adh = active.map((r) => r.adherence28).filter((x): x is number => x !== null);
  const avgAdh = adh.length ? Math.round(adh.reduce((a, b) => a + b, 0) / adh.length) : null;
  const [checkinsDue, checkinsDone, activeSubs, newClients, churned, paidRecent, outstanding, active7] = await Promise.all([
    db.client.count({ where: { orgId: user.orgId, status: { in: ["ACTIVE", "TRIAL"] }, onboardedAt: { lt: addDays(now, -7) } } }),
    db.checkIn.count({ where: { client: { orgId: user.orgId }, submittedAt: { gte: addDays(now, -7) } } }),
    db.subscription.count({ where: { client: { orgId: user.orgId }, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } } }),
    db.client.count({ where: { orgId: user.orgId, onboardedAt: { gte: addDays(now, -30) } } }),
    db.client.count({ where: { orgId: user.orgId, status: "CHURNED", updatedAt: { gte: addDays(now, -90) } } }),
    db.payment.aggregate({ where: { client: { orgId: user.orgId }, status: "PAID", paidAt: { gte: addDays(now, -30) } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { client: { orgId: user.orgId }, status: { in: ["PENDING", "OVERDUE"] }, dueAt: { lt: now } }, _sum: { amount: true } }),
    db.client.count({ where: { orgId: user.orgId, status: { in: ["ACTIVE", "TRIAL"] }, lastActiveAt: { gte: addDays(now, -7) } } }),
  ]);
  const momentumDist = { IMPROVING: 0, STABLE: 0, DECLINING: 0, INSUFFICIENT_DATA: 0 };
  for (const r of active) momentumDist[r.momentum]++;
  const total90 = rows.filter((r) => r.status !== "ONBOARDING").length;
  const retention = total90 ? Math.round(((total90 - churned) / total90) * 100) : null;
  const ratio = (a: number, b: number) => (b ? Math.min(1, a / b) : null);
  const attention = rows.filter((r) => r.topAction).length;
  const momentumRows = [
    { key: "IMPROVING", glyph: "↑", tone: "text-good", value: momentumDist.IMPROVING },
    { key: "STABLE", glyph: "→", tone: "text-ink-2", value: momentumDist.STABLE },
    { key: "DECLINING", glyph: "↓", tone: "text-bad", value: momentumDist.DECLINING },
    { key: "INSUFFICIENT_DATA", glyph: "?", tone: "text-muted", value: momentumDist.INSUFFICIENT_DATA },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t(locale, "analytics.title")} sub={t(locale, "analytics.sub")} />
      <h2 className="t-section mb-2.5 flex items-center gap-2">
        {t(locale, "analytics.coaching")}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatCard label={t(locale, "analytics.activeClients")} value={active.length} href="/clients?filter=active" />
        <StatCard label={t(locale, "analytics.progressing")} value={momentumDist.IMPROVING} tone="good" />
        {/* ring tiles span the full row on phones so their labels never truncate */}
        <StatCard className="col-span-2 sm:col-span-1" label={t(locale, "analytics.adherence")} value={avgAdh === null ? "–" : `${avgAdh}%`} tone={avgAdh !== null && avgAdh < 60 ? "warn" : "neutral"} ring={avgAdh === null ? null : avgAdh / 100} ringTone={avgAdh !== null && avgAdh < 60 ? "warn" : "accent"} />
        <StatCard className="col-span-2 sm:col-span-1" label={t(locale, "analytics.checkinRate")} value={`${checkinsDone}/${checkinsDue}`} tone={checkinsDue && checkinsDone / checkinsDue < 0.6 ? "warn" : "neutral"} ring={ratio(checkinsDone, checkinsDue)} ringTone={checkinsDue && checkinsDone / checkinsDue < 0.6 ? "warn" : "accent"} href="/review" />
        <StatCard label={t(locale, "analytics.attention")} value={attention} tone="warn" href="/clients?filter=attention" />
        <StatCard label={t(locale, "analytics.engagement")} value={`${active7}/${active.length}`} />
      </div>
      <h2 className="t-section mb-2.5 flex items-center gap-2">
        {t(locale, "analytics.business")}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatCard label={t(locale, "analytics.subscriptions")} value={activeSubs} href="/business" />
        <StatCard label={t(locale, "analytics.newClients")} value={newClients} />
        <StatCard label={t(locale, "analytics.churn")} value={churned} tone={churned ? "warn" : "neutral"} />
        <StatCard label={t(locale, "analytics.revenue")} value={fmtMoney(paidRecent._sum.amount ?? 0)} />
        <StatCard label={t(locale, "analytics.outstanding")} value={fmtMoney(outstanding._sum.amount ?? 0)} tone={outstanding._sum.amount ? "bad" : "neutral"} href="/business" />
        <StatCard label={t(locale, "analytics.retention")} value={retention === null ? "–" : `${retention}%`} ring={retention === null ? null : retention / 100} />
      </div>
      <Panel>
        <PanelHeader title={t(locale, "analytics.momentumDist")} sub={`${active.length} ${t(locale, "analytics.activeClients").toLowerCase()}`} />
        <div className="grid gap-5 px-4 pb-4 sm:grid-cols-[1fr_240px] sm:items-end">
          <Bars items={momentumRows.map((m) => ({ label: m.glyph, value: m.value }))} height={120} />
          <ul className="divide-y divide-border text-[13px]">
            {momentumRows.map((m) => (
              <li key={m.key} className="flex min-h-[40px] items-center gap-2.5">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface-2 font-display text-[15px] font-bold", m.tone)}>{m.glyph}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{tx(locale, `mom.status.${m.key}`)}</span>
                <span className="tnum font-display text-[18px] font-bold text-ink">{m.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
