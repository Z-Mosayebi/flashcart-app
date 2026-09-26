import { describe, expect, it } from "vitest";
import { preferencesUpdate } from "@/lib/preferences";

describe("preferencesUpdate", () => {
  it("accepts a locale, a time zone, or both", () => {
    expect(preferencesUpdate({ locale: "de" })).toEqual({ locale: "de" });
    expect(preferencesUpdate({ timeZone: "Asia/Tehran" })).toEqual({ timeZone: "Asia/Tehran" });
    expect(preferencesUpdate({ locale: "en", timeZone: "America/Toronto" })).toEqual({
      locale: "en",
      timeZone: "America/Toronto",
    });
  });
  it("drops invalid fields but keeps valid ones", () =>
    expect(preferencesUpdate({ locale: "xx", timeZone: "Europe/Berlin" })).toEqual({ timeZone: "Europe/Berlin" }));
  it("is null when nothing valid remains", () => {
    expect(preferencesUpdate({ timeZone: "Mars/Base" })).toBeNull();
    expect(preferencesUpdate({})).toBeNull();
    expect(preferencesUpdate(null)).toBeNull();
  });
});

describe("preferencesUpdate — daily goal", () => {
  it("accepts an offered goal", () => expect(preferencesUpdate({ dailyGoal: 20 })).toEqual({ dailyGoal: 20 }));
  it("drops a goal that isn't offered", () => expect(preferencesUpdate({ dailyGoal: 7 })).toBeNull());
});
