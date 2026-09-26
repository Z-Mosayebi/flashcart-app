import { describe, expect, it } from "vitest";
import { cardPosition, deckLayers, rarityForBox, showStreak } from "@/lib/card-look";

describe("rarityForBox", () => {
  it("climbs from common to legendary with the Leitner box", () => {
    expect([1, 2, 3, 4, 5].map(rarityForBox)).toEqual(["common", "uncommon", "rare", "epic", "legendary"]);
  });
  it("clamps a corrupt box", () => {
    expect(rarityForBox(0)).toBe("common");
    expect(rarityForBox(9)).toBe("legendary");
    expect(rarityForBox(Number.NaN)).toBe("common");
  });
});

describe("deckLayers", () => {
  it("shows up to three cards behind the current one", () => {
    expect(deckLayers(10)).toBe(3);
    expect(deckLayers(4)).toBe(3);
    expect(deckLayers(3)).toBe(2);
    expect(deckLayers(2)).toBe(1);
  });
  it("shows nothing behind the last card", () => {
    expect(deckLayers(1)).toBe(0);
    expect(deckLayers(0)).toBe(0);
  });
});

describe("cardPosition", () => {
  it("numbers the current card within the session", () => {
    expect(cardPosition(16, 16)).toEqual({ index: 1, total: 16 });
    expect(cardPosition(16, 13)).toEqual({ index: 4, total: 16 });
    expect(cardPosition(16, 1)).toEqual({ index: 16, total: 16 });
  });
  it("never shows a position past the total", () => expect(cardPosition(3, 0)).toEqual({ index: 3, total: 3 }));
});

describe("showStreak", () => {
  it("only celebrates two or more in a row", () => {
    expect(showStreak(0)).toBe(false);
    expect(showStreak(1)).toBe(false);
    expect(showStreak(2)).toBe(true);
  });
});
