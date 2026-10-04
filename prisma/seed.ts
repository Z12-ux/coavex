/**
 * Realistic demo data: one coaching studio, 15 clients in distinct situations
 * (progressing, plateau, inconsistent, highly adherent, newly onboarded,
 * stalled onboarding, low engagement, improving performance, stagnant load,
 * overdue payment, trial ending, paused, high stress, churned, pending
 * check-in). Deterministic thanks to a seeded PRNG; dates are relative to now.
 *
 * Logins:  coach@coachos.demo / coach1234   (OWNER)
 *          assistant@coachos.demo / coach1234 (ASSISTANT)
 *          <firstname>@coachos.demo / client1234 (CLIENT)
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { prng } from "../src/domain/fixtures";
import { addDays, e1rm, isoDate, startOfDay, startOfWeek } from "../src/domain/stats";
import { recomputeOrganization } from "../src/server/intelligence";
import { summarizeCheckIn } from "../src/domain/checkin";
import type { FrictionCategory } from "../src/domain/types";
import { figureSvg, resetDemoPhotoDir, writeDemoPhoto, type DemoPose } from "./demo-photos";

const db = new PrismaClient();
const NOW = new Date();
const TODAY = startOfDay(NOW);
const rnd = prng(2026);

type Scenario = {
  first: string;
  last: string;
  sex: "M" | "F";
  status: "ONBOARDING" | "ACTIVE" | "PAUSED" | "TRIAL" | "CHURNED";
  onboardedDaysAgo: number;
  locale: "fr" | "ar" | "en";
  goal: { type: string; title: string; start: number; target: number };
  template: "FB3" | "UL4" | "PPL3";
  perWeek: number;
  checkInWeekday: number;
  /** completion probability per week, oldest first (8 weeks) */
  completion: number[];
  missedReason?: FrictionCategory | ((i: number) => FrictionCategory);
  weight: { perWeek: number; noise?: number; plateauFromDays?: number };
  sleep: (dayAgo: number) => number;
  energy?: (dayAgo: number) => number;
  stress?: (dayAgo: number) => number;
  recovery?: (dayAgo: number) => number;
  nutrition?: (dayAgo: number) => number;
  logSkip?: number;
  loads: { increment: number; stagnantFromWeek?: number };
  habits: { name: string; kind: string; target: number; unit: string; days: number; adherence: number }[];
  checkIns: { weeksAgo: number; late?: boolean; submitted: boolean; reviewed: boolean; nutrition?: number; wins?: string; struggles?: string; tags?: FrictionCategory[] }[];
  lastActiveDaysAgo: number;
  messages: { daysAgo: number; from: "coach" | "client"; body: string }[];
  subscription?: { pkg: string; amount: number; cycle: string; startDaysAgo: number; endInDays: number; status: string; overdueDays?: number };
  notes: { category: string; content: string; pinned?: boolean }[];
  milestones?: { daysAgo: number; kind: string; title: string; highlighted?: boolean }[];
  noProgram?: boolean;
  login?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    first: "Ahmed", last: "Benali", sex: "M", status: "ACTIVE", onboardedDaysAgo: 84, locale: "fr",
    goal: { type: "FAT_LOSS", title: "Perdre 8 kg avant le mariage de mon frère", start: 94, target: 86 },
    template: "UL4", perWeek: 4, checkInWeekday: (TODAY.getDay() + 3) % 7,
    completion: [1, 1, 0.9, 0.85, 0.75, 0.6, 0.5, 0.25], missedReason: (i) => (i % 2 ? "TIME" : "RECOVERY"),
    weight: { perWeek: -0.5, plateauFromDays: 20 },
    sleep: (d) => (d >= 7 ? 7.4 : 5.9), energy: (d) => (d >= 7 ? 4 : 2), recovery: (d) => (d >= 7 ? 4 : 2),
    loads: { increment: 2.5 },
    habits: [{ name: "10 000 pas", kind: "STEPS", target: 10000, unit: "pas", days: 7, adherence: 0.4 }, { name: "2,5 L d'eau", kind: "WATER", target: 2.5, unit: "L", days: 7, adherence: 0.6 }],
    checkIns: [{ weeksAgo: 3, submitted: true, reviewed: true, nutrition: 4, wins: "4 séances faites" }, { weeksAgo: 2, submitted: true, reviewed: true, nutrition: 3, struggles: "Semaine chargée au travail", tags: ["TIME"] }],
    lastActiveDaysAgo: 2,
    messages: [{ daysAgo: 9, from: "coach", body: "Bravo pour la semaine dernière, on garde le cap." }, { daysAgo: 8, from: "client", body: "Merci coach ! Semaine compliquée qui arrive, je fais au mieux." }],
    subscription: { pkg: "Coaching Premium 3 mois", amount: 18000, cycle: "MONTHLY", startDaysAgo: 84, endInDays: 6, status: "ACTIVE" },
    notes: [{ category: "INJURY", content: "Gêne épaule droite sur le développé militaire : préférer les haltères, éviter la barre au-dessus de la tête.", pinned: true }, { category: "IMPORTANT_DATE", content: "Mariage du frère le 15 novembre : objectif visuel prioritaire.", pinned: true }, { category: "PREFERENCE", content: "Déteste le tapis de course. Aime le vélo." }],
    milestones: [{ daysAgo: 40, kind: "CONSISTENCY", title: "4 semaines à 100 %", highlighted: true }, { daysAgo: 35, kind: "BODY", title: "−4 kg depuis le début" }],
    login: true,
  },
  {
    first: "Sara", last: "Meziane", sex: "F", status: "ACTIVE", onboardedDaysAgo: 120, locale: "fr",
    goal: { type: "STRENGTH", title: "Squat 100 kg", start: 62, target: 62 },
    template: "PPL3", perWeek: 3, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [1, 1, 1, 1, 1, 1, 1, 1],
    weight: { perWeek: 0.05, noise: 0.3 }, sleep: () => 7.6, loads: { increment: 2.5 },
    habits: [{ name: "Mobilité 10 min", kind: "MOBILITY", target: 10, unit: "min", days: 5, adherence: 0.9 }, { name: "Protéines 120 g", kind: "PROTEIN", target: 120, unit: "g", days: 7, adherence: 0.85 }],
    checkIns: [{ weeksAgo: 3, submitted: true, reviewed: true, nutrition: 4 }, { weeksAgo: 2, submitted: true, reviewed: true, nutrition: 5, wins: "Squat 95 kg x3 !" }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 4, wins: "Toutes les séances faites" }],
    lastActiveDaysAgo: 0,
    messages: [{ daysAgo: 4, from: "client", body: "95 kg passés proprement, on tente 100 la semaine prochaine ?" }, { daysAgo: 4, from: "coach", body: "Oui. On garde 2 reps en réserve sur la première série, puis on voit." }],
    subscription: { pkg: "Coaching Force 6 mois", amount: 15000, cycle: "MONTHLY", startDaysAgo: 120, endInDays: 60, status: "ACTIVE" },
    notes: [{ category: "PREFERENCE", content: "Très autonome, aime les explications techniques détaillées.", pinned: true }],
    milestones: [{ daysAgo: 3, kind: "PR", title: "Squat 95 kg × 3", highlighted: true }, { daysAgo: 30, kind: "PR", title: "Soulevé de terre 110 kg" }, { daysAgo: 60, kind: "CONSISTENCY", title: "8 semaines sans séance manquée", highlighted: true }],
    login: true,
  },
  {
    first: "Karim", last: "Haddad", sex: "M", status: "ACTIVE", onboardedDaysAgo: 70, locale: "fr",
    goal: { type: "FAT_LOSS", title: "Passer sous les 90 kg", start: 97, target: 89 },
    template: "FB3", perWeek: 3, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [1, 1, 0.9, 1, 1, 0.9, 1, 1],
    weight: { perWeek: -0.4, plateauFromDays: 24 }, sleep: () => 7, nutrition: () => 2, loads: { increment: 2.5 },
    habits: [{ name: "Légumes à chaque repas", kind: "CUSTOM", target: 1, unit: "x", days: 7, adherence: 0.5 }],
    checkIns: [{ weeksAgo: 2, submitted: true, reviewed: true, nutrition: 2, struggles: "Trop de repas à l'extérieur", tags: ["NUTRITION"] }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 2, struggles: "Grignotage le soir", tags: ["NUTRITION"] }],
    lastActiveDaysAgo: 1,
    messages: [{ daysAgo: 6, from: "coach", body: "Le poids stagne mais les séances sont nickel. On regarde l'assiette cette semaine." }],
    subscription: { pkg: "Coaching Premium 3 mois", amount: 18000, cycle: "MONTHLY", startDaysAgo: 70, endInDays: 20, status: "ACTIVE" },
    notes: [{ category: "CONSTRAINT", content: "Déjeune au restaurant 4 jours sur 5 (commercial).", pinned: true }],
    login: true,
  },
  {
    first: "Lina", last: "Boudiaf", sex: "F", status: "ACTIVE", onboardedDaysAgo: 60, locale: "ar",
    goal: { type: "HEALTH", title: "Retrouver de l'énergie et bouger 3 fois par semaine", start: 68, target: 66 },
    template: "FB3", perWeek: 3, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [0.7, 0.6, 0.5, 0.6, 0.4, 0.5, 0.4, 0.5], missedReason: (i) => (i % 3 === 0 ? "SCHEDULE" : "TIME"),
    weight: { perWeek: -0.1, noise: 0.3 }, sleep: () => 6.8, logSkip: 0.4, loads: { increment: 1.25 },
    habits: [{ name: "Marche 20 min", kind: "STEPS", target: 20, unit: "min", days: 5, adherence: 0.55 }],
    checkIns: [{ weeksAgo: 2, submitted: true, reviewed: true, nutrition: 3, struggles: "Les enfants malades, pas eu le temps", tags: ["TIME", "SCHEDULE"] }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 3, tags: ["TIME"] }],
    lastActiveDaysAgo: 3,
    messages: [{ daysAgo: 5, from: "client", body: "Je n'arrive pas à caser les séances de 60 min le soir." }, { daysAgo: 5, from: "coach", body: "On passe à 3 séances de 35 min, je te prépare ça." }],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 60, endInDays: 30, status: "ACTIVE" },
    notes: [{ category: "CONSTRAINT", content: "Deux enfants en bas âge ; seul créneau fiable : 6h30–7h15 le matin.", pinned: true }, { category: "EQUIPMENT", content: "Entraînement à la maison : haltères 2×10 kg + élastiques.", pinned: true }],
    login: true,
  },
  {
    first: "Yacine", last: "Cherif", sex: "M", status: "ONBOARDING", onboardedDaysAgo: 3, locale: "fr",
    goal: { type: "MUSCLE_GAIN", title: "Prendre 5 kg de muscle", start: 66, target: 71 },
    template: "FB3", perWeek: 3, checkInWeekday: 0, completion: [], weight: { perWeek: 0 }, sleep: () => 7, loads: { increment: 2.5 }, habits: [], checkIns: [], lastActiveDaysAgo: 1, messages: [{ daysAgo: 2, from: "coach", body: "Bienvenue Yacine ! Je prépare ton évaluation et ton premier programme." }],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 3, endInDays: 27, status: "ACTIVE" },
    notes: [], noProgram: true,
  },
  {
    first: "Nadia", last: "Rahmani", sex: "F", status: "ONBOARDING", onboardedDaysAgo: 11, locale: "fr",
    goal: { type: "FAT_LOSS", title: "Perdre 6 kg", start: 74, target: 68 },
    template: "FB3", perWeek: 3, checkInWeekday: 0, completion: [], weight: { perWeek: 0 }, sleep: () => 7, loads: { increment: 2.5 }, habits: [], checkIns: [], lastActiveDaysAgo: 8, messages: [],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 11, endInDays: 19, status: "ACTIVE" },
    notes: [{ category: "GENERAL", content: "Inscrite via Instagram, attend le programme." }], noProgram: true,
  },
  {
    first: "Mehdi", last: "Saidi", sex: "M", status: "ACTIVE", onboardedDaysAgo: 100, locale: "fr",
    goal: { type: "FAT_LOSS", title: "Perdre 10 kg", start: 102, target: 92 },
    template: "UL4", perWeek: 4, checkInWeekday: (TODAY.getDay() + 5) % 7,
    completion: [0.9, 0.9, 0.8, 0.7, 0.5, 0.4, 0.2, 0], weight: { perWeek: -0.2, noise: 0.5 }, sleep: () => 6.5, logSkip: 0.85, loads: { increment: 2.5 },
    habits: [{ name: "8 000 pas", kind: "STEPS", target: 8000, unit: "pas", days: 7, adherence: 0.2 }],
    checkIns: [{ weeksAgo: 4, submitted: true, reviewed: true, nutrition: 3 }, { weeksAgo: 3, submitted: true, reviewed: true, nutrition: 2, struggles: "Motivation en baisse", tags: ["MOTIVATION"] }],
    lastActiveDaysAgo: 12,
    messages: [{ daysAgo: 10, from: "coach", body: "Mehdi, je n'ai pas eu ton check-in. Tout va bien ?" }, { daysAgo: 3, from: "client", body: "Désolé coach, je suis un peu perdu en ce moment. Je ne sais pas si je continue." }],
    subscription: { pkg: "Coaching Premium 3 mois", amount: 18000, cycle: "MONTHLY", startDaysAgo: 100, endInDays: 15, status: "ACTIVE" },
    notes: [{ category: "COMMUNICATION", content: "Préfère WhatsApp vocal, répond rarement à l'écrit.", pinned: true }],
  },
  {
    first: "Amina", last: "Kaci", sex: "F", status: "ACTIVE", onboardedDaysAgo: 90, locale: "en",
    goal: { type: "RECOMP", title: "Recomposition: stronger at the same weight", start: 58, target: 58 },
    template: "UL4", perWeek: 4, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [0.9, 1, 1, 0.9, 1, 1, 1, 1], weight: { perWeek: 0, noise: 0.3 }, sleep: () => 7.5, loads: { increment: 2.5 },
    habits: [{ name: "Sleep before 23:00", kind: "SLEEP", target: 1, unit: "x", days: 7, adherence: 0.8 }],
    checkIns: [{ weeksAgo: 2, submitted: true, reviewed: true, nutrition: 4, wins: "Hip thrust 90 kg" }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 4, wins: "Bench 50 kg x5" }],
    lastActiveDaysAgo: 0,
    messages: [{ daysAgo: 2, from: "client", body: "Bench felt strong today, 50 kg for 5!" }, { daysAgo: 2, from: "coach", body: "That's a PR. Log it, we'll bump the target next week." }],
    subscription: { pkg: "Online Coaching", amount: 12000, cycle: "MONTHLY", startDaysAgo: 90, endInDays: 30, status: "ACTIVE" },
    notes: [{ category: "PREFERENCE", content: "Trains at 6am, wants sessions under 50 minutes.", pinned: true }],
    milestones: [{ daysAgo: 2, kind: "PR", title: "Bench press 50 kg × 5", highlighted: true }],
  },
  {
    first: "Rachid", last: "Belkacem", sex: "M", status: "ACTIVE", onboardedDaysAgo: 75, locale: "fr",
    goal: { type: "STRENGTH", title: "Soulevé de terre 150 kg", start: 84, target: 84 },
    template: "PPL3", perWeek: 3, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [1, 1, 0.9, 1, 1, 1, 0.9, 1], weight: { perWeek: 0.05, noise: 0.3 }, sleep: () => 7.2, loads: { increment: 2.5, stagnantFromWeek: 4 },
    habits: [{ name: "Créatine 5 g", kind: "CUSTOM", target: 5, unit: "g", days: 7, adherence: 0.9 }],
    checkIns: [{ weeksAgo: 2, submitted: true, reviewed: true, nutrition: 4 }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 4, struggles: "J'ai l'impression de stagner" }],
    lastActiveDaysAgo: 1,
    messages: [{ daysAgo: 3, from: "client", body: "Je reste à 120 sur le deadlift depuis un mois, normal ?" }, { daysAgo: 3, from: "coach", body: "Non, on doit appliquer la progression. Je regarde ton programme." }],
    subscription: { pkg: "Coaching Force 6 mois", amount: 15000, cycle: "MONTHLY", startDaysAgo: 75, endInDays: 105, status: "ACTIVE" },
    notes: [{ category: "PREFERENCE", content: "Veut absolument garder le soulevé de terre conventionnel.", pinned: true }],
  },
  {
    first: "Imene", last: "Ziani", sex: "F", status: "ACTIVE", onboardedDaysAgo: 130, locale: "fr",
    goal: { type: "FAT_LOSS", title: "Perdre 5 kg", start: 71, target: 66 },
    template: "FB3", perWeek: 3, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [0.9, 1, 0.9, 0.9, 1, 0.9, 1, 0.9], weight: { perWeek: -0.3, noise: 0.3 }, sleep: () => 7.3, loads: { increment: 1.25 },
    habits: [{ name: "2 L d'eau", kind: "WATER", target: 2, unit: "L", days: 7, adherence: 0.8 }],
    checkIns: [{ weeksAgo: 2, submitted: true, reviewed: true, nutrition: 4 }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 4, wins: "−0,6 kg" }],
    lastActiveDaysAgo: 1, messages: [],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 130, endInDays: 20, status: "PAST_DUE", overdueDays: 12 },
    notes: [{ category: "COMMUNICATION", content: "Paye habituellement en espèces à la salle.", pinned: false }],
    milestones: [{ daysAgo: 12, kind: "BODY", title: "−3 kg", highlighted: true }],
  },
  {
    first: "Sofiane", last: "Merabet", sex: "M", status: "TRIAL", onboardedDaysAgo: 9, locale: "fr",
    goal: { type: "MUSCLE_GAIN", title: "Prendre du muscle proprement", start: 70, target: 75 },
    template: "FB3", perWeek: 3, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [1, 1], weight: { perWeek: 0.2, noise: 0.2 }, sleep: () => 7.4, loads: { increment: 2.5 },
    habits: [{ name: "Petit-déjeuner protéiné", kind: "PROTEIN", target: 30, unit: "g", days: 7, adherence: 0.85 }],
    checkIns: [{ weeksAgo: 1, submitted: true, reviewed: true, nutrition: 4, wins: "J'adore le programme" }],
    lastActiveDaysAgo: 0, messages: [{ daysAgo: 1, from: "client", body: "Est-ce que je peux continuer après l'essai ?" }, { daysAgo: 1, from: "coach", body: "Bien sûr, je t'envoie les formules ce soir." }],
    subscription: { pkg: "Essai 14 jours", amount: 0, cycle: "ONE_OFF", startDaysAgo: 9, endInDays: 5, status: "ACTIVE" },
    notes: [],
  },
  {
    first: "Hanane", last: "Tlemcani", sex: "F", status: "PAUSED", onboardedDaysAgo: 150, locale: "fr",
    goal: { type: "HEALTH", title: "Reprise après entorse", start: 63, target: 63 },
    template: "FB3", perWeek: 3, checkInWeekday: 0, completion: [1, 1, 1, 0.9, 0, 0, 0, 0], weight: { perWeek: 0, noise: 0.3 }, sleep: () => 7, logSkip: 0.9, loads: { increment: 1.25 }, habits: [], checkIns: [], lastActiveDaysAgo: 20, messages: [{ daysAgo: 25, from: "client", body: "Entorse cheville, le médecin dit 4 semaines de repos." }, { daysAgo: 25, from: "coach", body: "On met en pause, reprise en douceur dès que le médecin valide." }],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 150, endInDays: 45, status: "ACTIVE" },
    notes: [{ category: "INJURY", content: "Entorse cheville gauche (septembre) : pas de sauts ni de fentes avant validation médicale.", pinned: true }],
  },
  {
    first: "Bilal", last: "Ouali", sex: "M", status: "ACTIVE", onboardedDaysAgo: 50, locale: "ar",
    goal: { type: "FAT_LOSS", title: "خسارة 7 كغ", start: 98, target: 91 },
    template: "UL4", perWeek: 4, checkInWeekday: (TODAY.getDay() + 6) % 7,
    completion: [0.9, 0.9, 0.8, 0.7, 0.7, 0.6, 0.5, 0.5], missedReason: () => "DIFFICULTY",
    weight: { perWeek: -0.3, noise: 0.4 }, sleep: () => 6.6, stress: () => 4, energy: () => 2, recovery: () => 2, loads: { increment: 2.5 },
    habits: [{ name: "المشي 30 دقيقة", kind: "STEPS", target: 30, unit: "min", days: 5, adherence: 0.6 }],
    checkIns: [{ weeksAgo: 2, submitted: true, reviewed: true, nutrition: 3, struggles: "التمارين صعبة جدا والركبة تؤلمني", tags: ["DIFFICULTY", "RECOVERY"] }, { weeksAgo: 1, submitted: true, reviewed: true, nutrition: 3, struggles: "ضغط العمل", tags: ["WORKLOAD"] }],
    lastActiveDaysAgo: 1, messages: [{ daysAgo: 4, from: "client", body: "السكوات صعب علي، هل يوجد بديل؟" }, { daysAgo: 4, from: "coach", body: "نعم، نبدل بالـ leg press هذا الأسبوع." }],
    subscription: { pkg: "Coaching Premium 3 mois", amount: 18000, cycle: "MONTHLY", startDaysAgo: 50, endInDays: 40, status: "ACTIVE" },
    notes: [{ category: "INJURY", content: "Douleur genou droit en flexion profonde : squat partiel ou leg press.", pinned: true }],
  },
  {
    first: "Khadidja", last: "Amrani", sex: "F", status: "CHURNED", onboardedDaysAgo: 200, locale: "fr",
    goal: { type: "FAT_LOSS", title: "Perdre 5 kg", start: 70, target: 65 },
    template: "FB3", perWeek: 3, checkInWeekday: 0, completion: [], weight: { perWeek: 0 }, sleep: () => 7, loads: { increment: 1.25 }, habits: [], checkIns: [], lastActiveDaysAgo: 65, messages: [],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 200, endInDays: -60, status: "CANCELLED" },
    notes: [{ category: "GENERAL", content: "A arrêté après 4 mois : déménagement à Oran." }], noProgram: true,
  },
  {
    first: "Walid", last: "Bensalem", sex: "M", status: "ACTIVE", onboardedDaysAgo: 45, locale: "fr",
    goal: { type: "MUSCLE_GAIN", title: "Prendre 4 kg", start: 64, target: 68 },
    template: "PPL3", perWeek: 3, checkInWeekday: TODAY.getDay(),
    completion: [0.9, 1, 0.9, 1, 1, 0.9, 1, 1], weight: { perWeek: 0.25, noise: 0.3 }, sleep: () => 7.1, loads: { increment: 2.5 },
    habits: [{ name: "3 repas + collation", kind: "CUSTOM", target: 4, unit: "x", days: 7, adherence: 0.4 }, { name: "Sommeil 8 h", kind: "SLEEP", target: 8, unit: "h", days: 7, adherence: 0.4 }],
    checkIns: [{ weeksAgo: 1, submitted: true, reviewed: true, nutrition: 3 }, { weeksAgo: 0, submitted: true, reviewed: false, nutrition: 3, wins: "Tractions : 8 reps", struggles: "Je n'arrive pas à manger assez", tags: ["NUTRITION"] }],
    lastActiveDaysAgo: 0, messages: [],
    subscription: { pkg: "Coaching Essentiel", amount: 9000, cycle: "MONTHLY", startDaysAgo: 45, endInDays: 15, status: "ACTIVE" },
    notes: [{ category: "PREFERENCE", content: "Étudiant, budget alimentaire serré : privilégier œufs, sardines, légumineuses.", pinned: true }],
    milestones: [{ daysAgo: 5, kind: "PR", title: "8 tractions strictes" }],
    login: true,
  },
];

