import type { CSSProperties } from "react";
import { cn } from "./ui";

/**
 * COAVEX "Forge" brand: a chamfered neon "C" with a forward chevron on a dark
 * tile, the COA/VEX wordmark, and the welcome-screen athlete art.
 * Stable API: <BrandMark size={32} />, <Wordmark sub="…" />.
 *
 * The tile carries `.forge`, so it stays dark (and the emblem lime) in the
 * light theme; the outer halo is dark-theme only.
 */

/** Emblem geometry on a 48 × 48 grid (also used by public/icon.svg). */
const EMBLEM_C = "M36.5 12H19l-7.5 7.5v9L19 36h17.5L33 30.5H21.5L17 26v-4l4.5-4.5H33z";
const EMBLEM_CHEVRON = "M22.5 19.5H27l4.5 4.5-4.5 4.5h-4.5l4.5-4.5z";

/**
 * `title` names the mark for assistive tech; pass `title=""` when a Wordmark
 * (or other visible "COAVEX" text) sits next to it, so it is not read twice.
 */
export function BrandMark({ size = 32, className, title = "COAVEX" }: { size?: number; className?: string; title?: string }) {
  const style = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.26),
    background: "radial-gradient(70% 62% at 50% 46%, color-mix(in oklab, var(--accent) 17%, transparent), transparent 72%), linear-gradient(155deg, var(--surface-3), var(--bg) 80%)",
    ["--bm-g" as string]: `${Math.max(10, Math.round(size * 0.42))}px`,
    ["--bm-halo" as string]: "color-mix(in oklab, var(--accent) 45%, transparent)",
  } as CSSProperties;
  const decorative = !title;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      className={cn("forge relative inline-grid shrink-0 place-items-center border border-accent/45 shadow-[0_0_var(--bm-g)_-3px_var(--bm-halo)] in-data-[theme=light]:shadow-none", className)}
      style={style}
    >
      <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden className="absolute inset-0">
        {/* soft neon bloom (dark theme only) — drawn in viewBox units so it scales with the mark */}
        <g fill="none" stroke="var(--accent)" strokeLinejoin="round" className="in-data-[theme=light]:hidden">
          <path d={EMBLEM_C} strokeWidth={3.2} strokeOpacity={0.1} />
          <path d={EMBLEM_C} strokeWidth={1.4} strokeOpacity={0.22} />
        </g>
        <path d={EMBLEM_C} fill="var(--accent)" />
        <path d={EMBLEM_CHEVRON} fill="var(--accent)" />
        {/* top sheen on the tile */}
        <path d="M6 1.5h36" stroke="white" strokeOpacity={0.07} strokeWidth={1} />
      </svg>
    </span>
  );
}

const WORD_SIZES = {
  md: { word: "text-[19px] tracking-[0.16em] [margin-inline-end:-0.16em]", sub: "mt-1 text-[11px]" },
  lg: { word: "text-[26px] tracking-[0.2em] [margin-inline-end:-0.2em]", sub: "mt-1.5 text-[12px]" },
  xl: { word: "text-[38px] tracking-[0.24em] [margin-inline-end:-0.24em] sm:text-[44px]", sub: "mt-2 text-[12.5px] tracking-[0.02em]" },
} as const;

/** COA + lime VEX, condensed and widely tracked. `size` defaults to the shell size. */
export function Wordmark({ className, sub, size = "md" }: { className?: string; sub?: string; size?: keyof typeof WORD_SIZES }) {
  const s = WORD_SIZES[size];
  return (
    <span className={cn("inline-flex min-w-0 flex-col leading-none", className)}>
      {/* the trailing tracking is trimmed so the word stays optically centred (RTL has no tracking) */}
      <span className={cn("font-display font-extrabold uppercase leading-none text-ink", s.word, "rtl:me-0")}>
        Coa<span className="text-accent">vex</span>
      </span>
      {sub ? <span className={cn("truncate text-muted", s.sub)}>{sub}</span> : null}
    </span>
  );
}

// ───────────────────────────── Welcome athlete art ──────────────────────────

