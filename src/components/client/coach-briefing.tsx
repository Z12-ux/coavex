"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { briefingAction } from "@/server/actions/copilot";
import { Badge, Button } from "@/components/ui";

export function CoachBriefing({ clientId, locale }: { clientId: string; locale: Locale }) {
  const [text, setText] = useState<string | null>(null);
  const [provider, setProvider] = useState<"anthropic" | "rules" | null>(null);
  const [pending, start] = useTransition();
  const label = locale === "ar" ? "ملخص المدرب" : locale === "en" ? "Coach briefing" : "Résumé coach";
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-3.5" aria-busy={pending || undefined}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border border-accent/40 bg-accent-soft text-accent">
            <Sparkles className="size-4" />
          </span>
          <h2 className="truncate text-[12.5px] font-semibold uppercase leading-5 tracking-[0.12em] text-ink-2">{label}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {provider ? <Badge tone={provider === "anthropic" ? "good" : "neutral"}>{provider === "anthropic" ? t(locale, "messages.aiOn") : t(locale, "messages.aiOff")}</Badge> : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await briefingAction(clientId);
                setText(r.text);
                setProvider(r.provider);
              })
            }
          >
            {pending ? t(locale, "common.loading") : text ? t(locale, "review.regenerate") : t(locale, "messages.generate")}
          </Button>
        </div>
      </div>
      {text ? <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-[13.5px] leading-[21px] text-ink-2">{text}</p> : <p className="mt-1.5 text-[12.5px] text-muted">{t(locale, "common.assist")}</p>}
    </section>
  );
}
