import { describe, expect, it } from "vitest";
import { reserve, type UsageStore } from "@/lib/usage";

/** An in-memory store whose every call yields, so parallel callers interleave. */
function memoryStore() {
  const rows = new Map<string, number>();
  let next = 0;
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const store: UsageStore = {
    async add() {
      await tick();
      const id = String(next++);
      rows.set(id, 1);
      return id;
    },
    async count() {
      await tick();
      return rows.size;
    },
    async remove(id) {
      await tick();
      rows.delete(id);
    },
  };
  return { store, rows };
}

describe("reserve", () => {
  it("allows exactly the limit when calls arrive one at a time", async () => {
    const { store } = memoryStore();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await reserve(store, 3));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false]);
  });

  it("never admits more than the limit under parallel calls", async () => {
    const { store, rows } = memoryStore();
    const results = await Promise.all(Array.from({ length: 100 }, () => reserve(store, 30)));
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(30);
    // Rejected callers leave nothing behind.
    expect(rows.size).toBe(results.filter((r) => r.ok).length);
  });

  it("frees the slot when a reservation is released", async () => {
    const { store } = memoryStore();
    const first = await reserve(store, 1);
    expect((await reserve(store, 1)).ok).toBe(false);
    if (first.ok) await store.remove(first.id);
    expect((await reserve(store, 1)).ok).toBe(true);
  });
});
