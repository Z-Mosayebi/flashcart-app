import { describe, expect, it } from "vitest";
import {
  PLAN_LIMITS,
  atLimit,
  dayKey,
  extendPremium,
  isAdminEmail,
  isTrialDays,
  isValidTimeZone,
  limitFor,
  parseAdminEmails,
  planFor,
  resolveTimeZone,
  startOfDay,
} from "@/lib/plans";

const at = (iso: string) => new Date(iso);

describe("planFor", () => {
  const now = at("2026-09-26T12:00:00Z");
  it("is free without a premium date", () => expect(planFor(null, now)).toBe("free"));
  it("is premium before the end date", () =>
    expect(planFor(at("2026-09-27T00:00:00Z"), now)).toBe("premium"));
  it("is free once the end date is reached", () => expect(planFor(now, now)).toBe("free"));
  it("is free after the end date", () => expect(planFor(at("2026-09-01T00:00:00Z"), now)).toBe("free"));
});

describe("extendPremium", () => {
  const now = at("2026-09-26T12:00:00Z");
  const DAY = 86_400_000;
  it("starts from now when not premium", () =>
    expect(extendPremium(null, 7, now).getTime()).toBe(now.getTime() + 7 * DAY));
  it("starts from now when premium already ended", () =>
    expect(extendPremium(at("2026-09-01T00:00:00Z"), 14, now).getTime()).toBe(now.getTime() + 14 * DAY));
  it("adds to an active premium", () => {
    const until = at("2026-10-01T00:00:00Z");
    expect(extendPremium(until, 30, now).getTime()).toBe(until.getTime() + 30 * DAY);
  });
});

describe("isTrialDays", () => {
  it("accepts 7, 14 and 30 only", () => {
    expect([7, 14, 30].every(isTrialDays)).toBe(true);
    expect([0, 1, 31, "7", null].some(isTrialDays)).toBe(false);
  });
});

describe("startOfDay (Europe/Berlin)", () => {
  it("summer: midnight is 22:00 UTC the day before", () =>
    expect(startOfDay(at("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z"));
  it("summer: 23:30 UTC is already the next Berlin day", () =>
    expect(startOfDay(at("2026-06-30T23:30:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z"));
  it("winter: midnight is 23:00 UTC the day before", () =>
    expect(startOfDay(at("2026-01-15T08:00:00Z")).toISOString()).toBe("2026-01-14T23:00:00.000Z"));
  it("DST switch day (29 Mar 2026) starts at 23:00 UTC", () =>
    expect(startOfDay(at("2026-03-29T12:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z"));
});

describe("dayKey", () => {
  it("uses the Berlin calendar date", () => {
    expect(dayKey(at("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(dayKey(at("2026-06-30T21:30:00Z"))).toBe("2026-06-30");
  });
});

describe("admin emails", () => {
  it("parses a messy list", () =>
    expect(parseAdminEmails(" Zhmosayebi@Gmail.com , ,other@x.de ")).toEqual([
      "zhmosayebi@gmail.com",
      "other@x.de",
    ]));
  it("matches case-insensitively", () =>
    expect(isAdminEmail("ZHMOSAYEBI@gmail.com", "zhmosayebi@gmail.com")).toBe(true));
  it("matches no one when unset or empty", () => {
    expect(isAdminEmail("a@b.c", undefined)).toBe(false);
    expect(isAdminEmail("a@b.c", "")).toBe(false);
    expect(isAdminEmail(null, "a@b.c")).toBe(false);
  });
});

describe("limits", () => {
  const usage = { graded: 30, tutor: 9, documents: 1 };
  it("maps kinds to plan limits", () => {
    expect(limitFor(PLAN_LIMITS.free, "graded")).toBe(30);
    expect(limitFor(PLAN_LIMITS.free, "tutor")).toBe(10);
    expect(limitFor(PLAN_LIMITS.premium, "documents")).toBe(10);
  });
  it("is at the limit when usage reaches it", () => {
    const state = { admin: false, limits: PLAN_LIMITS.free, usage };
    expect(atLimit(state, "graded")).toBe(true);
    expect(atLimit(state, "tutor")).toBe(false);
    expect(atLimit(state, "documents")).toBe(true);
  });
  it("never limits admins", () =>
    expect(atLimit({ admin: true, limits: PLAN_LIMITS.free, usage }, "graded")).toBe(false));
});

describe("time zones", () => {
  it("validates IANA zone names", () => {
    expect(isValidTimeZone("Asia/Tehran")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
  it("falls back to Berlin for unknown zones", () => {
    expect(resolveTimeZone("Mars/Base")).toBe("Europe/Berlin");
    expect(resolveTimeZone(null)).toBe("Europe/Berlin");
    expect(resolveTimeZone("Asia/Tehran")).toBe("Asia/Tehran");
  });
  it("starts the day at the user's own midnight", () =>
    expect(startOfDay(at("2026-01-15T08:00:00Z"), "Asia/Tehran").toISOString()).toBe(
      "2026-01-14T20:30:00.000Z"
    ));
});