// ───────────────────────────── exercise library ─────────────────────────────

const EXERCISES = [
  { key: "squat", name: "Squat barre", muscleGroup: "LEGS", pattern: "SQUAT", equipment: "BARBELL", isMainLift: true },
  { key: "deadlift", name: "Soulevé de terre", muscleGroup: "BACK", pattern: "HINGE", equipment: "BARBELL", isMainLift: true },
  { key: "bench", name: "Développé couché", muscleGroup: "CHEST", pattern: "PUSH_H", equipment: "BARBELL", isMainLift: true },
  { key: "ohp", name: "Développé militaire", muscleGroup: "SHOULDERS", pattern: "PUSH_V", equipment: "BARBELL", isMainLift: true },
  { key: "row", name: "Rowing barre", muscleGroup: "BACK", pattern: "PULL_H", equipment: "BARBELL", isMainLift: true },
  { key: "rdl", name: "Soulevé de terre roumain", muscleGroup: "LEGS", pattern: "HINGE", equipment: "BARBELL", isMainLift: false },
  { key: "legpress", name: "Presse à cuisses", muscleGroup: "LEGS", pattern: "SQUAT", equipment: "MACHINE", isMainLift: false },
  { key: "latpull", name: "Tirage vertical", muscleGroup: "BACK", pattern: "PULL_V", equipment: "CABLE", isMainLift: false },
  { key: "dbbench", name: "Développé haltères", muscleGroup: "CHEST", pattern: "PUSH_H", equipment: "DUMBBELL", isMainLift: false },
  { key: "pullup", name: "Tractions", muscleGroup: "BACK", pattern: "PULL_V", equipment: "BODYWEIGHT", isMainLift: false },
  { key: "lunge", name: "Fentes marchées", muscleGroup: "LEGS", pattern: "LUNGE", equipment: "DUMBBELL", isMainLift: false },
  { key: "hipthrust", name: "Hip thrust", muscleGroup: "LEGS", pattern: "HINGE", equipment: "BARBELL", isMainLift: false },
  { key: "cablerow", name: "Rowing poulie", muscleGroup: "BACK", pattern: "PULL_H", equipment: "CABLE", isMainLift: false },
  { key: "legcurl", name: "Leg curl", muscleGroup: "LEGS", pattern: "HINGE", equipment: "MACHINE", isMainLift: false },
  { key: "plank", name: "Planche", muscleGroup: "CORE", pattern: "CORE", equipment: "BODYWEIGHT", isMainLift: false },
  { key: "facepull", name: "Face pull", muscleGroup: "SHOULDERS", pattern: "PULL_H", equipment: "CABLE", isMainLift: false },
  { key: "dips", name: "Dips", muscleGroup: "CHEST", pattern: "PUSH_V", equipment: "BODYWEIGHT", isMainLift: false },
  { key: "goblet", name: "Goblet squat", muscleGroup: "LEGS", pattern: "SQUAT", equipment: "DUMBBELL", isMainLift: false },
  { key: "carry", name: "Farmer carry", muscleGroup: "FULL_BODY", pattern: "CARRY", equipment: "DUMBBELL", isMainLift: false },
  { key: "bike", name: "Vélo intervalles", muscleGroup: "CARDIO", pattern: "CARDIO", equipment: "MACHINE", isMainLift: false },
];

