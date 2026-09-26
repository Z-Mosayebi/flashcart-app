import { describe, expect, it } from "vitest";
import { countsFromGroups } from "@/lib/progress";

const g = (kind: string, result: string, n: number) => ({ kind, result, _count: { _all: n } });

describe("countsFromGroups", () => {
  it("maps first answers and correct retries; ignores the rest", () =>
    expect(
      countsFromGroups([
        g("FIRST", "CORRECT", 4),
        g("FIRST", "PARTIAL", 2),
        g("FIRST", "INCORRECT", 3),
        g("RETRY", "CORRECT", 1),
        g("RETRY", "INCORRECT", 5),
        g("DONT_KNOW", "INCORRECT", 6),
      ])
    ).toEqual({ firstCorrect: 4, firstPartial: 2, firstIncorrect: 3, retryCorrect: 1 }));
  it("is all zero with no attempts", () =>
    expect(countsFromGroups([])).toEqual({ firstCorrect: 0, firstPartial: 0, firstIncorrect: 0, retryCorrect: 0 }));
});
