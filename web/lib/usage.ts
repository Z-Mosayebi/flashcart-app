/**
 * Reserving a unit of a daily allowance before doing the expensive thing.
 *
 * Counting existing rows and *then* calling the model leaves the whole model
 * latency as a race window: a hundred parallel requests all see "under the
 * limit" before any of them has written its row. Reserving first closes it.
 *
 * Insert-then-count admits at most `limit` callers, however they interleave:
 * every caller's count includes its own row and every row inserted before it,
 * so the last of any `limit + 1` successful callers to count would have seen
 * at least `limit + 1` rows — a contradiction. Losers delete their row, so a
 * rejected request costs nothing. This needs no lock, which matters behind a
 * connection pooler where session-level advisory locks don't hold.
 */

export interface UsageStore {
  /** Records one unit of use now; returns its id. */
  add(): Promise<string>;
  /** Units recorded in the current window, including any just added. */
  count(): Promise<number>;
  remove(id: string): Promise<void>;
}

export type Reservation = { ok: true; id: string } | { ok: false };

export async function reserve(store: UsageStore, limit: number): Promise<Reservation> {
  const id = await store.add();
  if ((await store.count()) > limit) {
    await store.remove(id);
    return { ok: false };
  }
  return { ok: true, id };
}
