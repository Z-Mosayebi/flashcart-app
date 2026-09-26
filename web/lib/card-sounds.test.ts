import { describe, expect, it } from "vitest";
import { sampleFor } from "@/lib/card-sounds";

describe("sampleFor", () => {
  it("uses the recorded cards for dealing and flipping", () => {
    expect(sampleFor("deal")).toBe("/sounds/deal.mp3");
    expect(sampleFor("flip")).toBe("/sounds/flip.mp3");
  });
  it("keeps the synthesised chimes for results", () => {
    for (const s of ["correct", "wrong", "complete", "levelUp"] as const) expect(sampleFor(s)).toBeNull();
  });
});
