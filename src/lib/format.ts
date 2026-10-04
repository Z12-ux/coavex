import type { Locale } from "@/domain/types";

const LOCALE_TAG: Record<Locale, string> = { fr: "fr-DZ", ar: "ar-DZ", en: "en-GB" };

export function fmtDate(d: Date | string | null | undefined, locale: Locale = "fr", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { hourCycle: "h23", ...opts }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined, locale: Locale = "fr"): string {
  return fmtDate(d, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtWeekday(d: Date, locale: Locale = "fr"): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "long" }).format(d);
}

export function fmtRelative(d: Date | string | null | undefined, locale: Locale = "fr", now = new Date()): string {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = date.getTime() - now.getTime();
  const days = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE_TAG[locale], { numeric: "auto" });
  if (Math.abs(days) >= 1) return rtf.format(days, "day");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) >= 1) return rtf.format(hours, "hour");
  return rtf.format(Math.round(diffMs / 60_000), "minute");
}

export function fmtKg(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined) return "–";
  return `${x.toFixed(digits).replace(/\.0$/, "")} kg`;
}

export function fmtMoney(x: number, currency = "DA"): string {
  return `${x.toLocaleString("fr-DZ")} ${currency}`;
}

export function fmtPct(x: number | null | undefined): string {
  if (x === null || x === undefined) return "–";
  return `${Math.round(x)}%`;
}

/** Dictionary key for the time-of-day greeting ("Bonjour", "Bonsoir"…). */
export function greetingKey(d = new Date()): "greeting.morning" | "greeting.afternoon" | "greeting.evening" {
  const h = d.getHours();
  return h < 12 ? "greeting.morning" : h < 18 ? "greeting.afternoon" : "greeting.evening";
}

export function fmtSigned(x: number, digits = 1, unit = ""): string {
  const v = x.toFixed(digits).replace(/\.0$/, "");
  return `${x > 0 ? "+" : ""}${v}${unit}`;
}

export function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export function fullName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`;
}
