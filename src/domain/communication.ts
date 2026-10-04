/**
 * COMMUNICATION COMPOSER (rule-based)
 *
 * Prepares personalised messages from structured facts, in the client's
 * language and the coach's chosen tone. Nothing is ever sent automatically:
 * the coach reviews, edits and sends. When an LLM provider is configured the
 * AI layer (src/server/ai) uses these drafts as the fallback.
 */

import type { Locale } from "./types";

export type MessageSituation =
  | "MISSED_WORKOUTS"
  | "CHECKIN_REMINDER"
  | "ENCOURAGEMENT"
  | "CELEBRATE"
  | "RE_ENGAGE"
  | "RECOVERY_CHECK"
  | "NUTRITION_CHECK"
  | "PAYMENT_REMINDER"
  | "FOLLOWUP"
  | "PROGRAM_UPDATE";

export const MESSAGE_SITUATIONS: MessageSituation[] = ["MISSED_WORKOUTS", "CHECKIN_REMINDER", "ENCOURAGEMENT", "CELEBRATE", "RE_ENGAGE", "RECOVERY_CHECK", "NUTRITION_CHECK", "PAYMENT_REMINDER", "FOLLOWUP", "PROGRAM_UPDATE"];

export type Tone = "PROFESSIONAL" | "MOTIVATING" | "FRIENDLY" | "CONCISE" | "DIRECT";
export const TONES: Tone[] = ["PROFESSIONAL", "MOTIVATING", "FRIENDLY", "CONCISE", "DIRECT"];

export interface ComposeInput {
  situation: MessageSituation;
  tone: Tone;
  locale: Locale;
  clientFirstName: string;
  coachName: string;
  facts?: {
    missedCount?: number;
    milestone?: string;
    daysInactive?: number;
    amount?: number;
    dueDate?: string;
    exercise?: string;
    nextSessionDay?: string;
  };
}

type Pack = {
  opener: Record<Tone, (name: string) => string>;
  closer: Record<Tone, (coach: string) => string>;
  body: Record<MessageSituation, (f: NonNullable<ComposeInput["facts"]>, tone: Tone) => string>;
};

const fr: Pack = {
  opener: {
    PROFESSIONAL: (n) => `Bonjour ${n},`,
    MOTIVATING: (n) => `Salut ${n} !`,
    FRIENDLY: (n) => `Salut ${n} 👋`,
    CONCISE: (n) => `${n},`,
    DIRECT: (n) => `${n},`,
  },
  closer: {
    PROFESSIONAL: (c) => `Bien à vous,\n${c}`,
    MOTIVATING: (c) => `On avance ensemble 💪\n${c}`,
    FRIENDLY: (c) => `À très vite,\n${c}`,
    CONCISE: () => ``,
    DIRECT: (c) => `${c}`,
  },
  body: {
    MISSED_WORKOUTS: (f, t) =>
      t === "DIRECT" || t === "CONCISE"
        ? `${f.missedCount ?? 2} séances manquées cette semaine. Qu'est-ce qui a bloqué ? Dis-moi et on adapte le plan.`
        : `J'ai vu que ${f.missedCount ?? 2} séances n'ont pas pu être faites cette semaine. Pas de jugement : ce qui m'intéresse, c'est ce qui a bloqué (temps, énergie, planning ?). Dis-moi en une phrase et on adapte le programme à ta semaine réelle.`,
    CHECKIN_REMINDER: (_f, t) =>
      t === "CONCISE" || t === "DIRECT" ? `Ton check-in de la semaine n'est pas encore envoyé. 2 minutes dans l'app et je peux ajuster ton plan.` : `Je n'ai pas encore reçu ton check-in de la semaine. Il prend 2 minutes dans l'app et c'est ce qui me permet d'ajuster ton programme correctement. Tu peux le faire quand tu as un moment ?`,
    ENCOURAGEMENT: (_f, t) =>
      t === "CONCISE" ? `Tu tiens le cap. Continue, ça paie.` : `Je voulais juste te dire que je vois les efforts que tu fais, même les semaines où ce n'est pas parfait. C'est la régularité qui compte, et tu l'as. Continue comme ça.`,
    CELEBRATE: (f) => `${f.milestone ? `${f.milestone} !` : "Nouveau jalon atteint !"} Je tenais à le souligner : c'est le résultat direct de ton travail des dernières semaines. Prochaine étape quand tu es prêt(e).`,
    RE_ENGAGE: (f, t) =>
      t === "DIRECT" ? `Aucune nouvelle depuis ${f.daysInactive ?? 7} jours. Tout va bien ? Dis-moi où tu en es.` : `Ça fait ${f.daysInactive ?? 7} jours qu'on n'a pas échangé et je voulais prendre de tes nouvelles. Pas besoin de rapport complet : dis-moi juste comment tu vas et si quelque chose a changé de ton côté. On repart de là.`,
    RECOVERY_CHECK: () => `D'après tes derniers journaux, le sommeil et l'énergie sont plus bas que d'habitude. Avant d'augmenter quoi que ce soit, je préfère qu'on regarde ça ensemble. Comment se passent tes nuits en ce moment ?`,
    NUTRITION_CHECK: () => `Côté nutrition, l'adhésion semble plus difficile ces derniers jours. Qu'est-ce qui coince le plus : le temps de préparation, les quantités, les envies ? On simplifie le plan si besoin.`,
    PAYMENT_REMINDER: (f) => `Petit rappel : le règlement de ${f.amount?.toLocaleString("fr-DZ") ?? "…"} DA${f.dueDate ? ` prévu le ${f.dueDate}` : ""} est en attente. Dis-moi si tu as besoin d'un arrangement.`,
    FOLLOWUP: (f) => `Je te propose un point rapide${f.nextSessionDay ? ` ${f.nextSessionDay}` : " cette semaine"} pour faire le bilan et préparer la suite. Ça te va ?`,
    PROGRAM_UPDATE: (f) => `Ton programme a été mis à jour${f.exercise ? ` (notamment ${f.exercise})` : ""}. Ouvre l'app pour voir les changements avant ta prochaine séance et dis-moi si quelque chose n'est pas clair.`,
  },
};

