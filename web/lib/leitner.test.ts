import { describe, expect, it } from "vitest";
import { computeMasteryStats, scheduleNextReview } from "@/lib/leitner";

const NOW = new Date("2026-01-01T00:00:00Z");
const hoursUntil = (d: Date) => (d.getTime() - NOW.getTime()) / 3_600_000;

describe("scheduleNextReview", () => {
  it("promotes one box on a correct answer", () => {
    const out = scheduleNextReview({ currentBox: 2, result: "CORRECT", aiDifficulty: 0 }, NOW);
    expect(out.nextBox).toBe(3);
    expect(hoursUntil(out.dueAt)).toBe(72);
  });

  it("never promotes past box 5", () => {
    const out = scheduleNextReview({ currentBox: 5, result: "CORRECT", aiDifficulty: 0 }, NOW);
    expect(out.nextBox).toBe(5);
    expect(hoursUntil(out.dueAt)).toBe(24 * 21);
  });

  it("keeps a partial answer in the same box", () => {
    const out = scheduleNextReview({ currentBox: 4, result: "PARTIAL", aiDifficulty: 0 }, NOW);
    expect(out.nextBox).toBe(4);
  });

  it("sends an incorrect answer back to box 1", () => {
    const out = scheduleNextReview({ currentBox: 5, result: "INCORRECT", aiDifficulty: 0 }, NOW);
    expect(out.nextBox).toBe(1);
    expect(hoursUntil(out.dueAt)).toBe(4);
  });

  it("shortens the interval to 40% at maximum difficulty", () => {
    const out = scheduleNextReview({ currentBox: 3, result: "CORRECT", aiDifficulty: 1 }, NOW);
    expect(hoursUntil(out.dueAt)).toBeCloseTo(24 * 7 * 0.4);
  });

  it("clamps out-of-range difficulty", () => {
    const high = scheduleNextReview({ currentBox: 1, result: "CORRECT", aiDifficulty: 5 }, NOW);
    const low = scheduleNextReview({ currentBox: 1, result: "CORRECT", aiDifficulty: -2 }, NOW);
    expect(hoursUntil(high.dueAt)).toBeCloseTo(24 * 0.4);
    expect(hoursUntil(low.dueAt)).toBe(24);
  });

  it("treats NaN difficulty as neutral instead of producing an invalid date", () => {
    const out = scheduleNextReview({ currentBox: 1, result: "CORRECT", aiDifficulty: NaN }, NOW);
    expect(Number.isNaN(out.dueAt.getTime())).toBe(false);
    expect(hoursUntil(out.dueAt)).toBeCloseTo(24 * 0.7);
  });

  it("recovers from an out-of-range stored box", () => {
    const out = scheduleNextReview({ currentBox: 9, result: "PARTIAL", aiDifficulty: 0 }, NOW);
    expect(out.nextBox).toBe(5);
  });
});

describe("computeMasteryStats", () => {
  it("counts box 5 as mastered", () => {
    const stats = computeMasteryStats([{ box: 5 }, { box: 5 }, { box: 1 }, { box: 3 }]);
    expect(stats.total).toBe(4);
    expect(stats.byBox[5]).toBe(2);
    expect(stats.masteredPct).toBe(50);
  });

  it("is zero for no progress", () => {
    expect(computeMasteryStats([]).masteredPct).toBe(0);
  });
});