// Static path data (400 × 470 canvas): head, torso and tapered arms of an abstract athlete,
// generated once from smoothed joint outlines — kept as data so nothing is computed at render.
const ATHLETE = {
  head: "M200 42C206 42 215.4 43.7 220 47C224.7 50.3 229.1 57.9 231 64C233 70.2 233.3 81.7 233 88C232.7 94.3 231 101.1 229 106C227.1 111 223 117.4 220 121C217 124.6 212 128.2 209 130C206 131.8 202.7 133 200 133C197.3 133 194 131.8 191 130C188 128.2 183 124.6 180 121C177 117.4 173 111 171 106C169.1 101.1 167.3 94.3 167 88C166.7 81.7 167.1 70.2 169 64C171 57.9 175.4 50.3 180 47C184.7 43.7 194 42 200 42Z",
  torso: "M213 118C217.4 122.2 212.3 140 216 146C219.8 152 230.2 155 238 158C245.8 161 259.9 163 268 166C276.1 169 287.2 172.3 292 178C296.8 183.7 300.3 195.9 300 204C299.7 212.1 292.6 223.3 290 232C287.5 240.7 285.7 252.1 283 262C280.3 271.9 275 287.2 272 298C269 308.8 264.1 322.9 263 334C262 345.1 263.7 359.1 265 372C266.4 384.9 271 403.8 272 420C273.1 436.2 293.6 471 272 480C250.4 489 149.6 489 128 480C106.4 471 127 436.2 128 420C129.1 403.8 133.7 384.9 135 372C136.4 359.1 138.1 345.1 137 334C136 322.9 131 308.8 128 298C125 287.2 119.7 271.9 117 262C114.3 252.1 112.6 240.7 110 232C107.5 223.3 100.3 212.1 100 204C99.7 195.9 103.2 183.7 108 178C112.8 172.3 123.9 169 132 166C140.1 163 154.2 161 162 158C169.8 155 180.3 152 184 146C187.8 140 182.7 122.2 187 118C191.4 113.8 208.7 113.8 213 118Z",
  arms: ["M139.5 176.7C136.9 171.3 127.6 163.7 121.9 161.7C116.1 159.7 104.1 159.9 98.7 162.5C93.3 165.1 87.5 170.7 83.7 180.1C79.9 189.6 74.2 216.9 71.9 229.5C69.5 242.1 67.6 257.6 67.2 269C66.8 280.4 69.8 300 69.1 310.1C68.5 320.2 63 329.3 62.6 340.2C62.1 351.2 66 377.5 66 387.4C66 397.4 62.2 404.6 62.5 410.4C62.8 416.3 66.7 424.9 68 428.7C69.3 432.4 70.1 435.5 71.9 437.1C73.6 438.7 78.2 440.1 80.7 440C83.1 439.8 87.5 437.9 89.1 436.1C90.7 434.4 91.1 431.1 92 427.3C92.9 423.6 95.5 415.1 95.5 409.6C95.5 404.1 91.1 397.9 92 388.6C92.8 379.3 99.9 354.4 101.4 343.8C103 333.2 101.3 323.7 102.9 313.9C104.5 304.2 110.4 285.1 112.8 275C115.2 264.9 116.2 253.1 120.1 242.5C124 231.8 137.6 209.2 140.3 199.9C143.1 190.5 142.1 182.1 139.5 176.7Z", "M301.3 162.5C295.9 159.9 283.9 159.7 278.1 161.7C272.4 163.7 263.1 171.3 260.5 176.7C257.9 182.1 256.9 190.5 259.7 199.9C262.4 209.2 276 231.8 279.9 242.5C283.8 253.1 284.8 264.9 287.2 275C289.6 285.1 295.5 304.2 297.1 313.9C298.7 323.7 297 333.2 298.6 343.8C300.1 354.4 307.2 379.3 308 388.6C308.9 397.9 304.5 404.1 304.5 409.6C304.5 415.1 307.1 423.6 308 427.3C308.9 431.1 309.3 434.4 310.9 436.1C312.5 437.9 316.9 439.8 319.3 440C321.8 440.1 326.4 438.7 328.1 437.1C329.9 435.5 330.7 432.4 332 428.7C333.3 424.9 337.2 416.3 337.5 410.4C337.8 404.6 334 397.4 334 387.4C334 377.5 337.9 351.2 337.4 340.2C337 329.3 331.5 320.2 330.9 310.1C330.2 300 333.2 280.4 332.8 269C332.4 257.6 330.5 242.1 328.1 229.5C325.8 216.9 320.1 189.6 316.3 180.1C312.5 170.7 306.7 165.1 301.3 162.5Z"],
};
const MUSCLE_LINES = [
  "M202 206C222 224 250 223 268 203", "M198 206C178 224 150 223 132 203", "M200 178V214", "M200 228V376",
  "M180 252Q200 259 220 252", "M182 285Q200 292 218 285", "M185 318Q200 324 215 318",
  "M246 330C235 362 222 390 207 416", "M154 330C165 362 178 390 193 416",
];
const TICKS = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * Math.PI * 2;
  const [r0, r1] = i % 4 === 0 ? [157, 166] : [159, 163];
  const f = (x: number) => Math.round(x * 10) / 10;
  return `M${f(200 + Math.cos(a) * r0)} ${f(180 + Math.sin(a) * r0)}L${f(200 + Math.cos(a) * r1)} ${f(180 + Math.sin(a) * r1)}`;
}).join("");
const RING_C = 2 * Math.PI * 148;

