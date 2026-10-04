/**
 * Domain types shared by the intelligence engines (signals, actions, momentum,
 * drift, friction, check-in summary, weekly review).
 *
 * Engines are pure functions over a `ClientSnapshot`; they never touch the
 * database, which keeps them deterministic and unit-testable.
 */

export type Locale = "fr" | "ar" | "en";
export const LOCALES: Locale[] = ["fr", "ar", "en"];

export type Role = "OWNER" | "COACH" | "ASSISTANT" | "CLIENT" | "ADMIN";
export const ROLES: Role[] = ["OWNER", "COACH", "ASSISTANT", "CLIENT", "ADMIN"];

export type ClientStatus = "ONBOARDING" | "ACTIVE" | "PAUSED" | "TRIAL" | "CHURNED";
export const CLIENT_STATUSES: ClientStatus[] = ["ONBOARDING", "ACTIVE", "PAUSED", "TRIAL", "CHURNED"];

export type GoalType = "FAT_LOSS" | "MUSCLE_GAIN" | "STRENGTH" | "PERFORMANCE" | "HEALTH" | "RECOMP";
export const GOAL_TYPES: GoalType[] = ["FAT_LOSS", "MUSCLE_GAIN", "STRENGTH", "PERFORMANCE", "HEALTH", "RECOMP"];

export type SessionStatus = "SCHEDULED" | "COMPLETED" | "MISSED" | "SKIPPED" | "RESCHEDULED";

export type FrictionCategory =
  | "TIME"
  | "SCHEDULE"
  | "MOTIVATION"
  | "DIFFICULTY"
  | "EQUIPMENT"
  | "NUTRITION"
  | "RECOVERY"
  | "COMMUNICATION"
  | "UNCLEAR"
  | "WORKLOAD"
  | "ILLNESS"
  | "OTHER";
export const FRICTION_CATEGORIES: FrictionCategory[] = [
  "TIME",
  "SCHEDULE",
  "MOTIVATION",
  "DIFFICULTY",
  "EQUIPMENT",
  "NUTRITION",
  "RECOVERY",
  "COMMUNICATION",
  "UNCLEAR",
  "WORKLOAD",
  "ILLNESS",
  "OTHER",
];

export type Severity = "INFO" | "WATCH" | "ATTENTION" | "URGENT";
export type Polarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL";
export type Trend = "UP" | "FLAT" | "DOWN";

export type SignalKey =
  | "MISSED_WORKOUTS"
  | "TRAINING_CONSISTENCY_DROP"
  | "ADHERENCE_DECLINING"
  | "SLEEP_DECLINE"
  | "RECOVERY_LOW"
  | "STRESS_HIGH"
  | "WEIGHT_PLATEAU"
  | "WEIGHT_TREND_AGAINST_GOAL"
  | "PERFORMANCE_UP"
  | "LOAD_STAGNANT"
  | "ENGAGEMENT_LOW"
  | "CHECKIN_OVERDUE"
  | "HABIT_LOW"
  | "NUTRITION_ADHERENCE_LOW"
  | "NO_ACTIVE_PROGRAM"
  | "ONBOARDING_STALLED"
  | "PAYMENT_OVERDUE"
  | "SUBSCRIPTION_ENDING"
  | "MILESTONE_REACHED"
  | "CONSISTENCY_STREAK"
  | "UNANSWERED_MESSAGE"
  | "FRICTION_PATTERN";

export type ActionKind =
  | "REVIEW_MISSED"
  | "SEND_ENCOURAGEMENT"
  | "REVIEW_NUTRITION"
  | "ADJUST_PROGRESSION"
  | "REVIEW_RECOVERY"
  | "REQUEST_CHECKIN"
  | "REVIEW_CHECKIN"
  | "CELEBRATE"
  | "UPDATE_PROGRAM"
  | "SCHEDULE_FOLLOWUP"
  | "CREATE_PROGRAM"
  | "REVIEW_PAYMENT"
  | "REPLY_MESSAGE"
  | "REVIEW_FRICTION"
  | "RE_ENGAGE"
  | "NO_ACTION";

export interface Evidence {
  label: string;
  value: string;
}

export interface SignalDraft {
  key: SignalKey;
  severity: Severity;
  polarity: Polarity;
  title: string;
  what: string;
  why: string;
  evidence: Evidence[];
  suggestedAction?: string;
  /** stable across recomputes while the underlying situation persists */
  fingerprint: string;
}

export interface ActionDraft {
  kind: ActionKind;
  title: string;
  reason: string;
  priority: number; // 0–100
  sourceSignalKeys: SignalKey[];
  fingerprint: string;
  dueInDays?: number;
}

// ───────────────────────────── Snapshot ─────────────────────────────────────

export interface SnapshotClient {
  id: string;
  firstName: string;
  lastName: string;
  status: ClientStatus;
  onboardedAt: Date;
  checkInWeekday: number;
  plannedSessionsPerWeek: number;
  lastActiveAt: Date | null;
  preferredLocale: Locale;
}

export interface SnapshotGoal {
  id: string;
  type: GoalType;
  title: string;
  metric: string | null;
  startValue: number | null;
  targetValue: number | null;
  targetDate: Date | null;
  isPrimary: boolean;
  status: string;
}

