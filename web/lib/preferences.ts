/** Validation for PATCH /api/me/preferences. */

import { isLocale, type Locale } from "@/lib/i18n";
import { isValidTimeZone } from "@/lib/plans";
import { isDailyGoal, type DailyGoal } from "@/lib/game";

export interface PreferencesUpdate {
  locale?: Locale;
  timeZone?: string;
  /** Allowed goals only; whether 30 is permitted is checked by the route (premium). */
  dailyGoal?: DailyGoal;
}

/**
 * The valid subset of a preferences body, or null when nothing in it is
 * valid. Fields are independent: the time zone is reported automatically by
 * the browser, so a bad locale must not block it (or the reverse).
 */
export function preferencesUpdate(body: unknown): PreferencesUpdate | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const update: PreferencesUpdate = {};
  if (isLocale(b.locale)) update.locale = b.locale;
  if (isValidTimeZone(b.timeZone)) update.timeZone = b.timeZone;
  if (isDailyGoal(b.dailyGoal)) update.dailyGoal = b.dailyGoal;

  return Object.keys(update).length > 0 ? update : null;
}
