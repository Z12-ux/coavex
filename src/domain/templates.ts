/**
 * Program templates the coach starts from. Exercises are referenced by a
 * stable library name; loads are computed from body weight and sex.
 */

export interface TemplateExercise {
  exercise: string; // library name (Exercise.name)
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  /** fraction of body weight for the starting load (0 = bodyweight/none) */
  bwFactor: number;
}

export interface TemplateWorkout {
  name: string;
  focus: string;
  estimatedMinutes: number;
  exercises: TemplateExercise[];
}

export interface ProgramTemplate {
  key: string;
  name: string;
  description: string;
  sessionsPerWeek: number;
  progressionRule: "DOUBLE_PROGRESSION" | "LINEAR" | "RPE_BASED";
  deloadEveryWeeks: number;
  workouts: TemplateWorkout[];
}

const ex = (exercise: string, sets: number, repsMin: number, repsMax: number, restSec: number, bwFactor: number): TemplateExercise => ({ exercise, sets, repsMin, repsMax, restSec, bwFactor });

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    key: "FB3",
    name: "Full Body 3×",
    description: "Trois séances complètes par semaine. Idéal débutant / temps limité.",
    sessionsPerWeek: 3,
    progressionRule: "DOUBLE_PROGRESSION",
    deloadEveryWeeks: 5,
    workouts: [
      { name: "Full Body A", focus: "FULL_BODY", estimatedMinutes: 55, exercises: [ex("Squat barre", 3, 6, 8, 150, 0.7), ex("Développé couché", 3, 6, 8, 120, 0.55), ex("Rowing poulie", 3, 10, 12, 90, 0.4), ex("Planche", 3, 30, 45, 60, 0)] },
      { name: "Full Body B", focus: "FULL_BODY", estimatedMinutes: 55, exercises: [ex("Soulevé de terre", 3, 5, 6, 180, 0.9), ex("Développé militaire", 3, 6, 8, 120, 0.35), ex("Tirage vertical", 3, 10, 12, 90, 0.45), ex("Fentes marchées", 2, 10, 12, 90, 0.15)] },
      { name: "Full Body C", focus: "FULL_BODY", estimatedMinutes: 50, exercises: [ex("Goblet squat", 3, 10, 12, 90, 0.25), ex("Développé haltères", 3, 8, 12, 90, 0.2), ex("Rowing barre", 3, 8, 10, 120, 0.5), ex("Vélo intervalles", 1, 10, 10, 0, 0)] },
    ],
  },
  {
    key: "UL4",
    name: "Upper / Lower 4×",
    description: "Quatre séances : haut / bas du corps en alternance. Intermédiaire.",
    sessionsPerWeek: 4,
    progressionRule: "DOUBLE_PROGRESSION",
    deloadEveryWeeks: 5,
    workouts: [
      { name: "Lower A", focus: "LOWER", estimatedMinutes: 60, exercises: [ex("Squat barre", 4, 5, 8, 180, 0.75), ex("Soulevé de terre roumain", 3, 8, 10, 120, 0.6), ex("Presse à cuisses", 3, 10, 12, 90, 1.4), ex("Planche", 3, 30, 45, 60, 0)] },
      { name: "Upper A", focus: "UPPER", estimatedMinutes: 60, exercises: [ex("Développé couché", 4, 5, 8, 150, 0.6), ex("Rowing barre", 4, 6, 8, 120, 0.55), ex("Développé militaire", 3, 8, 10, 120, 0.35), ex("Face pull", 3, 12, 15, 60, 0.15)] },
      { name: "Lower B", focus: "LOWER", estimatedMinutes: 60, exercises: [ex("Soulevé de terre", 3, 4, 6, 180, 0.95), ex("Fentes marchées", 3, 10, 12, 90, 0.15), ex("Leg curl", 3, 10, 12, 90, 0.35), ex("Farmer carry", 3, 40, 40, 90, 0.3)] },
      { name: "Upper B", focus: "UPPER", estimatedMinutes: 55, exercises: [ex("Développé haltères", 3, 8, 12, 90, 0.22), ex("Tractions", 3, 5, 8, 120, 0), ex("Rowing poulie", 3, 10, 12, 90, 0.4), ex("Dips", 3, 6, 10, 90, 0)] },
    ],
  },
  {
    key: "PPL3",
    name: "Push / Pull / Legs 3×",
    description: "Trois séances orientées force avec pilotage à l'RPE.",
    sessionsPerWeek: 3,
    progressionRule: "RPE_BASED",
    deloadEveryWeeks: 5,
    workouts: [
      { name: "Push", focus: "PUSH", estimatedMinutes: 60, exercises: [ex("Développé couché", 4, 5, 8, 150, 0.65), ex("Développé militaire", 3, 6, 8, 120, 0.4), ex("Développé haltères", 3, 8, 12, 90, 0.22), ex("Dips", 3, 6, 10, 90, 0)] },
      { name: "Pull", focus: "PULL", estimatedMinutes: 60, exercises: [ex("Soulevé de terre", 3, 3, 5, 180, 1.1), ex("Rowing barre", 4, 6, 8, 120, 0.55), ex("Tractions", 3, 5, 8, 120, 0), ex("Face pull", 3, 12, 15, 60, 0.15)] },
      { name: "Legs", focus: "LOWER", estimatedMinutes: 65, exercises: [ex("Squat barre", 4, 5, 8, 180, 0.85), ex("Hip thrust", 3, 8, 10, 120, 1.0), ex("Leg curl", 3, 10, 12, 90, 0.35), ex("Planche", 3, 30, 45, 60, 0)] },
    ],
  },
  {
    key: "HOME3",
    name: "Maison 3× (haltères + élastiques)",
    description: "Trois séances courtes de 35 minutes sans salle.",
    sessionsPerWeek: 3,
    progressionRule: "DOUBLE_PROGRESSION",
    deloadEveryWeeks: 6,
    workouts: [
      { name: "Maison A", focus: "FULL_BODY", estimatedMinutes: 35, exercises: [ex("Goblet squat", 3, 10, 15, 60, 0.2), ex("Développé haltères", 3, 10, 15, 60, 0.15), ex("Rowing poulie", 3, 12, 15, 60, 0.2), ex("Planche", 3, 30, 45, 45, 0)] },
      { name: "Maison B", focus: "FULL_BODY", estimatedMinutes: 35, exercises: [ex("Fentes marchées", 3, 10, 12, 60, 0.12), ex("Hip thrust", 3, 12, 15, 60, 0.2), ex("Face pull", 3, 15, 20, 45, 0.1), ex("Farmer carry", 3, 40, 40, 60, 0.25)] },
      { name: "Maison C", focus: "CONDITIONING", estimatedMinutes: 30, exercises: [ex("Goblet squat", 3, 12, 15, 45, 0.2), ex("Dips", 3, 6, 10, 60, 0), ex("Vélo intervalles", 1, 12, 12, 0, 0)] },
    ],
  },
];

export const WEEKDAY_PLANS: Record<number, number[]> = { 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };

export function roundLoad(x: number, step = 1.25): number {
  return Math.round(x / step) * step;
}
