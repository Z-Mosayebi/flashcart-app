/**
 * Leitner-method spaced repetition scheduler, blended with an AI-estimated
 * difficulty score (0 = trivial, 1 = very hard) that the FastAPI service
 * produces from the user's recent answer history (see ai-service/app/services/difficulty.py).
 *
 * Classic Leitner: 5 boxes, each with a review interval. Correct answer -> promote
 * one box (or stay at box 5). Incorrect/partial -> demote to box 1.
 *
 * The AI blend: instead of a flat interval per box, we scale the interval by
 * (1 - aiDifficulty), so a card the model thinks you're shaky on comes back sooner
 * even if you got the literal Leitner box right — this is what makes scheduling
 * "adaptive" rather than pure mechanical Leitner.
 */

import { AttemptResult } from "@prisma/client";

export const LEITNER_BOXES = [1, 2, 3, 4, 5] as const;

// Base review interval per box, in hours.
const BASE_INTERVAL_HOURS: Record<number, number> = {
  1: 4, // same-day, frequent
  2: 24, // next day
  3: 24 * 3, // 3 days
  4: 24 * 7, // 1 week
  5: 24 * 21, // 3 weeks — "mastered", light maintenance
};

export interface ScheduleInput {
  currentBox: number;
  result: AttemptResult;
  aiDifficulty: number; // 0..1, from the difficulty scorer
}

export interface ScheduleOutput {
  nextBox: number;
  dueAt: Date;
}

export function scheduleNextReview({ currentBox, result, aiDifficulty }: ScheduleInput): ScheduleOutput {
  let nextBox: number;

  if (result === "CORRECT") {
    nextBox = Math.min(currentBox + 1, 5);
  } else if (result === "PARTIAL") {
    // Partial credit: stay in the same box rather than promote or fully demote.
    nextBox = currentBox;
  } else {
    nextBox = 1;
  }

  const baseHours = BASE_INTERVAL_HOURS[nextBox];

  // Clamp difficulty influence so a single AI misjudgment can't push a card to
  // near-zero or absurdly long intervals. Scales interval between 40% and 100%.
  const clampedDifficulty = Math.min(Math.max(aiDifficulty, 0), 1);
  const difficultyMultiplier = 1 - clampedDifficulty * 0.6;

  const effectiveHours = Math.max(baseHours * difficultyMultiplier, 0.5);
  const dueAt = new Date(Date.now() + effectiveHours * 60 * 60 * 1000);

  return { nextBox, dueAt };
}

/** Fraction of cards mastered (box 5) out of all cards a user has touched. */
export function computeMasteryStats(progress: { box: number }[]) {
  const total = progress.length;
  const byBox = Object.fromEntries(LEITNER_BOXES.map((b) => [b, 0])) as Record<number, number>;
  for (const p of progress) byBox[p.box] = (byBox[p.box] ?? 0) + 1;
  const mastered = byBox[5] ?? 0;
  return {
    total,
    byBox,
    masteredPct: total === 0 ? 0 : Math.round((mastered / total) * 100),
  };
}
