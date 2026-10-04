"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, ChevronsLeftRight, Columns2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { fmtDate, fmtKg, fmtSigned } from "@/lib/format";
import { daysApart, defaultPair, type PhotoItem } from "@/lib/photos";
import { ActionForm } from "@/components/action-form";
import { Button, EmptyState, Field, cn, inputClass, selectClass } from "@/components/ui";

const POSES = ["FRONT", "SIDE", "BACK"] as const;

type Props = {
  photos: PhotoItem[];
  locale: Locale;
  /** hidden field for the coach action; omitted for the client's own photos */
  clientId?: string;
  addAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  canDelete: boolean;
  goalType?: string | null;
};

/** Segmented-control shell (pose tabs, view switch, before/after pick). */
const SEG = "flex rounded-lg border border-border bg-surface-2 p-1";
const SEG_BTN = "press flex items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold uppercase tracking-[0.08em]";

/** Overlay tag on a photo: "AVANT" dark, "APRÈS" lime. Photos are the one place white/black overlays are allowed. */
function Tag({ after, className, children }: { after?: boolean; className?: string; children: ReactNode }) {
  return <span className={cn("pointer-events-none absolute rounded-sm px-1.5 py-0.5 font-display text-[12px] font-bold uppercase leading-4 tracking-[0.1em]", after ? "bg-accent text-accent-ink" : "bg-black/65 text-white", className)}>{children}</span>;
}

/**
 * Before / after gallery: comparison (drag slider or side by side), pose
 * filter, thumbnail timeline with explicit "before" / "after" selection,
 * deletion and an upload form that resizes the picture in the browser.
 */
