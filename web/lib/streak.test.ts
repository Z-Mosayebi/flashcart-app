import { describe, expect, it } from "vitest";
import { computeStreak } from "@/lib/streak";

const at = (iso: string) => new Date(iso);
const BERLIN = "Europe/Berlin";

describe("computeStreak", () => {
  it("counts consecutive local days ending today", () => {
    const dates = [at("2026-07-01T08:00:00Z"), at("2026-07-02T08:00:00Z"), at("2026-07-03T08:00:00Z")];
    expect(computeStreak(dates, at("2026-07-03T18:00:00Z"), BERLIN)).toBe(3);
  });

  it("still counts when the last practice was yesterday", () => {
    const dates = [at("2026-07-01T08:00:00Z"), at("2026-07-02T08:00:00Z")];
    expect(computeStreak(dates, at("2026-07-03T18:00:00Z"), BERLIN)).toBe(2);
  });

  it("is zero after a missed day", () => {
    expect(computeStreak([at("2026-07-01T08:00:00Z")], at("2026-07-03T18:00:00Z"), BERLIN)).toBe(0);
    expect(computeStreak([], at("2026-07-03T18:00:00Z"), BERLIN)).toBe(0);
  });

  it("breaks on a gap", () => {
    const dates = [at("2026-06-29T08:00:00Z"), at("2026-07-01T08:00:00Z"), at("2026-07-02T08:00:00Z")];
    expect(computeStreak(dates, at("2026-07-02T18:00:00Z"), BERLIN)).toBe(2);
  });

  it("uses the user's own calendar, not UTC", () => {
    // 21:00 UTC is already the next day in Tehran (00:30).
    const dates = [at("2026-01-13T21:00:00Z"), at("2026-01-14T21:00:00Z")];
    expect(computeStreak(dates, at("2026-01-15T08:00:00Z"), "Asia/Tehran")).toBe(2);
    expect(computeStreak(dates, at("2026-01-15T08:00:00Z"), "UTC")).toBe(2);
    expect(computeStreak([at("2026-01-14T21:00:00Z")], at("2026-01-15T08:00:00Z"), "Asia/Tehran")).toBe(1);
    expect(computeStreak([at("2026-01-14T21:00:00Z")], at("2026-01-16T08:00:00Z"), "UTC")).toBe(0);
  });

  it("is not broken by the DST switch (29 Mar 2026 in Berlin)", () => {
    const dates = [at("2026-03-28T09:00:00Z"), at("2026-03-29T08:00:00Z"), at("2026-03-29T22:10:00Z")];
    // 00:30 on 30 March, Berlin time — the day after the 23-hour day.
    expect(computeStreak(dates, at("2026-03-29T22:30:00Z"), BERLIN)).toBe(3);
  });
});
