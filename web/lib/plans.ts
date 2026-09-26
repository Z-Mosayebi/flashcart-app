/**
 * Plan rules: what a free or premium account may do, and when "today" starts.
 *
 * Pure functions only, so the rules are unit-tested without a database. Usage
 * is counted elsewhere (lib/entitlements.ts) from rows the app already writes.
 */

export type PlanName = "free" | "premium";
export type LimitKind = "graded" | "tutor" | "documents";

export interface PlanLimits {
  /** Imported documents in total (Drive + upload). The starter deck is not one. */
  documents: number;
  /** Answers graded by the model per day. */
  gradedPerDay: number;
  /** Tutor replies per day. */
  tutorPerDay: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: { documents: 1, gradedPerDay: 30, tutorPerDay: 10 },
  premium: { documents: 10, gradedPerDay: 200, tutorPerDay: 50 },
};

/** Trial lengths the admin can grant. */
export const TRIAL_DAY_OPTIONS = [7, 14, 30] as const;
export type TrialDays = (typeof TRIAL_DAY_OPTIONS)[number];

export function isTrialDays(value: unknown): value is TrialDays {
  return typeof value === "number" && (TRIAL_DAY_OPTIONS as readonly number[]).includes(value);
}

/**
 * Daily limits reset at midnight in the user's own zone (User.timeZone, as
 * reported by their browser). This is the fallback when that is unknown.
 */
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** True for a zone name Intl understands, e.g. "Asia/Tehran". */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone to compute a user's day in: theirs if valid, else the default. */
export function resolveTimeZone(tz?: string | null): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

const DAY_MS = 86_400_000;

/** Premium lasts until the end date; reaching it means free again. */
export function planFor(premiumUntil: Date | null, now: Date = new Date()): PlanName {
  return premiumUntil && premiumUntil.getTime() > now.getTime() ? "premium" : "free";
}

/** Extends an active premium, or starts a new one from now. */
export function extendPremium(current: Date | null, days: number, now: Date = new Date()): Date {
  const from = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  return new Date(from + days * DAY_MS);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far the zone's wall clock is ahead of UTC at `date`, in ms. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * The instant today began in `timeZone`. The offset is taken at that date's
 * UTC midnight, which is 01:00-02:00 local, before any DST switch (02:00-03:00).
 */
export function startOfDay(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): Date {
  const p = zonedParts(now, timeZone);
  const utcMidnight = Date.UTC(p.year, p.month - 1, p.day);
  return new Date(utcMidnight - offsetMs(new Date(utcMidnight), timeZone));
}

/** The calendar date of `date` in `timeZone`, as YYYY-MM-DD. */
export function dayKey(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** ADMIN_EMAILS is comma-separated; tolerate spaces, case and empty entries. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_EMAILS
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}

export function limitFor(limits: PlanLimits, kind: LimitKind): number {
  if (kind === "documents") return limits.documents;
  return kind === "graded" ? limits.gradedPerDay : limits.tutorPerDay;
}

export function atLimit(
  state: { admin: boolean; limits: PlanLimits; usage: Record<LimitKind, number> },
  kind: LimitKind
): boolean {
  if (state.admin) return false;
  return state.usage[kind] >= limitFor(state.limits, kind);
}

/**
 * Whether an imported document uses up part of the document allowance.
 * Removed documents still count (removing one must not make room for
 * another while its cards stay), but an import that failed without
 * producing anything does not — it gave the learner nothing.
 */
export function countsAsDocument(doc: {
  status: "PENDING" | "IMPORTING" | "COMPLETE" | "FAILED";
  topicCount: number;
}): boolean {
  return !(doc.status === "FAILED" && doc.topicCount === 0);
}
