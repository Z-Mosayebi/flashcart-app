/**
 * The per-card review flow: a wrong or partial first answer earns exactly one
 * retry, with the reference answer held back until the card is finished so
 * the retry is a real attempt rather than copying.
 *
 * Only the first answer moves the card between Leitner boxes (see
 * /api/review/submit); the retry is practice.
 */

export type Verdict = "CORRECT" | "PARTIAL" | "INCORRECT";
export type CardStage = "retry-offered" | "done";

export function afterAnswer(result: Verdict, isRetry: boolean): CardStage {
  return result !== "CORRECT" && !isRetry ? "retry-offered" : "done";
}

/** Whether the reference answer may be shown after this answer. */
export function shouldReveal(result: Verdict, isRetry: boolean): boolean {
  return afterAnswer(result, isRetry) === "done";
}

export type VerdictLabelKey = "review.correct" | "review.partial" | "review.incorrect" | "review.showAnswerLabel";

/** "Try it again" invites a retry, so after the retry it would be a false promise. */
export function verdictLabelKey(result: Verdict, isRetry: boolean): VerdictLabelKey {
  if (result === "CORRECT") return "review.correct";
  if (isRetry) return "review.showAnswerLabel";
  return result === "PARTIAL" ? "review.partial" : "review.incorrect";
}
