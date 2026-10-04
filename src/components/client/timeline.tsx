import type { Locale } from "@/domain/types";
import { tx } from "@/domain/catalog";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate } from "@/lib/format";
import { parseJson } from "@/server/db";
import type { ClientProfile } from "@/server/client-profile";
import { EmptyState, Panel, PanelHeader, cn } from "@/components/ui";

/** Dot colour per event: lime for progress the client made, semantic colours for the rest. */
const TONE: Record<string, string> = {
  "workout.completed": "bg-accent",
  "milestone.reached": "bg-accent",
  "payment.received": "bg-accent",
  "action.completed": "bg-accent",
  "checkin.reviewed": "bg-accent",
  "subscription.started": "bg-accent",
  "workout.missed": "bg-bad",
  "message.received": "bg-warn",
  "checkin.submitted": "bg-info",
  "photo.added": "bg-info",
  "measurement.recorded": "bg-info",
  "program.created": "bg-info",
  "program.activated": "bg-info",
  "program.updated": "bg-info",
  "assessment.completed": "bg-info",
  "client.created": "bg-ink",
};

export function TimelineTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const events = p.client.events;
  if (!events.length) return <EmptyState title={t(locale, "client.timelineEmpty")} />;
  // group by month
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const k = fmtDate(e.occurredAt, locale, { month: "long", year: "numeric" });
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {[...groups.entries()].map(([month, list]) => (
        <Panel key={month}>
          <PanelHeader title={month} action={<span className="tnum rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{list.length}</span>} />
          <ol className="relative mb-3 me-4 ms-6 border-s border-border ps-5">
            {list.map((e) => {
              const payload = parseJson<Record<string, unknown>>(e.payloadJson, {});
              const detail = describe(e.type, payload, locale);
              const positive = TONE[e.type] === "bg-accent";
              return (
                <li key={e.id} className="relative py-2 text-[13px]">
                  <span aria-hidden className={cn("absolute -start-[27px] top-[13px] size-3 rounded-full ring-4 ring-surface", TONE[e.type] ?? "bg-border-strong")} />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn("font-semibold", positive ? "text-ink" : "text-ink-2")}>{t(locale, `ev.${e.type}`)}</span>
                    {detail ? <span className="min-w-0 text-ink-2">{detail}</span> : null}
                    <span className="tnum ms-auto shrink-0 text-[12px] text-muted">{fmtDate(e.occurredAt, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
      ))}
    </div>
  );
}

function describe(type: string, p: Record<string, unknown>, locale: Locale): string {
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : typeof p[k] === "number" ? String(p[k]) : "");
  switch (type) {
    case "photo.added":
      return (s("poses") || s("pose"))
        .split(",")
        .filter(Boolean)
        .map((x) => t(locale, `photos.pose.${x}`))
        .join(" · ");
    case "milestone.reached":
      return s("title");
    case "program.created":
    case "program.activated":
      return s("name");
    case "measurement.recorded":
      return s("weightKg") ? `${s("weightKg")} kg` : "";
    case "workout.completed":
      return s("rpe") ? `RPE ${s("rpe")}` : "";
    case "workout.missed": {
      const r = s("reason");
      const label = r ? tx(locale, `friction.${r}`) : "";
      return label === `friction.${r}` ? r : label;
    }
    case "message.sent":
    case "message.received":
      return s("preview") ? `« ${s("preview")} »` : "";
    case "payment.received":
      return s("amount") ? `${Number(s("amount")).toLocaleString("fr-DZ")} DA` : "";
    case "subscription.started":
      return s("package");
    case "action.completed":
      return s("title");
    case "review.decided":
      return s("decision");
    case "note.added":
      return s("category");
    default:
      return "";
  }
}