const en: Pack = {
  opener: {
    PROFESSIONAL: (n) => `Hello ${n},`,
    MOTIVATING: (n) => `Hey ${n}!`,
    FRIENDLY: (n) => `Hi ${n} 👋`,
    CONCISE: (n) => `${n},`,
    DIRECT: (n) => `${n},`,
  },
  closer: {
    PROFESSIONAL: (c) => `Best regards,\n${c}`,
    MOTIVATING: (c) => `We move forward together 💪\n${c}`,
    FRIENDLY: (c) => `Talk soon,\n${c}`,
    CONCISE: () => ``,
    DIRECT: (c) => `${c}`,
  },
  body: {
    MISSED_WORKOUTS: (f, t) =>
      t === "DIRECT" || t === "CONCISE"
        ? `${f.missedCount ?? 2} sessions missed this week. What got in the way? Tell me and we adapt the plan.`
        : `I noticed ${f.missedCount ?? 2} sessions couldn't happen this week. No judgement: what I care about is what got in the way (time, energy, schedule?). One sentence is enough and we fit the program to your real week.`,
    CHECKIN_REMINDER: (_f, t) =>
      t === "CONCISE" || t === "DIRECT" ? `Your weekly check-in isn't in yet. 2 minutes in the app and I can adjust your plan.` : `I haven't received your check-in for the week yet. It takes 2 minutes in the app and it's what lets me adjust your program properly. Can you do it when you have a moment?`,
    ENCOURAGEMENT: (_f, t) => (t === "CONCISE" ? `You're holding the line. Keep going, it pays.` : `Just wanted to say I see the effort you put in, even in the weeks that aren't perfect. Consistency is what counts, and you have it. Keep going.`),
    CELEBRATE: (f) => `${f.milestone ? `${f.milestone}!` : "New milestone reached!"} I wanted to point it out: it's the direct result of your work over the last weeks. Next step whenever you're ready.`,
    RE_ENGAGE: (f, t) =>
      t === "DIRECT" ? `No news for ${f.daysInactive ?? 7} days. All good? Tell me where you're at.` : `It's been ${f.daysInactive ?? 7} days since we last talked and I wanted to check in. No full report needed: just tell me how you're doing and whether anything changed on your side. We restart from there.`,
    RECOVERY_CHECK: () => `Your recent logs show lower sleep and energy than usual. Before increasing anything I'd rather we look at it together. How are your nights at the moment?`,
    NUTRITION_CHECK: () => `Nutrition adherence looks harder these last days. What's the biggest blocker: prep time, portions, cravings? We simplify the plan if needed.`,
    PAYMENT_REMINDER: (f) => `Quick reminder: the payment of ${f.amount?.toLocaleString("en") ?? "…"} DA${f.dueDate ? ` due on ${f.dueDate}` : ""} is pending. Let me know if you need an arrangement.`,
    FOLLOWUP: (f) => `Let's have a quick call${f.nextSessionDay ? ` on ${f.nextSessionDay}` : " this week"} to review and plan what's next. Does that work?`,
    PROGRAM_UPDATE: (f) => `Your program has been updated${f.exercise ? ` (notably ${f.exercise})` : ""}. Open the app to see the changes before your next session and tell me if anything is unclear.`,
  },
};

