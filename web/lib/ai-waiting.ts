/**
 * What to tell a learner while the AI works. The free model sometimes answers
 * in a second and sometimes queues for most of a minute, so the message moves
 * on as the wait grows: reassurance first, then an honest explanation.
 */

export type WaitingStage = "working" | "still" | "busy";

export function waitingStage(elapsedMs: number): WaitingStage {
  if (elapsedMs >= 15_000) return "busy";
  if (elapsedMs >= 5_000) return "still";
  return "working";
}
