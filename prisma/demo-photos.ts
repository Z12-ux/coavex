/**
 * Demo progress "photos".
 *
 * The seed cannot ship photographs of real people, so it draws stylised
 * silhouettes from the client's own data (sex, height, weight at that date,
 * muscle progress). They are clearly labelled as illustrations; real photos
 * are uploaded through the app and stored the same way (ProgressPhoto.url).
 *
 * "Forge" look: dark studio (near-black gradient, faint lime grid, lime floor
 * glow), the figure in dark slate-green with a lime rim light and a lime
 * training top. Pure SVG, deterministic, no dependencies.
 * Output: public/demo/photos/*.svg
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type DemoPose = "FRONT" | "SIDE";
export interface FigureInput {
  sex: "M" | "F";
  heightCm: number;
  weightKg: number;
  /** 0..1 — visible muscularity (shoulders, arms, less waist) */
  muscle: number;
  pose: DemoPose;
  /** caption shown in the corner tag (kept short) */
  tag?: string;
}

const W = 900;
const H = 1200;
const CX = 450;
const FLOOR = 1140;
const LIME = "#c4f538";
const SKIN = "#27372e";
const HAIR = "#0c120e";
const TOP = "#8fb82a";
const SHORTS = "#0e150f";
const SEAM = "#0a0f0b";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

type Pt = [number, number];
/** A joint on a limb centre line: x, y, half-width. */
type Joint = [number, number, number];

/** Catmull-Rom spline through the points, closed, as an SVG path. */
function smoothClosed(pts: Pt[], tension = 0.9): string {
  const n = pts.length;
  const k = tension / 6;
  let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) * k;
    const c1y = p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[0] - (p3[0] - p1[0]) * k;
    const c2y = p2[1] - (p3[1] - p1[1]) * k;
    d += ` C ${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + " Z";
}

/** Smooth tapered outline around a centre line (arm, leg): rounded ends, width per joint. */
function limb(js: Joint[]): string {
  const n = js.length;
  const tan = (i: number): Pt => {
    const a = js[Math.max(0, i - 1)];
    const b = js[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  js.forEach(([x, y, r], i) => {
    const [tx, ty] = tan(i);
    left.push([x - ty * r, y + tx * r]);
    right.push([x + ty * r, y - tx * r]);
  });
  const cap = (j: Joint, [tx, ty]: Pt, dir: 1 | -1): Pt[] => {
    const [x, y, r] = j;
    const f = 0.72 * r;
    // two points at ±45° then the tip, ordered to continue the outline
    const a: Pt = [x + dir * tx * f - ty * f, y + dir * ty * f + tx * f];
    const tip: Pt = [x + dir * tx * r, y + dir * ty * r];
    const b: Pt = [x + dir * tx * f + ty * f, y + dir * ty * f - tx * f];
    return dir === 1 ? [a, tip, b] : [b, tip, a];
  };
  return smoothClosed([...cap(js[0], tan(0), -1), ...left, ...cap(js[n - 1], tan(n - 1), 1), ...right.reverse()], 0.85);
}

function bodyParams(i: FigureInput) {
  const F = i.sex === "F";
  const h = i.heightCm / 100;
  const bmi = i.weightKg / (h * h);
  const f = clamp((bmi - (F ? 20.5 : 21.5)) / 9, -0.35, 1.4); // adiposity factor
  const m = clamp(i.muscle, 0, 1);
  return {
    F,
    f,
    m,
    head: F ? 50 : 54,
    neck: (F ? 19 : 24) * (1 + 0.15 * f + 0.25 * m),
    sw: (F ? 128 : 150) * (1 + 0.1 * f + 0.14 * m),
    cw: (F ? 116 : 132) * (1 + 0.18 * f + 0.12 * m),
    ww: (F ? 88 : 106) * (1 + 0.42 * f - 0.06 * m),
    hw: (F ? 132 : 116) * (1 + 0.26 * f),
    tw: (F ? 58 : 56) * (1 + 0.3 * f + 0.12 * m),
    kw: 33 * (1 + 0.15 * f),
    ua: (F ? 26 : 32) * (1 + 0.3 * f + 0.25 * m),
    fa: (F ? 21 : 26) * (1 + 0.2 * f + 0.18 * m),
    belly: 16 + 118 * Math.max(0, f) - 12 * m,
    glute: (F ? 48 : 34) + 34 * Math.max(0, f) + 12 * m,
    tall: clamp(i.heightCm / (F ? 166 : 177), 0.93, 1.06),
  };
}

type P = ReturnType<typeof bodyParams>;

/**
 * Shared paint for a figure, back to front: skin, limb shading, clothes clipped
 * to the body, torso shading, lime trims, head, then the limbs that sit in
 * front (arms). One rim-light filter on the group, so the lime edge follows the
 * whole silhouette and never the inner overlaps.
 */
function paint(parts: { torso: string; legs: string[]; under?: string[]; over: string[]; head: string; topBand: [number, number]; shortsBand: [number, number]; extras?: string }): string {
  const limbs = [...parts.legs, ...(parts.under ?? [])];
  const cyl = (d: string) => `<path d="${d}" fill="url(#cyl)"/>`;
  const band = ([y0, y1]: [number, number], fill: string, clip: string) => `<rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" fill="${fill}" clip-path="url(#${clip})"/>`;
  return `
  <clipPath id="torso"><path d="${parts.torso}"/></clipPath>
  <clipPath id="lower">${[parts.torso, ...parts.legs].map((d) => `<path d="${d}"/>`).join("")}</clipPath>
  <g filter="url(#rim)">
    ${[parts.torso, ...limbs].map((d) => `<path d="${d}" fill="${SKIN}"/>`).join("")}
    ${limbs.map(cyl).join("")}
    ${band(parts.topBand, TOP, "torso")}
    ${cyl(parts.torso)}
    ${band(parts.shortsBand, "url(#shorts)", "lower")}
    ${parts.extras ?? ""}
    ${parts.head}
    ${parts.over.map((d) => `<path d="${d}" fill="${SKIN}" stroke="${SEAM}" stroke-opacity="0.7" stroke-width="2.5"/>${cyl(d)}`).join("")}
  </g>`;
}