const ar: Pack = {
  opener: {
    PROFESSIONAL: (n) => `مرحبًا ${n}،`,
    MOTIVATING: (n) => `أهلًا ${n}!`,
    FRIENDLY: (n) => `سلام ${n} 👋`,
    CONCISE: (n) => `${n}،`,
    DIRECT: (n) => `${n}،`,
  },
  closer: {
    PROFESSIONAL: (c) => `مع تحياتي،\n${c}`,
    MOTIVATING: (c) => `نتقدم معًا 💪\n${c}`,
    FRIENDLY: (c) => `إلى اللقاء قريبًا،\n${c}`,
    CONCISE: () => ``,
    DIRECT: (c) => `${c}`,
  },
  body: {
    MISSED_WORKOUTS: (f, t) =>
      t === "DIRECT" || t === "CONCISE"
        ? `${f.missedCount ?? 2} حصص فاتت هذا الأسبوع. ما الذي عرقلك؟ أخبرني ونكيّف الخطة.`
        : `لاحظت أن ${f.missedCount ?? 2} حصص لم تتم هذا الأسبوع. بدون حكم: ما يهمني هو ما الذي عرقلك (الوقت، الطاقة، الجدول؟). جملة واحدة تكفي ونكيّف البرنامج مع أسبوعك الحقيقي.`,
    CHECKIN_REMINDER: (_f, t) =>
      t === "CONCISE" || t === "DIRECT" ? `تقريرك الأسبوعي لم يُرسَل بعد. دقيقتان في التطبيق وأستطيع تعديل خطتك.` : `لم أستلم تقريرك الأسبوعي بعد. يستغرق دقيقتين في التطبيق وهو ما يسمح لي بتعديل برنامجك بشكل صحيح. هل يمكنك إرساله عندما يتاح لك الوقت؟`,
    ENCOURAGEMENT: (_f, t) => (t === "CONCISE" ? `أنت ثابت على المسار. واصل، النتيجة قادمة.` : `أردت فقط أن أقول إنني أرى الجهد الذي تبذله، حتى في الأسابيع غير المثالية. الانتظام هو ما يهم، وأنت تملكه. واصل هكذا.`),
    CELEBRATE: (f) => `${f.milestone ? `${f.milestone}!` : "محطة جديدة!"} أردت الإشارة إليها: إنها النتيجة المباشرة لعملك في الأسابيع الماضية. الخطوة التالية عندما تكون جاهزًا.`,
    RE_ENGAGE: (f, t) =>
      t === "DIRECT" ? `لا أخبار منذ ${f.daysInactive ?? 7} أيام. كل شيء بخير؟ أخبرني أين وصلت.` : `مرّت ${f.daysInactive ?? 7} أيام منذ آخر تواصل بيننا وأردت الاطمئنان عليك. لا حاجة لتقرير كامل: فقط أخبرني كيف حالك وإن كان شيء قد تغيّر عندك. ننطلق من هناك.`,
    RECOVERY_CHECK: () => `حسب سجلاتك الأخيرة، النوم والطاقة أقل من المعتاد. قبل زيادة أي شيء أفضّل أن ننظر في الأمر معًا. كيف تسير لياليك هذه الفترة؟`,
    NUTRITION_CHECK: () => `من ناحية التغذية، يبدو الالتزام أصعب في الأيام الأخيرة. ما الذي يعيقك أكثر: وقت التحضير، الكميات، الرغبات؟ نبسّط الخطة إن لزم.`,
    PAYMENT_REMINDER: (f) => `تذكير بسيط: دفعة ${f.amount?.toLocaleString("ar-DZ") ?? "…"} دج${f.dueDate ? ` المقررة يوم ${f.dueDate}` : ""} ما زالت معلّقة. أخبرني إن احتجت ترتيبًا.`,
    FOLLOWUP: (f) => `أقترح جلسة قصيرة${f.nextSessionDay ? ` يوم ${f.nextSessionDay}` : " هذا الأسبوع"} للمراجعة والتحضير للمرحلة القادمة. هل يناسبك؟`,
    PROGRAM_UPDATE: (f) => `تم تحديث برنامجك${f.exercise ? ` (خاصة ${f.exercise})` : ""}. افتح التطبيق لترى التغييرات قبل حصتك القادمة وأخبرني إن كان شيء غير واضح.`,
  },
};

const PACKS: Record<Locale, Pack> = { fr, en, ar };

export function composeMessage(input: ComposeInput): string {
  const pack = PACKS[input.locale] ?? fr;
  const facts = input.facts ?? {};
  const parts = [pack.opener[input.tone](input.clientFirstName), pack.body[input.situation](facts, input.tone), pack.closer[input.tone](input.coachName)].filter((p) => p.trim().length);
  return parts.join("\n\n");
}
