"use client";

import { useState, useTransition } from "react";
import { Copy, Send, Sparkles } from "lucide-react";
import type { Locale } from "@/domain/types";
import { MESSAGE_SITUATIONS, TONES, type MessageSituation, type Tone } from "@/domain/communication";
import { t } from "@/lib/i18n/dictionary";
import { draftMessageAction, sendMessageAction } from "@/server/actions/messages";
import { Button, cn, selectClass, textareaClass } from "./ui";

const SIT_LABEL: Record<Locale, Record<MessageSituation, string>> = {
  fr: { MISSED_WORKOUTS: "Séances manquées", CHECKIN_REMINDER: "Relance check-in", ENCOURAGEMENT: "Encouragement", CELEBRATE: "Célébrer un progrès", RE_ENGAGE: "Reprendre contact", RECOVERY_CHECK: "Point récupération", NUTRITION_CHECK: "Point nutrition", PAYMENT_REMINDER: "Rappel paiement", FOLLOWUP: "Proposer un suivi", PROGRAM_UPDATE: "Programme mis à jour" },
  en: { MISSED_WORKOUTS: "Missed workouts", CHECKIN_REMINDER: "Check-in reminder", ENCOURAGEMENT: "Encouragement", CELEBRATE: "Celebrate progress", RE_ENGAGE: "Re-engage", RECOVERY_CHECK: "Recovery check", NUTRITION_CHECK: "Nutrition check", PAYMENT_REMINDER: "Payment reminder", FOLLOWUP: "Propose follow-up", PROGRAM_UPDATE: "Program updated" },
  ar: { MISSED_WORKOUTS: "حصص فائتة", CHECKIN_REMINDER: "تذكير بالتقرير", ENCOURAGEMENT: "تشجيع", CELEBRATE: "الاحتفال بتقدم", RE_ENGAGE: "إعادة التواصل", RECOVERY_CHECK: "متابعة التعافي", NUTRITION_CHECK: "متابعة التغذية", PAYMENT_REMINDER: "تذكير بالدفع", FOLLOWUP: "اقتراح متابعة", PROGRAM_UPDATE: "تحديث البرنامج" },
};
const TONE_LABEL: Record<Locale, Record<Tone, string>> = {
  fr: { PROFESSIONAL: "Professionnel", MOTIVATING: "Motivant", FRIENDLY: "Amical", CONCISE: "Concis", DIRECT: "Direct" },
  en: { PROFESSIONAL: "Professional", MOTIVATING: "Motivating", FRIENDLY: "Friendly", CONCISE: "Concise", DIRECT: "Direct" },
  ar: { PROFESSIONAL: "مهني", MOTIVATING: "محفّز", FRIENDLY: "ودّي", CONCISE: "مختصر", DIRECT: "مباشر" },
};

export function Composer({ clientId, clientFirstName, clientLocale, locale, channel, initialSituation }: { clientId: string; clientFirstName: string; clientLocale: Locale; locale: Locale; channel: string; initialSituation?: MessageSituation }) {
  const [body, setBody] = useState("");
  const [situation, setSituation] = useState<MessageSituation>(initialSituation ?? "ENCOURAGEMENT");
  const [tone, setTone] = useState<Tone>("FRIENDLY");
  const [lang, setLang] = useState<Locale>(clientLocale);
  const [assist, setAssist] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState<"MANUAL" | "ASSISTED">("MANUAL");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const generate = () =>
    start(async () => {
      const r = await draftMessageAction({ clientId, situation, tone, locale: lang });
      setBody(r.text);
      setSource("ASSISTED");
      setNote(r.provider === "anthropic" ? t(locale, "messages.assistNote") : `${t(locale, "messages.aiOff")} · ${t(locale, "messages.assistNote")}`);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <form action={sendMessageAction} className="mt-3 rounded-lg border border-border bg-surface p-3 sm:p-3.5" onSubmit={() => setBody("")}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="channel" value="APP" />
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAssist((a) => !a)} aria-expanded={assist} className={cn("press inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 sm:h-9 text-[12px] font-semibold uppercase tracking-[0.08em]", assist ? "border-accent/50 bg-accent-soft text-accent" : "border-border-strong text-ink-2 hover:border-accent/40 hover:bg-surface-2")}>
          <Sparkles className="size-3.5" />
          {t(locale, "messages.compose")}
        </button>
        {assist ? (
          <>
            <select value={situation} onChange={(e) => setSituation(e.target.value as MessageSituation)} className={cn(selectClass, "h-11 w-auto text-[13px] sm:h-9")} aria-label={t(locale, "messages.situation")}>
              {MESSAGE_SITUATIONS.map((s) => (
                <option key={s} value={s}>
                  {SIT_LABEL[locale][s]}
                </option>
              ))}
            </select>
            <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className={cn(selectClass, "h-11 w-auto text-[13px] sm:h-9")} aria-label={t(locale, "messages.tone")}>
              {TONES.map((s) => (
                <option key={s} value={s}>
                  {TONE_LABEL[locale][s]}
                </option>
              ))}
            </select>
            <select value={lang} onChange={(e) => setLang(e.target.value as Locale)} className={cn(selectClass, "h-11 w-auto text-[13px] sm:h-9")} aria-label={t(locale, "messages.language")}>
              <option value="fr">FR</option>
              <option value="ar">AR</option>
              <option value="en">EN</option>
            </select>
            <Button type="button" size="sm" variant="outline" onClick={generate} disabled={pending} className="h-11 sm:h-9">
              <Sparkles className="size-3.5 text-accent" />
              {pending ? t(locale, "common.loading") : t(locale, "messages.generate")}
            </Button>
          </>
        ) : null}
      </div>
      <textarea
        name="body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (source === "ASSISTED") setSource("ASSISTED");
        }}
        className={textareaClass}
        placeholder={`${t(locale, "messages.placeholder")} ${clientFirstName}`}
        dir={lang === "ar" ? "rtl" : "ltr"}
        required
        rows={4}
      />
      {note ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-muted">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" />
          {note}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {channel === "WHATSAPP" || body ? (
          <Button type="button" variant="ghost" size="sm" onClick={copy} disabled={!body} className="h-11 sm:h-10">
            <Copy className="size-3.5" />
            {copied ? "✓" : t(locale, "messages.copyWhatsApp")}
          </Button>
        ) : null}
        <Button type="submit" disabled={!body.trim()} className="h-11 sm:h-10">
          <Send className="size-4 rtl:-scale-x-100" />
          {t(locale, "messages.sendAs")}
        </Button>
      </div>
    </form>
  );
}
