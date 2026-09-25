/** The premium request form: allowed answers, labels, and validation. */

export const GOALS = ["EXAM", "WORK", "IMMIGRATION", "STUDY", "PERSONAL", "OTHER"] as const;
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "UNKNOWN"] as const;
export const PAY_OPTIONS = ["NOTHING", "UNDER_5", "FROM_5_TO_10", "OVER_10"] as const;

export type Goal = (typeof GOALS)[number];
export type Level = (typeof LEVELS)[number];
export type PayOption = (typeof PAY_OPTIONS)[number];

export const MAX_CONTACT_CHARS = 100;
export const MAX_MESSAGE_CHARS = 1000;

/** English labels for the admin dashboard and notifications. */
export const GOAL_LABELS: Record<Goal, string> = {
  EXAM: "Exam (Goethe, telc…)",
  WORK: "Work",
  IMMIGRATION: "Moving to a German-speaking country",
  STUDY: "Study",
  PERSONAL: "Personal interest",
  OTHER: "Other",
};

export const PAY_LABELS: Record<PayOption, string> = {
  NOTHING: "Nothing — only if free",
  UNDER_5: "Under €5/month",
  FROM_5_TO_10: "€5–10/month",
  OVER_10: "Over €10/month",
};

export interface PremiumRequestInput {
  goal: Goal;
  level: Level;
  willingToPay: PayOption;
  contact: string | null;
  message: string | null;
}

export type ValidationResult =
  | { ok: true; value: PremiumRequestInput }
  | { ok: false; error: string };

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

export function validatePremiumRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;

  if (!oneOf(GOALS, b.goal)) return { ok: false, error: "invalid_goal" };
  if (!oneOf(LEVELS, b.level)) return { ok: false, error: "invalid_level" };
  if (!oneOf(PAY_OPTIONS, b.willingToPay)) return { ok: false, error: "invalid_pay" };

  const contact = optionalText(b.contact, MAX_CONTACT_CHARS);
  if (contact === undefined) return { ok: false, error: "invalid_contact" };
  const message = optionalText(b.message, MAX_MESSAGE_CHARS);
  if (message === undefined) return { ok: false, error: "invalid_message" };

  return { ok: true, value: { goal: b.goal, level: b.level, willingToPay: b.willingToPay, contact, message } };
}