function headFront(p: P): string {
  const hy = 196;
  const rx = p.head;
  const ry = r1(p.head * 1.26);
  const hair = p.F
    ? `<ellipse cx="${CX}" cy="${hy - 8}" rx="${r1(rx * 1.08)}" ry="${r1(ry * 0.98)}" fill="${HAIR}"/><circle cx="${CX}" cy="${r1(hy - ry - 14)}" r="27" fill="${HAIR}"/>`
    : "";
  const cap = p.F ? "" : `<path d="M ${r1(CX - rx * 1.02)} ${hy - 12} Q ${r1(CX - rx * 1.06)} ${r1(hy - ry - 4)} ${CX} ${r1(hy - ry - 8)} Q ${r1(CX + rx * 1.06)} ${r1(hy - ry - 4)} ${r1(CX + rx * 1.02)} ${hy - 12} Q ${r1(CX + rx * 0.62)} ${hy - 50} ${CX} ${hy - 44} Q ${r1(CX - rx * 0.62)} ${hy - 50} ${r1(CX - rx * 1.02)} ${hy - 12} Z" fill="${HAIR}"/>`;
  const ears = [-1, 1].map((s) => `<ellipse cx="${r1(CX + s * rx * 0.97)}" cy="${hy + 8}" rx="9" ry="17" fill="${SKIN}"/>`).join("");
  return `${hair}${ears}<ellipse cx="${CX}" cy="${hy}" rx="${rx}" ry="${ry}" fill="${SKIN}"/>${cap}`;
}

