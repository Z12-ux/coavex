"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import type { Locale } from "@/domain/types";
import { t } from "@/lib/i18n/dictionary";
import { checkInNarrativeAction } from "@/server/actions/copilot";
import { Button } from "@/components/ui";

export function CheckInNarrative({ checkInId, locale }: { checkInId: string; locale: Locale }) {
  const [text, setText] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3">
      {text ? (
        <p className="whitespace-pre-wrap rounded-md border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-5 text-ink-2">{text}</p>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => setText((await checkInNarrativeAction(checkInId)).text))}>
          <Sparkles className="size-3.5 text-accent" />
          {pending ? t(locale, "common.loading") : t(locale, "messages.generate")}
        </Button>
      )}
    </div>
  );
}
