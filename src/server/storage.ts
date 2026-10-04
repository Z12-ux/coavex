import "server-only";

/**
 * Image storage for progress photos.
 *
 * Today the image travels as a data URL (resized in the browser to ≤1280 px
 * JPEG) and is kept in the ProgressPhoto.url column: portable, works in demo
 * mode and with Postgres, no bucket to provision. `storeImage` is the single
 * seam to swap for object storage (S3 / Vercel Blob) later — callers only
 * ever receive a URL.
 */

const MAX_BYTES = 900_000; // decoded size; server actions accept ~2 MB bodies
const RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ImageCheck = { ok: true; url: string; bytes: number; mime: string } | { ok: false; error: "invalid_image" | "too_large" };

export function checkImageDataUrl(input: string): ImageCheck {
  const m = RE.exec(input.trim());
  if (!m) return { ok: false, error: "invalid_image" };
  const b64 = m[2];
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_BYTES) return { ok: false, error: "too_large" };
  return { ok: true, url: input.trim(), bytes, mime: `image/${m[1]}` };
}

export async function storeImage(checked: Extract<ImageCheck, { ok: true }>): Promise<string> {
  return checked.url;
}

export const PHOTO_POSES = ["FRONT", "SIDE", "BACK"] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];