function frontFigure(p: P): string {
  const n = p.neck;
  const half: Pt[] = [
    [CX + n * 1.1, 250],
    [CX + n * 1.35, 294],
    [CX + p.sw * 0.55, 322],
    [CX + p.sw * 0.84, 340],
    [CX + p.cw, 398],
    [CX + p.cw * 0.97, 455],
    [CX + (p.cw + p.ww) / 2, 515],
    [CX + p.ww, 578],
    [CX + (p.ww + p.hw) / 2, 632],
    [CX + p.hw, 690],
    [CX + p.hw * 0.95, 748],
    [CX + p.hw * 0.5, 792],
  ];
  const torso = smoothClosed([...half, [CX, 800], ...[...half].reverse().map(([x, y]) => [2 * CX - x, y] as Pt)]);
  const arms = [-1, 1].map((s) =>
    limb([
      [CX + s * (p.sw - p.ua * 0.9), 350, p.ua * 1.12],
      [CX + s * (p.sw + p.ua * 0.08), 440, p.ua],
      [CX + s * (p.sw + 12), 578, p.ua * 0.74],
      [CX + s * (p.sw + 20), 636, p.fa],
      [CX + s * (p.sw + 32), 768, p.fa * 0.62],
      [CX + s * (p.sw + 36), 816, p.fa * 0.84],
      [CX + s * (p.sw + 37), 858, p.fa * 0.56],
    ]),
  );
  const legX = p.hw * 0.5;
  const legs = [-1, 1].map((s) =>
    limb([
      [CX + s * legX * 0.94, 752, p.tw * 1.02],
      [CX + s * legX, 800, p.tw],
      [CX + s * (legX + 2), 880, p.tw * 0.8],
      [CX + s * (legX + 4), 948, p.kw],
      [CX + s * (legX + 6), 1012, p.kw * 1.14],
      [CX + s * (legX + 7), 1070, p.kw * 0.72],
      [CX + s * (legX + 8), 1114, p.kw * 0.5],
    ]),
  );
  const feet = [-1, 1].map((s) => `<ellipse cx="${r1(CX + s * (legX + 12))}" cy="${FLOOR - 4}" rx="${r1(p.kw * 0.98)}" ry="17" fill="${SKIN}"/>`).join("");
  // thin lime waistband on the shorts
  const waistband = `<rect x="0" y="${p.F ? 652 : 660}" width="${W}" height="7" fill="${LIME}" fill-opacity="0.8" clip-path="url(#lower)"/>`;
  const topSeam = p.F ? "" : `<path d="M ${r1(CX - n * 1.2)} 300 Q ${CX} 352 ${r1(CX + n * 1.2)} 300" fill="none" stroke="${SEAM}" stroke-opacity="0.55" stroke-width="5"/>`;
  return paint({
    torso,
    legs,
    over: arms,
    head: headFront(p) + feet,
    topBand: p.F ? [372, 500] : [300, 666],
    shortsBand: p.F ? [652, 872] : [660, 862],
    extras: waistband + topSeam,
  });
}

