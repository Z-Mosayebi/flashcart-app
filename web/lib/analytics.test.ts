import { describe, expect, it } from "vitest";
import { countBy, latestPerUser, usersOverDailyCap } from "@/lib/analytics";

describe("countBy", () => {
  it("counts every key, including zeros", () =>
    expect(countBy(["A", "B", "A"], ["A", "B", "C"] as const)).toEqual({ A: 2, B: 1, C: 0 }));
});

describe("latestPerUser", () => {
  it("keeps each user's newest row", () => {
    const rows = [
      { userId: "u1", createdAt: new Date("2026-09-01"), v: 1 },
      { userId: "u1", createdAt: new Date("2026-09-05"), v: 2 },
      { userId: "u2", createdAt: new Date("2026-09-02"), v: 3 },
    ];
    expect(latestPerUser(rows).map((r) => r.v).sort()).toEqual([2, 3]);
  });
});

describe("usersOverDailyCap", () => {
  const t = (iso: string) => new Date(iso);
  it("counts users who reached the cap on some Berlin day", () => {
    const rows = [
      // u1: 2 rows on the same Berlin day (23:30 UTC in summer is the next day)
      { userId: "u1", createdAt: t("2026-06-30T23:30:00Z") },
      { userId: "u1", createdAt: t("2026-07-01T09:00:00Z") },
      // u2: 2 rows on different Berlin days
      { userId: "u2", createdAt: t("2026-06-30T20:00:00Z") },
      { userId: "u2", createdAt: t("2026-06-30T23:30:00Z") },
      // u3: over the cap but excluded (premium or admin)
      { userId: "u3", createdAt: t("2026-07-01T09:00:00Z") },
      { userId: "u3", createdAt: t("2026-07-01T10:00:00Z") },
    ];
    expect(usersOverDailyCap(rows, 2, new Set(["u3"]), () => "Europe/Berlin")).toBe(1);
  });

  it("buckets each user's rows in that user's own zone", () => {
    // 20:00 and 21:00 UTC on 14 Jan: same day in Berlin (21:00, 22:00),
    // different days in Tehran (23:30 on the 14th, 00:30 on the 15th).
    const rows = [
      { userId: "berlin", createdAt: t("2026-01-14T20:00:00Z") },
      { userId: "berlin", createdAt: t("2026-01-14T21:00:00Z") },
      { userId: "tehran", createdAt: t("2026-01-14T20:00:00Z") },
      { userId: "tehran", createdAt: t("2026-01-14T21:00:00Z") },
    ];
    const zoneOf = (id: string) => (id === "tehran" ? "Asia/Tehran" : "Europe/Berlin");
    expect(usersOverDailyCap(rows, 2, new Set(), zoneOf)).toBe(1);
  });
});