/**
 * Abstract athlete silhouette with a lime rim light and a glowing progress
 * ring (the "welcome" screen of the Forge reference). Decorative, no text.
 * Render it inside `.forge` (it is drawn for a dark backdrop).
 */
export function ForgeAthlete({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 400 470" className={cn("block", className)} style={style} aria-hidden focusable="false">
      <defs>
        <radialGradient id="fa-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c4f538" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#c4f538" stopOpacity="0.07" />
          <stop offset="1" stopColor="#c4f538" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fa-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#263424" />
          <stop offset="0.6" stopColor="#151d14" />
          <stop offset="1" stopColor="#0b0f0a" />
        </linearGradient>
        <linearGradient id="fa-cyl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="0.65" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="fa-chest" cx="0.5" cy="0.3" r="0.45">
          <stop offset="0" stopColor="#c4f538" stopOpacity="0.1" />
          <stop offset="1" stopColor="#c4f538" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fa-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#fff" />
          <stop offset="0.96" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="fa-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="470">
          <rect width="400" height="470" fill="url(#fa-fade)" />
        </mask>
        <filter id="fa-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {/* rim light: the silhouette's left, right and top edges in lime, plus a soft halo */}
        <filter id="fa-rim" x="-15%" y="-10%" width="130%" height="120%" colorInterpolationFilters="sRGB">
          <feOffset in="SourceAlpha" dx="4" dy="2.5" result="oa" />
          <feComposite in="SourceAlpha" in2="oa" operator="out" result="ea" />
          <feOffset in="SourceAlpha" dx="-4" dy="2.5" result="ob" />
          <feComposite in="SourceAlpha" in2="ob" operator="out" result="eb" />
          <feMerge result="e">
            <feMergeNode in="ea" />
            <feMergeNode in="eb" />
          </feMerge>
          <feGaussianBlur in="e" stdDeviation="0.8" result="es" />
          <feComposite in="es" in2="SourceAlpha" operator="in" result="edge" />
          <feFlood floodColor="#d4ff5a" />
          <feComposite in2="edge" operator="in" result="rim" />
          <feGaussianBlur in="rim" stdDeviation="7" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="rim" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="200" cy="180" r="196" fill="url(#fa-halo)" />
      <path d={TICKS} stroke="#c4f538" strokeOpacity="0.2" strokeWidth="1.2" />
      <circle cx="200" cy="180" r="148" fill="none" stroke="#c4f538" strokeOpacity="0.12" strokeWidth="1" />
      <g transform="rotate(-90 200 180)" fill="none" stroke="#c4f538" strokeLinecap="round">
        <circle cx="200" cy="180" r="148" strokeWidth="7" strokeOpacity="0.45" strokeDasharray={`${RING_C * 0.67} ${RING_C}`} filter="url(#fa-blur)" />
        <circle cx="200" cy="180" r="148" strokeWidth="2.5" strokeDasharray={`${RING_C * 0.67} ${RING_C}`} />
      </g>

      <g mask="url(#fa-mask)">
        <g filter="url(#fa-rim)">
          <path d={ATHLETE.torso} fill="url(#fa-body)" />
          <path d={ATHLETE.torso} fill="url(#fa-chest)" />
          <path d={ATHLETE.head} fill="url(#fa-body)" />
          {ATHLETE.arms.map((d) => (
            <g key={d}>
              <path d={d} fill="url(#fa-body)" stroke="#070907" strokeOpacity="0.7" strokeWidth="1.5" />
              <path d={d} fill="url(#fa-cyl)" />
            </g>
          ))}
        </g>
        <g fill="none" stroke="#c4f538" strokeOpacity="0.2" strokeWidth="1.3" strokeLinecap="round">
          {MUSCLE_LINES.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>
    </svg>
  );
}