function sideFigure(p: P): string {
  const bx = 470;
  // profile facing left: front of the body is the smaller x
  const torsoPts: Pt[] = [
    [bx - 40, 328],
    [bx - 70 - p.m * 14, 430],
    [bx - 66 - p.belly * 0.55, 540],
    [bx - 64 - p.belly, 640],
    [bx - 52 - p.belly * 0.7, 730],
    [bx - 30 - p.belly * 0.2, 800],
    [bx + 2, 818],
    [bx + 34 + p.glute * 0.4, 792],
    [bx + 44 + p.glute, 720],
    [bx + 58, 610],
    [bx + 76 + p.m * 6, 470],
    [bx + 58 + p.m * 10, 350],
    [bx + 30, 322],
  ];
  const torso = smoothClosed(torsoPts);
  const neck = limb([
    [bx - 2, 236, p.neck * 1.35],
    [bx + 4, 336, p.neck * 1.6],
  ]);
  const x = bx - 4;
  const legs = [
    limb([
      [x + 8, 722, p.tw * 1.2],
      [x, 800, p.tw * 1.08],
      [x - 4, 880, p.tw * 0.86],
      [x - 8, 948, p.kw * 1.02],
      [x + 2, 1010, p.kw * 1.25],
      [x - 2, 1070, p.kw * 0.8],
      [x - 6, 1112, p.kw * 0.55],
    ]),
  ];
  const arm = limb([
    [bx + 10, 368, p.ua * 1.22],
    [bx + 8, 460, p.ua],
    [bx + 2, 580, p.ua * 0.74],
    [bx - 2, 636, p.fa],
    [bx - 8, 768, p.fa * 0.62],
    [bx - 10, 816, p.fa * 0.84],
    [bx - 11, 858, p.fa * 0.56],
  ]);
  const hy = 200;
  const rx = r1(p.head * 1.06);
  const ry = r1(p.head * 1.24);
  const hair = p.F
    ? `<ellipse cx="${bx + 4}" cy="${hy - 8}" rx="${r1(rx * 1.02)}" ry="${r1(ry * 1.0)}" fill="${HAIR}"/><circle cx="${r1(bx + rx * 0.72)}" cy="${r1(hy - ry + 6)}" r="27" fill="${HAIR}"/>`
    : "";
  const cap = p.F ? "" : `<path d="M ${r1(bx - rx * 0.9)} ${hy - 30} Q ${r1(bx - rx * 0.3)} ${r1(hy - ry - 10)} ${r1(bx + rx * 0.5)} ${r1(hy - ry - 2)} Q ${r1(bx + rx * 1.1)} ${hy - 40} ${r1(bx + rx * 0.96)} ${hy + 8} Q ${r1(bx + rx * 0.3)} ${hy - 40} ${r1(bx - rx * 0.9)} ${hy - 30} Z" fill="${HAIR}"/>`;
  const head = `${hair}<ellipse cx="${bx - 8}" cy="${hy}" rx="${rx}" ry="${ry}" fill="${SKIN}"/><ellipse cx="${r1(bx - 8 - rx + 2)}" cy="${hy + 12}" rx="10" ry="13" fill="${SKIN}"/><ellipse cx="${bx + 8}" cy="${hy + 10}" rx="10" ry="17" fill="none" stroke="${SEAM}" stroke-opacity="0.45" stroke-width="3"/>${cap}`;
  const feet = `<ellipse cx="${bx - 46}" cy="${FLOOR - 4}" rx="62" ry="18" fill="${SKIN}"/>`;
  const waistband = `<rect x="0" y="${p.F ? 652 : 664}" width="${W}" height="7" fill="${LIME}" fill-opacity="0.8" clip-path="url(#lower)"/>`;
  return paint({
    torso,
    legs,
    under: [neck],
    over: [arm],
    head: head + feet,
    topBand: p.F ? [372, 506] : [318, 670],
    shortsBand: p.F ? [652, 872] : [664, 862],
    extras: waistband,
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Studio backdrop: near-black gradient, faint lime wall grid, perspective floor, lime floor glow. */
function backdrop(): string {
  const horizon = 1040;
  const wall = [
    ...Array.from({ length: 11 }, (_, k) => `M ${75 + k * 75} 0 V ${horizon}`),
    ...Array.from({ length: 13 }, (_, k) => `M 0 ${80 + k * 75} H ${W}`),
  ].join(" ");
  const floorRays = Array.from({ length: 15 }, (_, k) => {
    const x = CX + (k - 7) * 75;
    const vx = CX + (x - CX) * 3.2; // diverge toward the viewer
    return `M ${x} ${horizon} L ${r1(vx)} ${H}`;
  }).join(" ");
  const floorRows = [1062, 1092, 1132, 1184].map((y) => `M 0 ${y} H ${W}`).join(" ");
  return `
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<path d="${wall}" stroke="${LIME}" stroke-opacity="0.045" stroke-width="1.5"/>
<path d="${floorRays} ${floorRows}" stroke="${LIME}" stroke-opacity="0.07" stroke-width="1.5"/>
<rect y="${horizon}" width="${W}" height="1.5" fill="${LIME}" fill-opacity="0.16"/>
<rect width="${W}" height="${H}" fill="url(#backlight)"/>
<ellipse cx="${CX}" cy="${FLOOR}" rx="330" ry="46" fill="url(#floor)"/>
<ellipse cx="${CX}" cy="${FLOOR + 2}" rx="200" ry="14" fill="#000" fill-opacity="0.55"/>`;
}

export function figureSvg(i: FigureInput): string {
  const p = bodyParams(i);
  const body = i.pose === "SIDE" ? sideFigure(p) : frontFigure(p);
  const tag = i.tag ?? "Illustration";
  const tagW = Math.max(160, Math.round(tag.length * 13.2 + 70));
  const tagX = W - 28 - tagW;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(tag)}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a11"/><stop offset="0.62" stop-color="#0a0e09"/><stop offset="1" stop-color="#050705"/></linearGradient>
  <radialGradient id="backlight" cx="0.5" cy="0.42" r="0.55"><stop offset="0" stop-color="${LIME}" stop-opacity="0.16"/><stop offset="0.5" stop-color="${LIME}" stop-opacity="0.05"/><stop offset="1" stop-color="${LIME}" stop-opacity="0"/></radialGradient>
  <radialGradient id="floor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${LIME}" stop-opacity="0.38"/><stop offset="0.6" stop-color="${LIME}" stop-opacity="0.08"/><stop offset="1" stop-color="${LIME}" stop-opacity="0"/></radialGradient>
  <linearGradient id="shorts" gradientUnits="userSpaceOnUse" x1="${CX - 190}" y1="0" x2="${CX + 190}" y2="0"><stop offset="0" stop-color="#050805"/><stop offset="0.5" stop-color="${SHORTS}"/><stop offset="0.62" stop-color="#172016"/><stop offset="1" stop-color="#050805"/></linearGradient>
  <linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.3" stop-color="#000" stop-opacity="0.05"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.06"/><stop offset="0.78" stop-color="#000" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></linearGradient>
  <filter id="rim" x="-20%" y="-10%" width="140%" height="120%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="6" dy="4" result="oa"/>
    <feComposite in="SourceAlpha" in2="oa" operator="out" result="ea"/>
    <feOffset in="SourceAlpha" dx="-6" dy="4" result="ob"/>
    <feComposite in="SourceAlpha" in2="ob" operator="out" result="eb"/>
    <feMerge result="e"><feMergeNode in="ea"/><feMergeNode in="eb"/></feMerge>
    <feGaussianBlur in="e" stdDeviation="1.6" result="es"/>
    <feComposite in="es" in2="SourceAlpha" operator="in" result="edge"/>
    <feFlood flood-color="${LIME}" flood-opacity="0.95" result="lime"/>
    <feComposite in="lime" in2="edge" operator="in" result="rimlight"/>
    <feGaussianBlur in="rimlight" stdDeviation="12" result="halo"/>
    <feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/><feMergeNode in="rimlight"/></feMerge>
  </filter>
</defs>
${backdrop()}
<g transform="translate(${CX} ${FLOOR - 10}) scale(1 ${r1(p.tall)}) translate(${-CX} ${-(FLOOR - 10)})">${body}
</g>
<rect x="${tagX}" y="28" width="${tagW}" height="52" rx="26" fill="#0b100a" fill-opacity="0.82" stroke="${LIME}" stroke-opacity="0.45" stroke-width="1.5"/>
<circle cx="${tagX + 27}" cy="54" r="6" fill="${LIME}"/>
<text x="${tagX + 44}" y="62.5" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="23" font-weight="600" letter-spacing="0.4" fill="#dfe9d6">${esc(tag)}</text>
</svg>
`;
}

// ───────────────────────────── files ────────────────────────────────────────

export const DEMO_PHOTO_DIR = path.join(process.cwd(), "public", "demo", "photos");
export const DEMO_PHOTO_URL = "/demo/photos";

export function resetDemoPhotoDir(): void {
  rmSync(DEMO_PHOTO_DIR, { recursive: true, force: true });
  mkdirSync(DEMO_PHOTO_DIR, { recursive: true });
}

/** Writes the SVG and returns the public URL to store in ProgressPhoto.url. */
export function writeDemoPhoto(slug: string, daysAgo: number, pose: DemoPose, svg: string): string {
  const name = `${slug}-${String(daysAgo).padStart(3, "0")}-${pose.toLowerCase()}.svg`;
  writeFileSync(path.join(DEMO_PHOTO_DIR, name), svg, "utf8");
  return `${DEMO_PHOTO_URL}/${name}`;
}