export interface SnapshotProgram {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  sessionsPerWeek: number;
  progressionRule: string;
  deloadEveryWeeks: number | null;
}

export interface SnapshotSession {
  id: string;
  scheduledFor: Date;
  status: SessionStatus;
  completedAt: Date | null;
  durationMin: number | null;
  sessionRpe: number | null;
  isShortened: boolean;
  missedReason: FrictionCategory | null;
  workoutName: string | null;
}

export interface SnapshotSet {
  date: Date;
  exerciseId: string;
  exerciseName: string;
  isMainLift: boolean;
  reps: number;
  weightKg: number;
  rpe: number | null;
}

export interface SnapshotMeasurement {
  date: Date;
  weightKg: number | null;
  waistCm: number | null;
  bodyFatPct: number | null;
}

export interface SnapshotDailyLog {
  date: Date;
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  soreness: number | null;
  stress: number | null;
  perceivedRecovery: number | null;
  nutritionAdherence: number | null;
}

export interface SnapshotHabit {
  id: string;
  name: string;
  kind: string;
  daysPerWeek: number;
  logs: { date: Date; done: boolean; value: number }[];
}

export interface SnapshotCheckIn {
  id: string;
  weekStart: Date;
  status: string;
  submittedAt: Date | null;
  weightKg: number | null;
  sleepAvgHours: number | null;
  energy: number | null;
  soreness: number | null;
  stress: number | null;
  trainingCompleted: number | null;
  trainingPlanned: number | null;
  nutritionAdherence: number | null;
  habitAdherencePct: number | null;
  wins: string | null;
  struggles: string | null;
  frictionTags: FrictionCategory[];
  freeText: string | null;
  coachReviewedAt: Date | null;
}

export interface SnapshotMessage {
  direction: "COACH_TO_CLIENT" | "CLIENT_TO_COACH";
  createdAt: Date;
  readAt: Date | null;
}

export interface SnapshotPayment {
  id: string;
  dueAt: Date;
  paidAt: Date | null;
  status: string;
  amount: number;
}

export interface SnapshotSubscription {
  status: string;
  endDate: Date | null;
  packageName: string;
}

export interface SnapshotMilestone {
  kind: string;
  title: string;
  reachedAt: Date;
}

export interface ClientSnapshot {
  now: Date;
  client: SnapshotClient;
  goals: SnapshotGoal[];
  program: SnapshotProgram | null;
  /** sessions in the last 8 weeks plus scheduled sessions in the next 7 days */
  sessions: SnapshotSession[];
  /** performed sets in the last 8 weeks */
  sets: SnapshotSet[];
  /** measurements in the last 90 days, ascending */
  measurements: SnapshotMeasurement[];
  /** daily logs in the last 28 days, ascending */
  dailyLogs: SnapshotDailyLog[];
  habits: SnapshotHabit[];
  /** last 8 check-ins, ascending by weekStart */
  checkIns: SnapshotCheckIn[];
  /** messages in the last 30 days */
  messages: SnapshotMessage[];
  /** open (unpaid) payments */
  payments: SnapshotPayment[];
  subscription: SnapshotSubscription | null;
  milestones: SnapshotMilestone[];
}

// ───────────────────────────── Engine outputs ───────────────────────────────

export type MomentumDimensionKey =
  | "consistency"
  | "adherence"
  | "performance"
  | "recovery"
  | "habits"
  | "engagement"
  | "goalProgress";

export interface MomentumDimension {
  key: MomentumDimensionKey;
  score: number | null; // 0–100, null when insufficient data
  trend: Trend;
  explanation: string;
  evidence: Evidence[];
}

export type MomentumStatus = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";

export interface Momentum {
  status: MomentumStatus;
  summary: string;
  dimensions: MomentumDimension[];
}

export type DriftVerdict = "ON_TRACK" | "PROGRAM_ISSUE" | "ADHERENCE_ISSUE" | "LIFE_FRICTION" | "INSUFFICIENT_DATA";

export interface DriftItem {
  aspect: "FREQUENCY" | "PROGRESSION" | "HABITS" | "DURATION";
  planned: string;
  actual: string;
  gapPct: number | null; // negative = under plan
  material: boolean;
  explanation: string;
}

export interface DriftReport {
  verdict: DriftVerdict;
  headline: string;
  rationale: string;
  items: DriftItem[];
}

export interface FrictionProfile {
  total: number;
  top: { category: FrictionCategory; count: number; sharePct: number }[];
  pattern: string | null;
  questions: string[];
}

export interface CheckInSummary {
  progress: Trend;
  training: Trend;
  nutrition: Trend;
  recovery: Trend;
  mainIssue: string | null;
  coachingFocus: string | null;
  highlights: string[];
  concerns: string[];
}

export interface WeeklyReviewSummary {
  status: "ON_TRACK" | "WATCH" | "NEEDS_ATTENTION" | "NEW";
  whatChanged: string[];
  wentWell: string[];
  wentWrong: string[];
  needsAttention: string[];
  possibleAction: string | null;
  metrics: { sessionsDone: number; sessionsPlanned: number; checkInDone: boolean; weightDeltaKg: number | null };
}

export type MissedSessionOption = {
  kind: "MOVE" | "COMPRESS" | "COACH_REVIEW" | "SKIP";
  title: string;
  detail: string;
  recommended: boolean;
};