type Tpl = { name: string; workouts: { name: string; focus: string; minutes: number; exercises: { key: string; sets: number; min: number; max: number; rest: number; load: (bw: number, sex: string) => number }[] }[] };
const kg = (f: number) => (bw: number, sex: string) => Math.round(((bw * f) * (sex === "F" ? 0.65 : 1)) / 2.5) * 2.5;
const TEMPLATES: Record<Scenario["template"], Tpl> = {
  FB3: {
    name: "Full Body 3×",
    workouts: [
      { name: "Full Body A", focus: "FULL_BODY", minutes: 55, exercises: [{ key: "squat", sets: 3, min: 6, max: 8, rest: 150, load: kg(0.7) }, { key: "bench", sets: 3, min: 6, max: 8, rest: 120, load: kg(0.55) }, { key: "cablerow", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.4) }, { key: "plank", sets: 3, min: 30, max: 45, rest: 60, load: () => 0 }] },
      { name: "Full Body B", focus: "FULL_BODY", minutes: 55, exercises: [{ key: "deadlift", sets: 3, min: 5, max: 6, rest: 180, load: kg(0.9) }, { key: "ohp", sets: 3, min: 6, max: 8, rest: 120, load: kg(0.35) }, { key: "latpull", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.45) }, { key: "lunge", sets: 2, min: 10, max: 12, rest: 90, load: kg(0.15) }] },
      { name: "Full Body C", focus: "FULL_BODY", minutes: 50, exercises: [{ key: "goblet", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.25) }, { key: "dbbench", sets: 3, min: 8, max: 12, rest: 90, load: kg(0.2) }, { key: "row", sets: 3, min: 8, max: 10, rest: 120, load: kg(0.5) }, { key: "bike", sets: 1, min: 10, max: 10, rest: 0, load: () => 0 }] },
    ],
  },
  UL4: {
    name: "Upper / Lower 4×",
    workouts: [
      { name: "Lower A", focus: "LOWER", minutes: 60, exercises: [{ key: "squat", sets: 4, min: 5, max: 8, rest: 180, load: kg(0.75) }, { key: "rdl", sets: 3, min: 8, max: 10, rest: 120, load: kg(0.6) }, { key: "legpress", sets: 3, min: 10, max: 12, rest: 90, load: kg(1.4) }, { key: "plank", sets: 3, min: 30, max: 45, rest: 60, load: () => 0 }] },
      { name: "Upper A", focus: "UPPER", minutes: 60, exercises: [{ key: "bench", sets: 4, min: 5, max: 8, rest: 150, load: kg(0.6) }, { key: "row", sets: 4, min: 6, max: 8, rest: 120, load: kg(0.55) }, { key: "ohp", sets: 3, min: 8, max: 10, rest: 120, load: kg(0.35) }, { key: "facepull", sets: 3, min: 12, max: 15, rest: 60, load: kg(0.15) }] },
      { name: "Lower B", focus: "LOWER", minutes: 60, exercises: [{ key: "deadlift", sets: 3, min: 4, max: 6, rest: 180, load: kg(0.95) }, { key: "lunge", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.15) }, { key: "legcurl", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.35) }, { key: "carry", sets: 3, min: 40, max: 40, rest: 90, load: kg(0.3) }] },
      { name: "Upper B", focus: "UPPER", minutes: 55, exercises: [{ key: "dbbench", sets: 3, min: 8, max: 12, rest: 90, load: kg(0.22) }, { key: "pullup", sets: 3, min: 5, max: 8, rest: 120, load: () => 0 }, { key: "cablerow", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.4) }, { key: "dips", sets: 3, min: 6, max: 10, rest: 90, load: () => 0 }] },
    ],
  },
  PPL3: {
    name: "Push / Pull / Legs 3×",
    workouts: [
      { name: "Push", focus: "PUSH", minutes: 60, exercises: [{ key: "bench", sets: 4, min: 5, max: 8, rest: 150, load: kg(0.65) }, { key: "ohp", sets: 3, min: 6, max: 8, rest: 120, load: kg(0.4) }, { key: "dbbench", sets: 3, min: 8, max: 12, rest: 90, load: kg(0.22) }, { key: "dips", sets: 3, min: 6, max: 10, rest: 90, load: () => 0 }] },
      { name: "Pull", focus: "PULL", minutes: 60, exercises: [{ key: "deadlift", sets: 3, min: 3, max: 5, rest: 180, load: kg(1.1) }, { key: "row", sets: 4, min: 6, max: 8, rest: 120, load: kg(0.55) }, { key: "pullup", sets: 3, min: 5, max: 8, rest: 120, load: () => 0 }, { key: "facepull", sets: 3, min: 12, max: 15, rest: 60, load: kg(0.15) }] },
      { name: "Legs", focus: "LOWER", minutes: 65, exercises: [{ key: "squat", sets: 4, min: 5, max: 8, rest: 180, load: kg(0.85) }, { key: "hipthrust", sets: 3, min: 8, max: 10, rest: 120, load: kg(1.0) }, { key: "legcurl", sets: 3, min: 10, max: 12, rest: 90, load: kg(0.35) }, { key: "plank", sets: 3, min: 30, max: 45, rest: 60, load: () => 0 }] },
    ],
  },
};

