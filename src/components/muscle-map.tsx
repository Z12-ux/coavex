import { useId } from "react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { cn } from "./ui";

/**
 * Muscle map — stylised anatomy chart (front + back) with the trained muscle
 * groups lit in neon (the "MUSCLES TARGETED" pattern of the Forge reference).
 *
 * STABLE API (other screens depend on it — keep the signature):
 *   <MuscleMap groups={["LEGS", "CORE"]} view="both" height={140} label="…" />
 *   <MuscleLegend groups={groups} locale={locale} />
 *   muscleGroupsOf(exercises)  → ordered, de-duplicated groups
 *
 * Groups come from Exercise.muscleGroup:
 * CHEST | BACK | LEGS | SHOULDERS | ARMS | CORE | FULL_BODY | CARDIO.
 * FULL_BODY lights everything; CARDIO lights the legs + a heart marker.
 *
 * Drawing: every muscle is a left-half shape on a 100 × 220 canvas, mirrored
 * around x = 50. Muscles are masked to an inset of the silhouette and stroked
 * with the body colour, so they read as separate plates with hairline gaps.
 * Colours are tokens only (light theme works; glow is 0 in light).
 */

export const MUSCLE_GROUPS = ["CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "CORE", "FULL_BODY", "CARDIO"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

const isGroup = (g: string): g is MuscleGroup => (MUSCLE_GROUPS as readonly string[]).includes(g);

export function muscleGroupsOf(items: { muscleGroup: string | null | undefined }[]): MuscleGroup[] {
  const count = new Map<MuscleGroup, number>();
  for (const it of items) {
    const g = it.muscleGroup as MuscleGroup;
    if (!g || !(MUSCLE_GROUPS as readonly string[]).includes(g)) continue;
    count.set(g, (count.get(g) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

// ───────────────────────────── Geometry ─────────────────────────────

type Part = { id: string; on: MuscleGroup[]; d: string };

const H = 220; // canvas height (head top ≈ 4, soles ≈ 217)
const FRAME_X = 8; // each figure is cropped to x ∈ [8, 92]
const FRAME_W = 84;
const PANEL_GAP = 8;

/** Closes a left-half outline (M + absolute C only, top-centre → crotch) with its mirror image. */
function mirrorClose(half: string): string {
  const n = half.match(/-?\d*\.?\d+/g)!.map(Number);
  let d = half;
  for (let i = n.length - 6; i >= 2; i -= 6) {
    d += ` C${+(100 - n[i + 2]).toFixed(2)} ${n[i + 3]} ${+(100 - n[i]).toFixed(2)} ${n[i + 1]} ${+(100 - n[i - 2]).toFixed(2)} ${n[i - 1]}`;
  }
  return `${d} Z`;
}

// Athletic figure, ~7.8 heads, arms relaxed. Shared by both views.
const SILHOUETTE = mirrorClose(
  [
    "M50 4",
    "C44.2 4 40.6 8.6 40.6 15.2", // crown
    "C40.6 21.5 42.2 26.4 45 29.2", // cheek → jaw
    "C45.6 30.2 45.5 31.6 45.3 33", // jaw → neck
    "C45.1 35 44.6 36.8 43.8 38.2", // neck
    "C40 40.3 34 41.7 28.5 43", // trapezius slope
    "C22.2 44.3 18.4 48.6 18 55", // deltoid cap
    "C17.6 60.5 16.1 66 16.1 72", // upper arm
    "C16.1 78 16.5 83 17 87", // → elbow
    "C15.7 92 14.3 97.5 14.5 103", // forearm bulge
    "C14.7 108 15.3 112 16 115", // → wrist
    "C15.4 120 15.2 125 16.4 129.5", // hand
    "C17.4 132.8 20.8 132.8 21.8 129.8", // fingertips
    "C22.6 126 22.2 120.5 22.6 116", // thumb side
    "C23 110 23.6 104 24.6 98", // inner forearm
    "C25.4 93 25.9 90 26 87", // inner elbow
    "C26.5 80 27.5 72 28.4 66.5", // inner arm → armpit
    "C28.8 65.8 29.4 65.8 29.9 66.4", // armpit
    "C30 72 31 80 33 88", // lat → waist
    "C33.6 94 32.2 100 31.6 106", // waist → hip
    "C30.6 112 30.1 118 30.5 124", // hip → thigh
    "C31 136 32.5 148 34.5 160", // outer thigh → knee
    "C34.2 165 32.4 169 32.5 175", // knee → calf
    "C32.8 187 36 196 37 204", // calf → ankle
    "C36 208 34.2 212 34.6 214.6", // foot
    "C35.2 216.8 42 216.8 45.2 215.2", // sole
    "C46.2 214.2 46 210 45.6 206", // inner foot
    "C45.8 196 47.4 180 47.1 172", // inner calf
    "C46.9 166 47 162 47.3 158", // inner knee
    "C48 148 48.5 132 49 124", // inner thigh
    "C49.3 121 49.7 119 50 118", // crotch
  ].join(" "),
);

// Shared parts (same on both views)
const TRICEPS_LATERAL: Part = { id: "tri-lat", on: ["ARMS"], d: "M15.8 61 C17.2 64.6 18.8 67 20.2 68.8 C18.2 72.4 17.2 77.4 17.4 83.6 C16 80 15.4 75 15.4 69.6 Z" };
const FOREARM_OUT: Part = { id: "fore-out", on: ["ARMS"], d: "M16.4 89.4 C18.4 88.6 20.4 88.6 21.4 89.1 C20.9 96 19.9 104 18.4 111 C17.4 111.1 16.6 110.8 16 110.2 C13.6 104 13.6 96 16.4 89.4 Z" };
const FOREARM_IN: Part = { id: "fore-in", on: ["ARMS"], d: "M22.4 89.1 C23.9 88.9 25.2 89.1 26.4 89.7 C25.6 96 24.4 104 22.6 111 C21.3 111.6 20.2 111.5 19.4 111.1 C20.9 104 21.9 96 22.4 89.1 Z" };

const FRONT: Part[] = [
  { id: "trap", on: ["BACK"], d: "M45 34.6 C43.6 38.6 37 40.6 26.5 42.2 C27.5 43.6 28.6 44.4 30 44.9 C36 43.9 42 42.7 46.8 42.1 C46.6 40 46 37 45 34.6 Z" },
  { id: "delt", on: ["SHOULDERS"], d: "M33.6 45.6 C27 44.2 19.8 45.6 17.2 52 C15.6 57 16.8 63 20.6 68.6 C21.2 67 21.9 65.5 22.6 64.2 C26 56.5 29.8 50.2 33.6 45.6 Z" },
  { id: "pec", on: ["CHEST"], d: "M50 43.6 C44.2 43.1 38.6 43.8 35 45.6 C31.4 49.6 28.8 53.6 27.2 57.4 C26.6 59 26.1 60.4 25.8 61.8 C28.4 63.4 31.4 65 35.4 66 C40.2 67.4 45.6 67.4 50 66.4 Z" },
  { id: "biceps", on: ["ARMS"], d: "M21 67.6 C22.6 65.4 25.2 64 27.6 64.6 C28.8 70 27.6 80 24.8 85.6 C22.4 87.4 19.4 87.2 17.8 84.4 C16.4 79 16.8 72.6 21 67.6 Z" },
  TRICEPS_LATERAL,
  FOREARM_OUT,
  FOREARM_IN,
  { id: "ab1", on: ["CORE"], d: "M50 68.6 L50 77 L42.4 77.2 C42.1 74 42.3 71.2 42.9 69.3 C45.1 68.5 47.8 68.3 50 68.6 Z" },
  { id: "ab2", on: ["CORE"], d: "M50 77 L50 86 L42.2 86.2 C41.9 83 41.9 80 42.4 77.2 Z" },
  { id: "ab3", on: ["CORE"], d: "M50 86 L50 95 L43 95.3 C42.4 92 42.2 89 42.2 86.2 Z" },
  { id: "ab4", on: ["CORE"], d: "M50 95 L50 113.5 C48.4 113.4 46.9 111.8 45.9 109.2 C44.7 105.6 43.6 100.2 43 95.3 Z" },
  { id: "oblique", on: ["CORE"], d: "M42.9 69.8 C39 68.6 34.6 67.6 29.4 66.6 C30.6 76 32.2 86 32.8 94 C33.4 100 35.2 104.6 38.4 107.8 C40.8 109.4 43.4 110.2 45.4 109.8 C44.2 105 43 99 42.6 95 C42.1 89 42 81 42.4 76 C42.5 73.5 42.6 71.5 42.9 69.8 Z" },
  { id: "vastus-lat", on: ["LEGS"], d: "M31.4 105.6 C34.5 107.2 37 108.8 38.5 110 C36.8 113 36 118 35.8 126 C35.6 137 38.4 147.5 40.6 155 C38.8 157 36.4 157.8 34.8 157.2 C31 147 29 131 29.4 118 C29.7 112 30.4 108.4 31.4 105.6 Z" },
  { id: "rectus-fem", on: ["LEGS"], d: "M38.5 110 C41.5 112 43.2 118 43.6 126 C44 137 42.8 147.5 40.6 155 C38.4 147.5 35.6 137 35.8 126 C36 118 36.8 113 38.5 110 Z" },
  { id: "adductor", on: ["LEGS"], d: "M42.5 112 C45.5 113.6 48.5 115.8 50.6 118 L50.6 128 C50.2 131.4 49.8 134.4 49.2 137.4 C47.6 133.4 46 129.4 45.1 125.2 C44.4 121 43.5 116 42.5 112 Z" },
  { id: "vastus-med", on: ["LEGS"], d: "M44.2 127.6 C45.8 131 47.8 135 49.4 139.6 C50 146.4 48.6 153.4 45.2 157 C43.4 157.8 41.8 157 40.9 155.4 C43 148 44.4 138 44.2 127.6 Z" },
  { id: "tibialis", on: ["LEGS"], d: "M35.2 163 C37.8 161.8 40 162.2 41 163.8 C41 175 40.2 187 39.2 198 C38.6 199.2 37.8 199.2 37.2 198.4 C35 190 32.8 180 32.8 172 C32.8 167.6 33.6 164.6 35.2 163 Z" },
  { id: "calf-med", on: ["LEGS"], d: "M42.8 163.4 C45.6 162.6 47.4 164.8 48.2 169.6 C48.8 176 47.8 184 46.2 191.4 C45.2 193.6 43.8 194 43 192.4 C42.2 184 42 175 42.8 163.4 Z" },
];

const BACK: Part[] = [
  { id: "trap", on: ["BACK"], d: "M50 31.5 L46.3 33 C46.2 35.6 45.8 37.6 45 38.6 C41 40.6 35 42.2 28.4 43.6 C32.4 46 36.8 48 40.6 50.6 C44 60 47 72 50 84.5 Z" },
  { id: "rear-delt", on: ["SHOULDERS"], d: "M28.4 44.6 C23 44.8 18.6 47.6 17.2 53 C16 58 17 63.4 20.6 68.6 C24 64 28 57.6 31.8 51.8 C32.8 49.6 31.8 47 28.4 44.6 Z" },
  { id: "mid-back", on: ["BACK"], d: "M32.6 52 C35.6 51.2 38.2 51.4 41 52.4 C42.4 56.8 43.4 60.8 44.4 64.4 C40.4 66.8 34.8 67.4 29.6 66.2 C28.4 65.4 27 64.4 25.8 63.2 C27.6 59.2 30 55.2 32.6 52 Z" },
  { id: "triceps", on: ["ARMS"], d: "M20.4 70.2 C22.8 67.4 25.6 65.4 28.2 66.6 C28.6 73.2 27.2 80.4 24.8 85.8 C22.4 87.4 19.4 87.2 17.6 84.6 C16.2 79 16.4 74 20.4 70.2 Z" },
  TRICEPS_LATERAL,
  FOREARM_OUT,
  FOREARM_IN,
  { id: "lat", on: ["BACK"], d: "M29.4 67.2 C35 68.6 40.6 68.2 44.9 65.6 C46.6 70.6 48.2 76.8 49.4 83 C47.6 90.6 43.4 98 38.8 103.8 C36 104.4 33.2 104.6 30.6 104.8 C29.6 94 28.4 79 28.6 70 C28.7 69 29 68 29.4 67.2 Z" },
  { id: "lower-back", on: ["BACK", "CORE"], d: "M50 85.6 C48.6 91.6 44.8 98.6 40.4 104.4 C43.8 106.4 47.4 109 50 112 Z" },
  { id: "glute", on: ["LEGS"], d: "M50 113.4 L50 124.6 C46 126.4 40 126.8 35.4 124.8 C32.4 123.2 30.2 119 30.2 114 C30.2 111 30.4 108.6 30.8 106.6 C34.4 106 37.6 106 40.2 106.4 C43.8 107.6 47.4 110 50 113.4 Z" },
  { id: "ham-out", on: ["LEGS"], d: "M31.2 126.6 C34.4 127.8 37.6 128.2 40.4 128.2 C40.8 136 40.2 147 39 156.4 C37.4 157.6 35.8 157.6 34.6 157 C31.6 148 29.8 136.5 31.2 126.6 Z" },
  { id: "ham-in", on: ["LEGS"], d: "M41.6 128.2 C44.6 128 47.6 127 50.2 125.4 L50 132 C49 140 47.6 149 45.4 157.2 C43.8 158 42.2 157.8 40.9 156.8 C41.9 146 42.2 136.2 41.6 128.2 Z" },
  { id: "calf-lat", on: ["LEGS"], d: "M36 163 C38.4 162 40 162.4 40.6 164 C40.9 172 40.3 181 39.1 188 C37.6 189.2 36 188.8 35.2 187.2 C33.2 181 32.4 173 33.3 168 C33.8 165.6 34.8 164 36 163 Z" },
  { id: "calf-med", on: ["LEGS"], d: "M41.6 164 C42.6 162.4 44.6 162.4 46.2 163.6 C47.6 166.6 48.1 172 47.6 178 C47.1 184 45.6 189.2 43.6 191.2 C42.3 191 41.6 190.2 41.4 188.6 C41.6 181 41.9 172 41.6 164 Z" },
];

// CARDIO marker: a heart with an ECG trace, on the (anatomical) left chest.
const HEART = "M57.5 60.6 C53.2 57.8 52 55 52.6 53.2 C53.2 51.4 55.6 50.8 57.5 52.8 C59.4 50.8 61.8 51.4 62.4 53.2 C63 55 61.8 57.8 57.5 60.6 Z";
const ECG = "M53.6 55.8 H55.4 L56.4 53.6 L57.8 58 L59 54.8 L59.8 55.8 H61.4";

const INACTIVE = "color-mix(in oklab, var(--muted-2) 40%, var(--surface-3))";
const MIRROR = "matrix(-1 0 0 1 100 0)";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function activeSet(groups: readonly string[]): Set<MuscleGroup> {
  const set = new Set<MuscleGroup>(groups.filter(isGroup));
  // FULL_BODY lights every muscle; the heart marker stays reserved for real CARDIO work.
  if (set.has("FULL_BODY")) for (const g of MUSCLE_GROUPS) if (g !== "CARDIO") set.add(g);
  if (set.has("CARDIO")) set.add("LEGS");
  return set;
}

function Plates({ parts }: { parts: Part[] }) {
  const paths = parts.map((p) => <path key={p.id} d={p.d} />);
  return (
    <>
      {paths}
      <g transform={MIRROR}>{paths}</g>
    </>
  );
}

function Figure({ parts, active, x, ids, gap, line, heart }: { parts: Part[]; active: Set<MuscleGroup>; x: number; ids: { mask: string; grad: string }; gap: number; line: number; heart: boolean }) {
  const lit = parts.filter((p) => p.on.some((g) => active.has(g)));
  const dim = parts.filter((p) => !p.on.some((g) => active.has(g)));
  const plate = { stroke: "var(--surface-3)", strokeWidth: gap, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x} 0)`} aria-hidden>
      <path d={SILHOUETTE} fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth={line} strokeLinejoin="round" />
      <g mask={`url(#${ids.mask})`} fill={INACTIVE} {...plate}>
        <Plates parts={dim} />
      </g>
      {lit.length ? (
        <g className="ring-glow" style={{ color: "var(--accent)" }}>
          <g mask={`url(#${ids.mask})`} fill={`url(#${ids.grad})`} {...plate}>
            <Plates parts={lit} />
          </g>
        </g>
      ) : null}
      {heart ? (
        <g className="ring-glow" style={{ color: "var(--accent)" }}>
          <path d={HEART} fill="var(--accent)" stroke="var(--surface-3)" strokeWidth={gap * 0.8} strokeLinejoin="round" />
          <path d={ECG} fill="none" stroke="var(--accent-ink)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </g>
  );
}

export function MuscleMap({ groups, view = "both", height = 140, className, label, locale = "fr" }: { groups: readonly string[]; view?: "front" | "back" | "both"; height?: number; className?: string; label?: string; /** language of the default aria-label (group names) */ locale?: Locale }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = { mask: `mm-m${uid}`, grad: `mm-g${uid}` };
  const active = activeSet(groups);
  const panels = view === "both" ? (["front", "back"] as const) : ([view] as const);
  const w = FRAME_W * panels.length + PANEL_GAP * (panels.length - 1);
  // hairline gaps and outline stay ~1px on screen whatever the size
  const s = height / H;
  const gap = clamp(1.3 / s, 0.55, 2);
  const line = clamp(1 / s, 0.8, 2.2);
  const names = [...new Set(groups.filter(isGroup))].map((g) => t(locale, `muscle.${g}`));
  const a11y = label ?? names.join(", ");
  return (
    <svg viewBox={`0 0 ${w} ${H}`} height={height} width={+((height * w) / H).toFixed(1)} overflow="visible" className={cn("shrink-0", className)} {...(a11y ? { role: "img", "aria-label": a11y } : { "aria-hidden": true })}>
      <defs>
        <mask id={ids.mask} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={H}>
          <path d={SILHOUETTE} fill="white" stroke="black" strokeWidth={2 * (gap * 0.8 + line / 2)} strokeLinejoin="round" />
        </mask>
        <linearGradient id={ids.grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent)" }} />
          <stop offset="1" style={{ stopColor: "color-mix(in oklab, var(--accent) 74%, var(--surface-3))" }} />
        </linearGradient>
      </defs>
      {panels.map((p, i) => (
        <Figure key={p} parts={p === "front" ? FRONT : BACK} active={active} x={i * (FRAME_W + PANEL_GAP) - FRAME_X} ids={ids} gap={gap} line={line} heart={p === "front" && active.has("CARDIO")} />
      ))}
    </svg>
  );
}

/** Compact legend of the targeted groups: lime dot + localized name. */
export function MuscleLegend({ groups, locale, className }: { groups: readonly string[]; locale: Locale; className?: string }) {
  const list = [...new Set(groups.filter(isGroup))];
  if (!list.length) return null;
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {list.map((g) => (
        <li key={g} className="flex min-w-0 items-center gap-2 text-[13px] font-medium leading-4 text-ink-2">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0 break-words">{t(locale, `muscle.${g}`)}</span>
        </li>
      ))}
    </ul>
  );
}
