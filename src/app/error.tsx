"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Locale } from "@/domain/types";
import { isLocale, t } from "@/lib/i18n/dictionary";
import { BrandMark } from "@/components/brand";
import { Button, CtaArrow } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The boundary has no user context: follow the language the root layout rendered (French until mounted).
  const [locale, setLocale] = useState<Locale>("fr");
  useEffect(() => {
    const lang = document.documentElement.lang;
    if (isLocale(lang)) setLocale(lang);
  }, []);
  useEffect(() => {
    console.error("[coachos]", error);
  }, [error]);
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(60%_50%_at_50%_40%,black,transparent_75%)]" />
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <BrandMark size={44} />
        </div>
        <p className="t-kicker mt-8 flex items-center justify-center gap-1.5">
          <AlertTriangle className="size-3.5 text-bad" aria-hidden />
          {t(locale, "error.kicker")}
        </p>
        <h1 className="t-display mt-2 text-ink">{t(locale, "error.title")}</h1>
        <p className="mx-auto mt-3 max-w-sm text-[14px] leading-[21px] text-ink-2">{t(locale, "error.body")}</p>
        {error.digest ? (
          <p className="tnum mt-3 inline-flex rounded-full border border-border px-2.5 py-1 text-[12px] text-muted">
            {t(locale, "error.ref")} {error.digest}
          </p>
        ) : null}
        <Button variant="neon" size="lg" className="mt-7 h-14 w-full justify-between pe-3 ps-5" onClick={reset}>
          <span>{t(locale, "error.retry")}</span>
          <CtaArrow />
        </Button>
        <Link href="/" className="mt-2 inline-flex h-11 items-center px-3 text-[13px] font-medium text-muted hover:text-ink">
          {t(locale, "error.backHome")}
        </Link>
      </div>
    </main>
  );
}