// Training weekdays are anchored on today so the demo always has sessions to start today (agenda, Today, workout mode).
const DOW = TODAY.getDay();
const SESSION_DAYS: Record<number, number[]> = { 3: [DOW, (DOW + 2) % 7, (DOW + 4) % 7].sort((a, b) => a - b), 4: [DOW, (DOW + 1) % 7, (DOW + 3) % 7, (DOW + 4) % 7].sort((a, b) => a - b) };

/** Which days (ago) get a photo set — mirrors how coaches actually collect them. */
function photoScheduleFor(sc: Scenario, days: number): number[] {
  if (sc.status === "ONBOARDING") return []; // nothing yet → the empty state shows the "why"
  if (sc.status === "CHURNED" || sc.status === "TRIAL") return [days]; // starting photo only
  if (sc.status === "PAUSED") return [days, Math.round(days / 2)];
  const latest = Math.min(days - 1, Math.max(3, sc.lastActiveDaysAgo));
  return [...new Set([days, Math.round(days / 2), latest])].sort((a, b) => b - a);
}

const PHOTO_NOTE: Record<string, string> = { fr: "Illustration démo générée à partir des mesures", en: "Demo illustration generated from the measurements", ar: "رسم توضيحي تجريبي مولّد من القياسات" };

async function main() {
  console.log("Seeding COAVEX…");
  resetDemoPhotoDir();
  // wipe (order matters for FK) — SQLite cascades from Organization
  await db.organization.deleteMany();
  await db.exercise.deleteMany();

  const org = await db.organization.create({ data: { name: "Studio Momentum Alger", slug: "momentum-alger", locale: "fr" } });
  const coachHash = await hashPassword("coach1234");
  const clientHash = await hashPassword("client1234");
  const coach = await db.user.create({ data: { orgId: org.id, email: "coach@coachos.demo", passwordHash: coachHash, name: "Sami Bouzid", role: "OWNER", locale: "fr", lastActiveAt: NOW } });
  await db.user.create({ data: { orgId: org.id, email: "assistant@coachos.demo", passwordHash: coachHash, name: "Nour Aït", role: "ASSISTANT", locale: "fr" } });

  const exById = new Map<string, string>();
  for (const e of EXERCISES) {
    const row = await db.exercise.create({ data: { orgId: null, name: e.name, muscleGroup: e.muscleGroup, pattern: e.pattern, equipment: e.equipment, isCompound: e.isMainLift || ["HINGE", "SQUAT", "LUNGE"].includes(e.pattern), isMainLift: e.isMainLift } });
    exById.set(e.key, row.id);
  }
  // substitutions
  const subs: [string, string[]][] = [["squat", ["legpress", "goblet"]], ["bench", ["dbbench", "dips"]], ["deadlift", ["rdl", "hipthrust"]], ["ohp", ["dbbench"]], ["row", ["cablerow", "latpull"]], ["pullup", ["latpull"]], ["lunge", ["legpress"]]];
  for (const [k, list] of subs) await db.exercise.update({ where: { id: exById.get(k)! }, data: { substitutes: list.map((x) => exById.get(x)!).join(",") } });

  const thisWeekStart = startOfWeek(NOW);

  for (const sc of SCENARIOS) {
    const onboardedAt = addDays(TODAY, -sc.onboardedDaysAgo);
    const email = `${sc.first.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@coachos.demo`;
    let userId: string | null = null;
    if (sc.login) {
      const u = await db.user.create({ data: { orgId: org.id, email, passwordHash: clientHash, name: `${sc.first} ${sc.last}`, role: "CLIENT", locale: sc.locale, lastActiveAt: addDays(NOW, -sc.lastActiveDaysAgo) } });
      userId = u.id;
    }
    const client = await db.client.create({
      data: {
        orgId: org.id, coachId: coach.id, userId, firstName: sc.first, lastName: sc.last, sex: sc.sex, status: sc.status, onboardedAt, phone: `+213 5${Math.floor(50 + rnd() * 49)} ${Math.floor(100 + rnd() * 899)} ${Math.floor(100 + rnd() * 899)}`, email,
        heightCm: sc.sex === "F" ? 163 + Math.floor(rnd() * 10) : 172 + Math.floor(rnd() * 12),
        checkInWeekday: sc.checkInWeekday, plannedSessionsPerWeek: sc.perWeek, preferredLocale: sc.locale, preferredChannel: sc.first === "Mehdi" ? "WHATSAPP" : "APP",
        lastActiveAt: addDays(NOW, -sc.lastActiveDaysAgo), createdAt: onboardedAt,
      },
    });
    const ev = (type: string, occurredAt: Date, payload: Record<string, unknown> = {}, actorId: string | null = null) => db.event.create({ data: { orgId: org.id, clientId: client.id, type, occurredAt, payloadJson: JSON.stringify(payload), actorId } });
    await ev("client.created", onboardedAt, { name: `${sc.first} ${sc.last}` }, coach.id);

    // goal + assessment
    const goal = await db.goal.create({ data: { clientId: client.id, type: sc.goal.type, title: sc.goal.title, metric: "weightKg", startValue: sc.goal.start, targetValue: sc.goal.target, targetDate: addDays(TODAY, 60), isPrimary: true, status: "ACTIVE", createdAt: onboardedAt } });
    if (sc.status !== "ONBOARDING" || sc.onboardedDaysAgo > 5) {
      await db.assessment.create({ data: { clientId: client.id, date: addDays(onboardedAt, 1), experience: sc.template === "FB3" ? "BEGINNER" : "INTERMEDIATE", daysAvailable: sc.perWeek, minutesPerSession: 60, equipment: sc.first === "Lina" ? "DUMBBELL,BAND" : "BARBELL,DUMBBELL,MACHINE,CABLE", injuries: sc.notes.find((n) => n.category === "INJURY")?.content ?? null, preferences: sc.notes.find((n) => n.category === "PREFERENCE")?.content ?? null } });
      await ev("assessment.completed", addDays(onboardedAt, 1), {}, coach.id);
    }

    // notes
    for (const n of sc.notes) {
      await db.coachNote.create({ data: { clientId: client.id, authorId: coach.id, category: n.category, content: n.content, pinned: !!n.pinned, createdAt: addDays(onboardedAt, 2) } });
    }

    // subscription + payments
    if (sc.subscription) {
      const s = sc.subscription;
      const sub = await db.subscription.create({ data: { clientId: client.id, packageName: s.pkg, amount: s.amount, billingCycle: s.cycle, startDate: addDays(TODAY, -s.startDaysAgo), endDate: addDays(TODAY, s.endInDays), status: s.status, createdAt: addDays(TODAY, -s.startDaysAgo) } });
      await ev("subscription.started", addDays(TODAY, -s.startDaysAgo), { package: s.pkg });
      if (s.amount > 0 && s.cycle === "MONTHLY") {
        const months = Math.max(1, Math.floor(s.startDaysAgo / 30));
        for (let m = 0; m < months; m++) {
          const due = addDays(TODAY, -s.startDaysAgo + m * 30);
          const isLast = m === months - 1;
          const overdue = isLast && s.overdueDays;
          await db.payment.create({ data: { subscriptionId: sub.id, clientId: client.id, amount: s.amount, dueAt: overdue ? addDays(TODAY, -s.overdueDays!) : due, paidAt: overdue ? null : addDays(due, 1), status: overdue ? "OVERDUE" : "PAID", method: "CASH", createdAt: due } });
          if (!overdue) await ev("payment.received", addDays(due, 1), { amount: s.amount });
        }
      }
    }

    // weight series (every 3–4 days since onboarding, capped at 90 days)
    const days = Math.min(90, sc.onboardedDaysAgo);
    if (sc.status !== "ONBOARDING" || sc.onboardedDaysAgo >= 3) {
      const w0 = sc.goal.start;
      let last: number | null = null;
      for (let d = days; d >= 0; d -= 3 + Math.floor(rnd() * 2)) {
        const t = days - d;
        let w = w0 + (sc.weight.perWeek * t) / 7;
        if (sc.weight.plateauFromDays && d <= sc.weight.plateauFromDays) {
          const tp = days - sc.weight.plateauFromDays;
          w = w0 + (sc.weight.perWeek * tp) / 7;
        }
        w += (rnd() - 0.5) * (sc.weight.noise ?? 0.4);
        w = Math.round(w * 10) / 10;
        last = w;
        const date = addDays(TODAY, -d);
        await db.measurement.create({ data: { clientId: client.id, date, weightKg: w, waistCm: sc.goal.type === "FAT_LOSS" ? Math.round((w * 1.05 + 5) * 10) / 10 : null } });
        if (d % 12 === 0) await ev("measurement.recorded", date, { weightKg: w });
      }
      if (sc.status === "CHURNED") await db.goal.update({ where: { id: goal.id }, data: { status: "DROPPED" } });
      void last;
    }

    // progress photos — stylised illustrations drawn from the client's own data (labelled as such in the note)
    for (const dAgo of photoScheduleFor(sc, days)) {
      const date = addDays(TODAY, -dAgo);
      const m = await db.measurement.findFirst({ where: { clientId: client.id, date: { lte: addDays(date, 1) } }, orderBy: { date: "desc" } });
      const progress = days > 0 ? (days - dAgo) / days : 0;
      const muscle = ["MUSCLE_GAIN", "STRENGTH", "RECOMP"].includes(sc.goal.type) ? 0.15 + 0.6 * progress : 0.1 * progress;
      for (const pose of ["FRONT", "SIDE"] as DemoPose[]) {
        const svg = figureSvg({ sex: sc.sex, heightCm: client.heightCm ?? 172, weightKg: m?.weightKg ?? sc.goal.start, muscle, pose, tag: "Illustration démo" });
        const url = writeDemoPhoto(email.split("@")[0], dAgo, pose, svg);
        await db.progressPhoto.create({ data: { clientId: client.id, date, url, pose, note: PHOTO_NOTE[sc.locale] ?? PHOTO_NOTE.fr } });
      }
      const byCoach = dAgo === days;
      await ev("photo.added", date, { poses: "FRONT,SIDE", by: byCoach ? "COACH" : "CLIENT" }, byCoach ? coach.id : null);
    }

    // program + workouts
    let programId: string | null = null;
    const workoutIds: { id: string; exercises: { exerciseId: string; key: string; sets: number; min: number; max: number; load: number; isMain: boolean }[] }[] = [];
    if (!sc.noProgram) {
      const tpl = TEMPLATES[sc.template];
      const active = sc.status !== "CHURNED";
      const program = await db.program.create({
        data: { clientId: client.id, coachId: coach.id, name: `${tpl.name} — ${sc.first}`, status: active && sc.status !== "PAUSED" ? "ACTIVE" : "ARCHIVED", startDate: addDays(onboardedAt, 3), sessionsPerWeek: sc.perWeek, progressionRule: sc.template === "PPL3" ? "RPE_BASED" : "DOUBLE_PROGRESSION", progressionJson: JSON.stringify({ incrementKg: sc.loads.increment, targetRpe: 8 }), deloadEveryWeeks: 5, createdAt: addDays(onboardedAt, 3) },
      });
      programId = program.id;
      await ev("program.created", addDays(onboardedAt, 3), { name: program.name }, coach.id);
      await ev("program.activated", addDays(onboardedAt, 3), { name: program.name }, coach.id);
      for (const [i, w] of tpl.workouts.entries()) {
        const wo = await db.workout.create({ data: { programId: program.id, name: w.name, order: i, focus: w.focus, estimatedMinutes: w.minutes } });
        const exs: (typeof workoutIds)[number]["exercises"] = [];
        for (const [j, e] of w.exercises.entries()) {
          const exerciseId = exById.get(e.key)!;
          const load = e.load(sc.goal.start, sc.sex);
          await db.workoutExercise.create({ data: { workoutId: wo.id, exerciseId, order: j, sets: e.sets, repsMin: e.min, repsMax: e.max, restSec: e.rest, startLoadKg: load || null, targetRpe: sc.template === "PPL3" ? 8 : null } });
          exs.push({ exerciseId, key: e.key, sets: e.sets, min: e.min, max: e.max, load, isMain: !!EXERCISES.find((x) => x.key === e.key)?.isMainLift });
        }
        workoutIds.push({ id: wo.id, exercises: exs });
      }
    }

    // sessions over the last 8 weeks + this week + next week
    if (programId && sc.completion.length) {
      const weeks = sc.completion.length;
      const daysOfWeek = SESSION_DAYS[sc.perWeek] ?? [0, 2, 4];
      let idx = 0;
      let sessionIdx = 0;
      const missedThisWeek: string[] = [];
      for (let w = weeks; w >= -1; w--) {
        const weekStart = addDays(thisWeekStart, -7 * w);
        const weekIndexFromStart = weeks - w; // 0 = oldest
        const p = w >= 1 ? sc.completion[weeks - w] : sc.completion[weeks - 1];
        for (const [di, dow] of daysOfWeek.entries()) {
          const scheduledFor = new Date(addDays(weekStart, dow));
          scheduledFor.setHours(18, 0, 0, 0);
          if (scheduledFor < addDays(onboardedAt, 3)) continue;
          const wo = workoutIds[sessionIdx % workoutIds.length];
          sessionIdx++;
          const future = scheduledFor > NOW || scheduledFor >= TODAY; // today's sessions stay open to start, whatever the seeding hour
          if (future) {
            if (sc.status !== "PAUSED") await db.workoutSession.create({ data: { clientId: client.id, programId, workoutId: wo.id, scheduledFor, status: "SCHEDULED" } });
            continue;
          }
          if (sc.status === "PAUSED" && w <= 3) continue; // paused clients have no sessions in the last weeks
          const done = rnd() < p;
          const reason = done ? null : typeof sc.missedReason === "function" ? sc.missedReason(idx) : (sc.missedReason ?? null);
          idx++;
          if (!done) {
            const s = await db.workoutSession.create({ data: { clientId: client.id, programId, workoutId: wo.id, scheduledFor, status: "MISSED", missedReason: reason } });
            if (w === 0) missedThisWeek.push(s.id);
            await ev("workout.missed", scheduledFor, { workout: tpl(sc).workouts[sessionIdx % workoutIds.length]?.name, reason });
            continue;
          }
          const rpe = sc.first === "Bilal" ? 9 : 7 + Math.round(rnd() * 2) / 2;
          const shortened = sc.first === "Lina" && rnd() < 0.5;
          const session = await db.workoutSession.create({ data: { clientId: client.id, programId, workoutId: wo.id, scheduledFor, status: "COMPLETED", startedAt: scheduledFor, completedAt: addDays(scheduledFor, 0), durationMin: shortened ? 32 : 50 + Math.floor(rnd() * 15), sessionRpe: rpe, isShortened: shortened } });
          await ev("workout.completed", scheduledFor, { workout: wo.exercises.length ? undefined : undefined, rpe });
          // sets
          const rows: { sessionId: string; exerciseId: string; setIndex: number; reps: number; weightKg: number; rpe: number | null; isPr: boolean }[] = [];
          for (const e of wo.exercises) {
            if (!e.load) {
              for (let s = 0; s < e.sets; s++) rows.push({ sessionId: session.id, exerciseId: e.exerciseId, setIndex: s, reps: e.min + Math.floor(rnd() * (e.max - e.min + 1)), weightKg: 0, rpe: null, isPr: false });
              continue;
            }
            const stagnant = sc.loads.stagnantFromWeek !== undefined && weekIndexFromStart >= sc.loads.stagnantFromWeek;
            const progressWeeks = stagnant ? sc.loads.stagnantFromWeek! : weekIndexFromStart;
            const progressFactor = sc.first === "Mehdi" || sc.first === "Lina" || sc.first === "Ahmed" ? 0.5 : 1;
            const load = Math.round((e.load + sc.loads.increment * progressWeeks * progressFactor * (e.isMain ? 1 : 0.5)) / 1.25) * 1.25;
            for (let s = 0; s < e.sets; s++) {
              const reps = Math.max(e.min - 1, Math.min(e.max, e.max - s + Math.floor(rnd() * 2)));
              rows.push({ sessionId: session.id, exerciseId: e.exerciseId, setIndex: s, reps, weightKg: load, rpe: 7 + Math.round(rnd() * 4) / 2, isPr: false });
            }
          }
          if (rows.length) await db.exerciseSet.createMany({ data: rows });
        }
      }
      // mark PRs: best e1rm per main lift
      const sets = await db.exerciseSet.findMany({ where: { session: { clientId: client.id } }, include: { exercise: true, session: true } });
      const best = new Map<string, { id: string; v: number }>();
      for (const s of sets) {
        if (!s.exercise.isMainLift || !s.weightKg) continue;
        const v = e1rm(s.weightKg, s.reps);
        const cur = best.get(s.exerciseId);
        if (!cur || v > cur.v) best.set(s.exerciseId, { id: s.id, v });
      }
      for (const b of best.values()) await db.exerciseSet.update({ where: { id: b.id }, data: { isPr: true } });
    }

    // daily logs (last 28 days)
    if (sc.status === "ACTIVE" || sc.status === "TRIAL" || sc.status === "PAUSED") {
      const startDay = Math.min(28, sc.onboardedDaysAgo);
      for (let d = startDay - 1; d >= 0; d--) {
        if (sc.logSkip && rnd() < sc.logSkip) continue;
        const date = addDays(TODAY, -d);
        await db.dailyLog.create({
          data: {
            clientId: client.id, date,
            sleepHours: Math.round((sc.sleep(d) + (rnd() - 0.5) * 0.8) * 10) / 10,
            sleepQuality: 3 + Math.floor(rnd() * 2),
            energy: Math.max(1, Math.min(5, (sc.energy ? sc.energy(d) : 4) + Math.round((rnd() - 0.5) * 1.2))),
            soreness: 2 + Math.floor(rnd() * 2),
            stress: Math.max(1, Math.min(5, (sc.stress ? sc.stress(d) : 2) + Math.round((rnd() - 0.5) * 1.2))),
            perceivedRecovery: Math.max(1, Math.min(5, (sc.recovery ? sc.recovery(d) : 4) + Math.round((rnd() - 0.5) * 1.2))),
            nutritionAdherence: Math.max(1, Math.min(5, (sc.nutrition ? sc.nutrition(d) : 4) + Math.round((rnd() - 0.5) * 1.2))),
          },
        });
      }
    }

    // habits + logs
    for (const h of sc.habits) {
      const habit = await db.habit.create({ data: { clientId: client.id, name: h.name, kind: h.kind, target: h.target, unit: h.unit, daysPerWeek: h.days, createdAt: addDays(onboardedAt, 3) } });
      const logs: { habitId: string; date: Date; done: boolean; value: number }[] = [];
      for (let d = 27; d >= 0; d--) {
        const date = addDays(TODAY, -d);
        if (date < addDays(onboardedAt, 3)) continue;
        // Ahmed and Mehdi degrade over time; Walid low; others steady
        const adh = sc.first === "Ahmed" ? (d >= 14 ? 0.85 : 0.35) : sc.first === "Mehdi" ? (d >= 14 ? 0.5 : 0.1) : h.adherence;
        const done = rnd() < adh;
        logs.push({ habitId: habit.id, date, done, value: done ? h.target : Math.round(h.target * rnd() * 10) / 10 });
      }
      if (logs.length) await db.habitLog.createMany({ data: logs });
    }

    // nutrition plan
    if (!sc.noProgram && sc.status !== "CHURNED") {
      const bw = sc.goal.start;
      const kcal = Math.round((sc.goal.type === "FAT_LOSS" ? bw * 26 : sc.goal.type === "MUSCLE_GAIN" ? bw * 36 : bw * 31) / 50) * 50;
      await db.nutritionPlan.create({ data: { clientId: client.id, approach: sc.first === "Karim" ? "HABIT_BASED" : "FLEXIBLE", caloriesTarget: kcal, proteinG: Math.round(bw * 1.8), carbsG: Math.round((kcal * 0.4) / 4), fatG: Math.round((kcal * 0.25) / 9), notes: sc.first === "Karim" ? "Priorité : protéines + légumes au restaurant, pas de comptage." : null, startDate: addDays(onboardedAt, 3) } });
    }

    // check-ins
    const trainingPlanned = sc.perWeek;
    for (const c of sc.checkIns) {
      const weekStart = addDays(thisWeekStart, -7 * c.weeksAgo);
      const submittedAt = c.submitted ? addDays(weekStart, c.weeksAgo === 0 ? Math.min(6, TODAY.getDay()) : 6) : null;
      const sleepAvg = Math.round(sc.sleep(c.weeksAgo * 7 + 3) * 10) / 10;
      const row = await db.checkIn.create({
        data: {
          clientId: client.id, weekStart, status: c.reviewed ? "REVIEWED" : c.submitted ? "SUBMITTED" : "PENDING", submittedAt,
          weightKg: c.submitted ? Math.round((sc.goal.start + (sc.weight.perWeek * (sc.onboardedDaysAgo - c.weeksAgo * 7)) / 7) * 10) / 10 : null,
          sleepAvgHours: sleepAvg, energy: sc.energy ? sc.energy(c.weeksAgo * 7 + 3) : 4, soreness: 2, stress: sc.stress ? sc.stress(c.weeksAgo * 7 + 3) : 2,
          trainingCompleted: Math.round(trainingPlanned * (sc.completion[Math.max(0, sc.completion.length - 1 - c.weeksAgo)] ?? 1)), trainingPlanned,
          nutritionAdherence: c.nutrition ?? 4, habitAdherencePct: Math.round((sc.habits[0]?.adherence ?? 0.7) * 100),
          wins: c.wins ?? null, struggles: c.struggles ?? null, frictionTags: (c.tags ?? []).join(","), coachReviewedAt: c.reviewed ? addDays(weekStart, 7) : null, createdAt: weekStart,
        },
      });
      if (submittedAt) {
        await ev("checkin.submitted", submittedAt, { weekStart: isoDate(weekStart) });
        const prev = await db.checkIn.findFirst({ where: { clientId: client.id, weekStart: { lt: weekStart }, submittedAt: { not: null } }, orderBy: { weekStart: "desc" } });
        const toSnap = (x: typeof row) => ({ ...x, frictionTags: x.frictionTags ? (x.frictionTags.split(",") as FrictionCategory[]) : [] });
        const summary = summarizeCheckIn(toSnap(row), prev ? toSnap(prev) : null, { id: goal.id, type: goal.type as never, title: goal.title, metric: goal.metric, startValue: goal.startValue, targetValue: goal.targetValue, targetDate: goal.targetDate, isPrimary: true, status: "ACTIVE" }, sc.locale);
        await db.checkIn.update({ where: { id: row.id }, data: { summaryJson: JSON.stringify(summary) } });
      }
      if (c.reviewed) await ev("checkin.reviewed", addDays(weekStart, 7), {}, coach.id);
    }

    // messages
    for (const m of sc.messages) {
      const createdAt = addDays(NOW, -m.daysAgo);
      await db.message.create({ data: { orgId: org.id, clientId: client.id, senderId: m.from === "coach" ? coach.id : userId, direction: m.from === "coach" ? "COACH_TO_CLIENT" : "CLIENT_TO_COACH", channel: sc.first === "Mehdi" ? "WHATSAPP" : "APP", body: m.body, readAt: m.from === "client" && m.daysAgo <= 3 && (sc.first === "Mehdi") ? null : createdAt, createdAt } });
      await ev(m.from === "coach" ? "message.sent" : "message.received", createdAt, { preview: m.body.slice(0, 60) }, m.from === "coach" ? coach.id : null);
    }

    // milestones
    for (const m of sc.milestones ?? []) {
      const reachedAt = addDays(TODAY, -m.daysAgo);
      await db.milestone.create({ data: { clientId: client.id, kind: m.kind, title: m.title, reachedAt, highlighted: !!m.highlighted, goalId: goal.id } });
      await ev("milestone.reached", reachedAt, { title: m.title });
    }
    console.log(`  • ${sc.first} ${sc.last} (${sc.status})`);
  }

  console.log("Computing signals & actions…");
  const r = await recomputeOrganization(org.id, "fr", NOW);
  console.log(`  ${r.clients} clients · ${r.signals} signals · ${r.actions} actions`);
  console.log("Done. Login: coach@coachos.demo / coach1234");
}

function tpl(sc: Scenario) {
  return TEMPLATES[sc.template];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
