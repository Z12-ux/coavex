import Link from "next/link";
import { Camera } from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtKg, fmtSigned } from "@/lib/format";
import { daysApart, defaultPair, toPhotoItems } from "@/lib/photos";
import type { ClientProfile } from "@/server/client-profile";
import { addProgressPhotoAction, deleteProgressPhotoAction } from "@/server/actions/clients";
import { EmptyState, LinkButton, Panel, PanelHeader, cn } from "@/components/ui";
import { PhotoGallery } from "@/components/photos/photo-gallery";

export function PhotosTab({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const items = toPhotoItems(p.client.progressPhotos, p.client.measurements);
  const goal = p.client.goals.find((g) => g.isPrimary) ?? p.client.goals[0];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <p className="t-kicker">
          {t(locale, "client.photos")} · <span className="tnum">{items.length}</span>
        </p>
        <h2 className="t-title mt-1">{t(locale, "photos.title")}</h2>
      </div>
      <PhotoGallery photos={items} locale={locale} clientId={p.client.id} addAction={addProgressPhotoAction} deleteAction={deleteProgressPhotoAction} canDelete goalType={goal?.type ?? null} />
    </div>
  );
}

/** Small "AVANT" (dark) / "APRÈS" (lime) tag laid over a photo. */
function PhotoTag({ after, children, className }: { after?: boolean; children: ReactNode; className?: string }) {
  return <span className={cn("pointer-events-none absolute start-1.5 top-1.5 rounded-sm px-1.5 py-0.5 font-display text-[11.5px] font-bold uppercase leading-4 tracking-[0.1em]", after ? "bg-accent text-accent-ink" : "bg-black/65 text-white", className)}>{children}</span>;
}

function MiniTile({ label, value, tone = "ink" }: { label: string; value: ReactNode; tone?: "ink" | "good" | "warn" }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-between gap-0.5 rounded-md border border-border-strong bg-surface-2 px-1.5 py-1.5 text-center">
      <div className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.04em] text-muted">{label}</div>
      <div dir="ltr" className={cn("tnum font-display text-[19px] font-bold leading-6", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
    </div>
  );
}

/** Compact before/after card for the overview side column. */
export function BeforeAfterCard({ p, locale }: { p: ClientProfile; locale: Locale }) {
  const items = toPhotoItems(p.client.progressPhotos, p.client.measurements);
  const { before, after } = defaultPair(items);
  const goal = p.client.goals.find((g) => g.isPrimary) ?? p.client.goals[0];
  const href = `/clients/${p.client.id}?tab=photos`;
  const dKg = before && after && before.weightKg !== null && after.weightKg !== null ? Math.round((after.weightKg - before.weightKg) * 10) / 10 : null;
  const tone = dKg === null || dKg === 0 ? "ink" : (dKg < 0 && goal?.type === "FAT_LOSS") || (dKg > 0 && goal?.type === "MUSCLE_GAIN") ? "good" : "ink";
  return (
    <Panel>
      <PanelHeader
        title={t(locale, "photos.title")}
        action={
          items.length ? (
            <Link href={href} className="text-[12.5px] font-semibold text-accent hover:underline">
              {t(locale, "photos.openTab")}
            </Link>
          ) : null
        }
      />
      <div className="px-4 pb-4">
        {before && after ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { photo: before, label: t(locale, "photos.before"), isAfter: false },
                { photo: after, label: t(locale, "photos.after"), isAfter: true },
              ].map(({ photo, label, isAfter }) => (
                <Link key={photo.id} href={href} className={cn("press relative block overflow-hidden rounded-md border bg-surface-3", isAfter ? "neon-edge" : "border-border")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={`${label} — ${photo.date}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                  <PhotoTag after={isAfter}>{label}</PhotoTag>
                  <span className="tnum absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-end text-[11px] font-medium text-white">{fmtDate(photo.date, locale)}</span>
                </Link>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <MiniTile label={t(locale, "photos.daysApart")} value={daysApart(before.date, after.date)} />
              {dKg !== null ? <MiniTile label={t(locale, "client.weight")} value={fmtSigned(dKg, 1, " kg")} tone={tone} /> : null}
              {after.weightKg !== null ? <MiniTile label={t(locale, "photos.after")} value={fmtKg(after.weightKg)} /> : null}
            </div>
          </>
        ) : before ? (
          <div className="flex gap-3">
            <Link href={href} className="press relative block w-[96px] shrink-0 overflow-hidden rounded-md border border-border bg-surface-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={before.url} alt={`${t(locale, "photos.before")} — ${before.date}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
              <PhotoTag>{t(locale, "photos.before")}</PhotoTag>
            </Link>
            <div className="min-w-0 text-[12.5px]">
              <p className="tnum text-muted">
                {t(locale, "photos.before")} · {fmtDate(before.date, locale, { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <p className="mt-1 text-ink-2">{t(locale, "photos.one")}</p>
              <LinkButton href={href} size="sm" variant="outline" className="mt-2">
                <Camera className="size-3.5" />
                {t(locale, "photos.addAfter")}
              </LinkButton>
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Camera className="size-5" />}
            title={t(locale, "photos.empty.title")}
            why={t(locale, "photos.empty.why")}
            cta={
              <LinkButton href={href} size="sm">
                {t(locale, "photos.add")}
              </LinkButton>
            }
          />
        )}
      </div>
    </Panel>
  );
}
