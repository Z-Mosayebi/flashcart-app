/** Validation for PATCH /api/me/preferences. */

import { isLocale, type Locale } from "@/lib/i18n";
import { isValidTimeZone } from "@/lib/plans";

export interface PreferencesUpdate {
  locale?: Locale;
  timeZone?: string;
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

  return Object.keys(update).length > 0 ? update : null;
}
