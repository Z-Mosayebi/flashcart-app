/**
 * Presentation rules for the collectible review card: rarity follows the
 * Leitner box (a card "levels up" as it is learned), the deck behind it
 * thins out as the session goes on.
 */

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export function rarityForBox(box: number): Rarity {
  const i = Number.isFinite(box) ? Math.min(Math.max(Math.round(box), 1), 5) - 1 : 0;
  return RARITIES[i];
}

/** Cards drawn behind the current one: at most three, none behind the last. */
export function deckLayers(remaining: number): number {
  return Math.min(Math.max(remaining - 1, 0), 3);
}

/** "#index / total" for the card being shown, from the session size and what's left. */
export function cardPosition(total: number, remaining: number): { index: number; total: number } {
  return { index: Math.min(Math.max(total - remaining + 1, 1), total), total };
}

/** A streak badge only once there's a streak to speak of. */
export function showStreak(correctStreak: number): boolean {
  return correctStreak >= 2;
}
