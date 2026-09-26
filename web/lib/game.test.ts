import { describe, expect, it } from "vitest";
import {
  collectionFromBoxes,
  goalAllowed,
  goalDays,
  isDailyGoal,
  isLevelUp,
  levelForXp,
  levelProgress,
  levelStartXp,
  xpFromCounts,
} from "@/lib/game";

const zero = { firstCorrect: 0, firstPartial: 0, firstIncorrect: 0, retryCorrect: 0, tutorMessages: 0, topicsMastered: 0, goalDays: 0 };

describe("xpFromCounts", () => {
  it("is 0 for a new user", () => expect(xpFromCounts(zero)).toBe(0));
  it("applies every rule", () => {
    expect(xpFromCounts({ ...zero, firstCorrect: 1 })).toBe(10);
    expect(xpFromCounts({ ...zero, firstPartial: 1 })).toBe(5);
    expect(xpFromCounts({ ...zero, firstIncorrect: 1 })).toBe(2);
    expect(xpFromCounts({ ...zero, retryCorrect: 1 })).toBe(3);
    expect(xpFromCounts({ ...zero, tutorMessages: 1 })).toBe(2);
    expect(xpFromCounts({ ...zero, topicsMastered: 1 })).toBe(25);
    expect(xpFromCounts({ ...zero, goalDays: 1 })).toBe(20);
  });
  it("adds them up", () =>
    expect(xpFromCounts({ firstCorrect: 3, firstPartial: 1, firstIncorrect: 2, retryCorrect: 1, tutorMessages: 4, topicsMastered: 1, goalDays: 2 })).toBe(30 + 5 + 4 + 3 + 8 + 25 + 40));
});

describe("levels", () => {
  it("starts each level at 25·L·(L−1)", () => {
    expect([1, 2, 3, 4, 5].map(levelStartXp)).toEqual([0, 50, 150, 300, 500]);
  });
  it("crosses exactly at the boundary", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(149)).toBe(2);
    expect(levelForXp(150)).toBe(3);
    expect(levelForXp(500)).toBe(5);
  });
  it("reports progress within the level", () => {
    expect(levelProgress(0)).toEqual({ level: 1, levelStartXp: 0, nextLevelXp: 50, pct: 0 });
    expect(levelProgress(320)).toEqual({ level: 4, levelStartXp: 300, nextLevelXp: 500, pct: 10 });
  });
});

describe("daily goal", () => {
  it("accepts only the offered goals", () => {
    expect([5, 10, 20, 30].every(isDailyGoal)).toBe(true);
    expect([0, 7, 50, "10", null].some(isDailyGoal)).toBe(false);
  });
  it("keeps 30 for premium users and admins", () => {
    expect(goalAllowed(30, { premium: false, admin: false })).toBe(false);
    expect(goalAllowed(30, { premium: true, admin: false })).toBe(true);
    expect(goalAllowed(30, { premium: false, admin: true })).toBe(true);
    expect(goalAllowed(20, { premium: false, admin: false })).toBe(true);
  });
  it("counts the days that reached the goal", () => {
    expect(goalDays([12, 9, 10, 3], 10)).toBe(2);
    expect(goalDays([], 10)).toBe(0);
  });
});

describe("collectionFromBoxes", () => {
  it("counts seen cards by rarity and the rest as new", () =>
    expect(collectionFromBoxes([1, 1, 2, 3, 5], 8)).toEqual({ common: 2, uncommon: 1, rare: 1, epic: 0, legendary: 1, new: 3 }));
  it("is all zero for a new user", () =>
    expect(collectionFromBoxes([], 0)).toEqual({ common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, new: 0 }));
});

describe("isLevelUp", () => {
  it("never fires on the first reading", () => expect(isLevelUp(null, 5)).toBe(false));
  it("fires only when the level rises", () => {
    expect(isLevelUp(4, 5)).toBe(true);
    expect(isLevelUp(5, 5)).toBe(false);
    expect(isLevelUp(5, 4)).toBe(false);
  });
});