export function PhotoGallery({ photos, locale, clientId, addAction, deleteAction, canDelete, goalType }: Props) {
  const init = useMemo(() => defaultPair(photos), [photos]);
  const [pose, setPose] = useState<string>(init.pose ?? "FRONT");
  const [view, setView] = useState<"slider" | "side">("slider");
  const [pick, setPick] = useState<"before" | "after">("after");
  const [beforeId, setBeforeId] = useState<string | null>(init.before?.id ?? null);
  const [afterId, setAfterId] = useState<string | null>(init.after?.id ?? null);

  // keep the selection valid when photos change (upload / delete / pose switch)
  const ofPose = useMemo(() => photos.filter((p) => p.pose === pose), [photos, pose]);
  useEffect(() => {
    if (!ofPose.length) return;
    const has = (id: string | null) => !!id && ofPose.some((p) => p.id === id);
    if (!has(beforeId)) setBeforeId(ofPose[0].id);
    if (!has(afterId)) setAfterId(ofPose.length > 1 ? ofPose[ofPose.length - 1].id : null);
  }, [ofPose, beforeId, afterId]);

  const before = ofPose.find((p) => p.id === beforeId) ?? null;
  const after = ofPose.find((p) => p.id === afterId) ?? null;
  const poses = POSES.filter((x) => photos.some((p) => p.pose === x));
  const showUploadOpen = photos.length === 0;

  return (
    <div className="space-y-5">
      {photos.length === 0 ? (
        <EmptyState title={t(locale, "photos.empty.title")} why={clientId ? t(locale, "photos.empty.why") : t(locale, "photos.empty.client")} icon={<Camera className="size-6" />} />
      ) : (
        <>
          {/* controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label={t(locale, "photos.pose")} className={SEG}>
              {poses.map((x) => {
                const on = pose === x;
                return (
                  <button key={x} type="button" role="tab" aria-selected={on} onClick={() => setPose(x)} className={cn(SEG_BTN, "h-10", on ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}>
                    {t(locale, `photos.pose.${x}`)}
                    <span className={cn("tnum rounded-full px-1.5 text-[11px] leading-4 tracking-normal", on ? "bg-accent-ink/15 text-accent-ink" : "bg-surface-3 text-ink-2")}>{photos.filter((p) => p.pose === x).length}</span>
                  </button>
                );
              })}
            </div>
            {ofPose.length > 1 ? (
              <div className={cn(SEG, "ms-auto")} role="group" aria-label={t(locale, "photos.view")}>
                <button type="button" aria-pressed={view === "slider"} onClick={() => setView("slider")} className={cn(SEG_BTN, "h-10", view === "slider" ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}>
                  <SlidersHorizontal className="size-3.5" /> {t(locale, "photos.view.slider")}
                </button>
                <button type="button" aria-pressed={view === "side"} onClick={() => setView("side")} className={cn(SEG_BTN, "h-10", view === "side" ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}>
                  <Columns2 className="size-3.5" /> {t(locale, "photos.view.side")}
                </button>
              </div>
            ) : null}
          </div>

          {/* comparison */}
          {before && after ? (
            view === "slider" ? (
              <CompareSlider before={before} after={after} locale={locale} />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <Frame photo={before} label={t(locale, "photos.before")} locale={locale} />
                <Frame photo={after} label={t(locale, "photos.after")} locale={locale} after />
              </div>
            )
          ) : before ? (
            <div className="mx-auto max-w-[360px]">
              <Frame photo={before} label={t(locale, "photos.before")} locale={locale} />
              <p className="mt-2 text-center text-[12.5px] text-muted">{t(locale, "photos.one")}</p>
            </div>
          ) : null}

          {before && after ? <DeltaRow before={before} after={after} locale={locale} goalType={goalType} /> : null}

          {/* thumbnails */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="t-kicker">{t(locale, "photos.pick")}</span>
              <div className={SEG} role="group">
                {(["before", "after"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={pick === k} onClick={() => setPick(k)} className={cn(SEG_BTN, "h-8", pick === k ? (k === "after" ? "bg-accent text-accent-ink" : "bg-ink text-bg") : "text-muted hover:text-ink")}>
                    {t(locale, `photos.${k}`)}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-muted">{t(locale, "photos.pickHint")}</span>
            </div>
            <ul className="flex snap-x gap-2.5 overflow-x-auto pb-1 pt-0.5" aria-label={t(locale, "photos.title")}>
              {ofPose.map((p) => {
                const isB = p.id === beforeId;
                const isA = p.id === afterId;
                return (
                  <li key={p.id} className="relative shrink-0 snap-start">
                    <button
                      type="button"
                      onClick={() => (pick === "before" ? setBeforeId(p.id) : setAfterId(p.id))}
                      aria-pressed={isB || isA}
                      aria-label={`${fmtDate(p.date, locale, { day: "numeric", month: "short", year: "numeric" })}${isB ? ` · ${t(locale, "photos.before")}` : isA ? ` · ${t(locale, "photos.after")}` : ""}`}
                      className={cn("press block w-[78px] overflow-hidden rounded-md border-2 bg-surface-3", isB ? "border-ink" : isA ? "border-accent" : "border-border hover:border-border-strong")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className={cn("aspect-[3/4] w-full object-cover", !isA && !isB && "opacity-80")} loading="lazy" draggable={false} />
                    </button>
                    {isB || isA ? (
                      <span className={cn("pointer-events-none absolute start-1 top-1 rounded-sm px-1 font-display text-[10.5px] font-bold uppercase leading-4 tracking-[0.06em]", isB ? "bg-ink text-bg" : "bg-accent text-accent-ink")}>{isB ? t(locale, "photos.before") : t(locale, "photos.after")}</span>
                    ) : null}
                    <div className={cn("tnum mt-1 w-[78px] truncate text-center text-[11px]", isA ? "font-semibold text-accent" : isB ? "font-semibold text-ink" : "text-muted")}>{fmtDate(p.date, locale)}</div>
                    {canDelete ? (
                      <ActionForm action={deleteAction} confirm={t(locale, "photos.deleteConfirm")} toast={t(locale, "toast.photoDeleted")} className="absolute end-1 top-1">
                        <input type="hidden" name="photoId" value={p.id} />
                        <button type="submit" className="press grid size-7 place-items-center rounded-sm bg-black/55 text-white hover:bg-bad" aria-label={t(locale, "common.delete")}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </ActionForm>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <UploadForm locale={locale} clientId={clientId} addAction={addAction} defaultOpen={showUploadOpen} defaultPose={pose} />
    </div>
  );
}

// ───────────────────────────── pieces ───────────────────────────────────────

function Caption({ photo, locale }: { photo: PhotoItem; locale: Locale }) {
  return (
    <span className="tnum">
      {fmtDate(photo.date, locale, { day: "numeric", month: "short", year: "numeric" })}
      {photo.weightKg !== null ? ` · ${fmtKg(photo.weightKg)}` : ""}
    </span>
  );
}

function Frame({ photo, label, locale, after }: { photo: PhotoItem; label: string; locale: Locale; after?: boolean }) {
  return (
    <figure className={cn("relative overflow-hidden rounded-lg border bg-surface-3", after ? "neon-edge" : "border-border")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={`${label} — ${photo.date}`} className="aspect-[3/4] w-full object-cover" draggable={false} />
      <Tag after={after} className="start-2 top-2">
        {label}
      </Tag>
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-8 text-end text-[12px] font-medium text-white">
        <Caption photo={photo} locale={locale} />
      </figcaption>
    </figure>
  );
}

function CompareSlider({ before, after, locale }: { before: PhotoItem; after: PhotoItem; locale: Locale }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const rtl = locale === "ar";

  const update = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let x = ((clientX - r.left) / r.width) * 100;
      if (rtl) x = 100 - x;
      setPos(Math.round(Math.max(0, Math.min(100, x))));
    },
    [rtl],
  );

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div
        ref={ref}
        className="relative aspect-[3/4] select-none overflow-hidden rounded-lg border border-border bg-surface-3 touch-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          update(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && update(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after.url} alt={`${t(locale, "photos.after")} — ${after.date}`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before.url} alt={`${t(locale, "photos.before")} — ${before.date}`} className="absolute inset-0 h-full w-full object-cover" draggable={false} style={{ clipPath: rtl ? `inset(0 0 0 ${100 - pos}%)` : `inset(0 ${100 - pos}% 0 0)` }} />
        {/* divider: lime line with a soft halo (the progress idiom of the brief) */}
        <div className="glow-sm pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ [rtl ? "right" : "left"]: `calc(${pos}% - 1px)` } as React.CSSProperties} />
        <button
          type="button"
          role="slider"
          aria-label={t(locale, "photos.compareHint")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pos}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 2;
            if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - (rtl ? -step : step)));
            else if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + (rtl ? -step : step)));
            else if (e.key === "Home") setPos(0);
            else if (e.key === "End") setPos(100);
            else return;
            e.preventDefault();
          }}
          className="glow absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-surface text-accent"
          style={{ [rtl ? "right" : "left"]: `calc(${pos}% - 22px)` } as React.CSSProperties}
        >
          <ChevronsLeftRight className="size-5" />
        </button>
        <Tag className="start-2 top-2">{t(locale, "photos.before")}</Tag>
        <Tag after className="end-2 top-2">
          {t(locale, "photos.after")}
        </Tag>
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[12px]">
        <div className="min-w-0">
          <div className="t-kicker">{t(locale, "photos.before")}</div>
          <div className="mt-0.5 text-ink-2">
            <Caption photo={before} locale={locale} />
          </div>
        </div>
        <div className="min-w-0 text-end">
          {/* not .t-kicker: that unlayered class would override the colour utility */}
          <div className="text-[11.5px] font-semibold uppercase leading-[14px] tracking-[0.16em] text-accent">{t(locale, "photos.after")}</div>
          <div className="mt-0.5 text-ink-2">
            <Caption photo={after} locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Before → after deltas as bordered tiles (the reference "SETS · REPS · REST" boxes). */
function DeltaRow({ before, after, locale, goalType }: { before: PhotoItem; after: PhotoItem; locale: Locale; goalType?: string | null }) {
  const days = daysApart(before.date, after.date);
  const dKg = before.weightKg !== null && after.weightKg !== null ? Math.round((after.weightKg - before.weightKg) * 10) / 10 : null;
  const dWaist = before.waistCm !== null && after.waistCm !== null ? Math.round((after.waistCm - before.waistCm) * 10) / 10 : null;
  const goodDown = goalType === "FAT_LOSS";
  const goodUp = goalType === "MUSCLE_GAIN";
  const tone = (d: number | null) => (d === null || d === 0 ? "text-ink" : (d < 0 && goodDown) || (d > 0 && goodUp) ? "text-good" : goodDown || goodUp ? "text-warn" : "text-ink");
  const tiles: { key: string; label: string; value: string; cls: string }[] = [{ key: "days", label: t(locale, "photos.daysApart"), value: String(days), cls: "text-ink" }];
  if (dKg !== null) tiles.push({ key: "kg", label: t(locale, "client.weight"), value: fmtSigned(dKg, 1, " kg"), cls: tone(dKg) });
  if (dWaist !== null) tiles.push({ key: "waist", label: t(locale, "form.waist"), value: fmtSigned(dWaist, 1, " cm"), cls: tone(dWaist) });
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <dl className="grid auto-cols-fr grid-flow-col gap-2">
        {tiles.map((x) => (
          <div key={x.key} className="flex min-w-0 flex-col items-center justify-between gap-1 rounded-lg border border-border-strong bg-surface px-2 py-2.5 text-center">
            <dt className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.06em] text-muted">{x.label}</dt>
            <dd dir="ltr" className={cn("tnum font-display text-[24px] font-bold leading-7", x.cls)}>{x.value}</dd>
          </div>
        ))}
      </dl>
      {before.illustration || after.illustration ? <p className="mt-1.5 text-center text-[12px] text-muted">{t(locale, "photos.illustration")}</p> : null}
    </div>
  );
}

// ───────────────────────────── upload ───────────────────────────────────────

const MAX_EDGE = 1280;
const MAX_CHARS = 900_000; // ≈ 675 KB decoded

async function fileToDataUrl(file: File): Promise<string> {
  const raw = () =>
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = null;
  }
  if (!bitmap) return raw();
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw();
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let out = canvas.toDataURL("image/jpeg", 0.84);
  if (out.length > MAX_CHARS) out = canvas.toDataURL("image/jpeg", 0.68);
  if (out.length > MAX_CHARS) {
    const c2 = document.createElement("canvas");
    c2.width = Math.round(w * 0.75);
    c2.height = Math.round(h * 0.75);
    c2.getContext("2d")?.drawImage(canvas, 0, 0, c2.width, c2.height);
    out = c2.toDataURL("image/jpeg", 0.68);
  }
  return out;
}

function UploadForm({ locale, clientId, addAction, defaultOpen, defaultPose }: { locale: Locale; clientId?: string; addAction: (fd: FormData) => Promise<void>; defaultOpen: boolean; defaultPose: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; // local date, not UTC

  return (
    <details open={defaultOpen} className="group rounded-lg border border-dashed border-border-strong bg-surface open:border-solid open:border-border">
      <summary className="press flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border border-accent/40 bg-accent-soft text-accent">
          <Camera className="size-4" />
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">{t(locale, "photos.add")}</span>
        <Plus aria-hidden className="ms-auto size-4 text-muted transition-transform group-open:rotate-45" />
      </summary>
      <ActionForm
        action={async (fd) => {
          await addAction(fd);
          setDataUrl("");
          if (fileRef.current) fileRef.current.value = "";
        }}
        toast={t(locale, "toast.photoSaved")}
        className="grid gap-4 border-t border-border px-4 pb-4 pt-4 sm:grid-cols-[minmax(0,1fr)_150px]"
      >
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        <input type="hidden" name="dataUrl" value={dataUrl} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t(locale, "photos.file")} required className="sm:col-span-2">
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept="image/*"
              className="block w-full text-[13px] text-ink-2 file:me-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-border-strong file:bg-surface-3 file:px-3.5 file:text-[12.5px] file:font-semibold file:text-ink hover:file:border-accent/50"
              onChange={async (e) => {
                const f = e.currentTarget.files?.[0];
                setError(null);
                setDataUrl("");
                if (!f) return;
                setBusy(true);
                try {
                  const url = await fileToDataUrl(f);
                  if (url.length > MAX_CHARS * 1.4) throw new Error("too_large");
                  setDataUrl(url);
                } catch {
                  setError(t(locale, "photos.error"));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <span className="mt-1.5 block text-[12px] text-muted">{t(locale, "photos.addHelp")}</span>
          </Field>
          <Field label={t(locale, "photos.pose")}>
            <select name="pose" defaultValue={defaultPose} className={selectClass}>
              {POSES.map((x) => (
                <option key={x} value={x}>
                  {t(locale, `photos.pose.${x}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t(locale, "form.date")}>
            <input type="date" name="date" defaultValue={today} max={today} className={inputClass} required />
          </Field>
          <Field label={t(locale, "photos.note")} className="sm:col-span-2">
            <input type="text" name="note" maxLength={200} className={inputClass} />
          </Field>
          {error ? (
            <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-2.5 py-1.5 text-[12.5px] text-bad sm:col-span-2">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="md" disabled={!dataUrl || busy} className="sm:col-span-2 sm:justify-self-start">
            {busy ? t(locale, "photos.processing") : t(locale, "photos.save")}
          </Button>
        </div>
        <div className={cn("relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border bg-surface-2 text-[12px] text-muted", dataUrl ? "neon-edge border-solid" : "border-dashed border-border-strong")}>
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt={t(locale, "photos.preview")} className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1.5">
              <Camera className="size-5 text-muted-2" aria-hidden />
              {t(locale, "photos.preview")}
            </span>
          )}
        </div>
      </ActionForm>
    </details>
  );
}
