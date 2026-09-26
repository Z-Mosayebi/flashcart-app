/** Fired after anything that can change XP, so the HUD refetches. */
export const PROGRESS_EVENT = "flashcard:progress";

export function announceProgress(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESS_EVENT));
}
