/**
 * Progress photos — pure helpers shared by the coach profile and the client app.
 */

export interface PhotoItem {
  id: string;
  url: string;
  pose: string;
  /** ISO date (yyyy-mm-dd) — serialisable for client components */
  date: string;
  note: string | null;
  weightKg: number | null;
  waistCm: number | null;
  /** true when the file is a generated demo illustration (seed) */
  illustration: boolean;
}

type PhotoRow = { id: string; url: string; pose: string; date: Date; note: string | null };
type MeasurementRow = { date: Date; weightKg: number | null; waistCm: number | null };

const DAY = 86_400_000;

/** Nearest measurement within ±10 days (weight and waist may come from different rows). */
export function nearestMeasurement(measurements: MeasurementRow[], date: Date): { weightKg: number | null; waistCm: number | null } {
  let weight: { v: number; d: number } | null = null;
  let waist: { v: number; d: number } | null = null;
  for (const m of measurements) {
    const d = Math.abs(m.date.getTime() - date.getTime());
    if (d > 10 * DAY) continue;
    if (m.weightKg !== null && (!weight || d < weight.d)) weight = { v: m.weightKg, d };
    if (m.waistCm !== null && (!waist || d < waist.d)) waist = { v: m.waistCm, d };
  }
  return { weightKg: weight?.v ?? null, waistCm: waist?.v ?? null };
}

export function toPhotoItems(photos: PhotoRow[], measurements: MeasurementRow[]): PhotoItem[] {
  return [...photos]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((p) => {
      const m = nearestMeasurement(measurements, p.date);
      return { id: p.id, url: p.url, pose: p.pose, date: p.date.toISOString().slice(0, 10), note: p.note, weightKg: m.weightKg, waistCm: m.waistCm, illustration: p.url.startsWith("/demo/photos/") };
    });
}

/** Default comparison: the pose with the most photos (FRONT wins ties), first vs latest. */
export function defaultPair(photos: PhotoItem[]): { pose: string | null; before: PhotoItem | null; after: PhotoItem | null } {
  if (!photos.length) return { pose: null, before: null, after: null };
  const counts = new Map<string, number>();
  for (const p of photos) counts.set(p.pose, (counts.get(p.pose) ?? 0) + 1);
  const pose = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "FRONT" ? -1 : b[0] === "FRONT" ? 1 : 0))[0][0];
  const list = photos.filter((p) => p.pose === pose);
  return { pose, before: list[0] ?? null, after: list.length > 1 ? list[list.length - 1] : null };
}

export function daysApart(a: string, b: string): number {
  return Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / DAY);
}
