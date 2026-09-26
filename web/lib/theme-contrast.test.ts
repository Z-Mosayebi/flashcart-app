import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** Token values ("r g b") declared in the first block matching `selector {`. */
function tokens(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, number[]> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) out[m[1]] = [+m[2], +m[3], +m[4]];
  return out;
}

const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each([[":root"], [".dark"]])("%s game palette", (sel) => {
  const t = tokens(sel);
  it("defines the gold accent", () => expect(t.gold).toBeDefined());
  it("keeps body text readable on the page and on panels", () => {
    expect(contrast(t.ink, t.canvas)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.ink, t.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(t["ink-muted"], t.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps white button text readable on the brand colour", () =>
    expect(contrast([255, 255, 255], t.brand)).toBeGreaterThanOrEqual(4.5));
  it("keeps white button text readable across the whole button gradient", () =>
    expect(contrast([255, 255, 255], t["brand-2"])).toBeGreaterThanOrEqual(4.5));
  it("keeps gold text (XP, badges) readable on the page and on panels", () => {
    expect(contrast(t.gold, t.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.gold, t.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
