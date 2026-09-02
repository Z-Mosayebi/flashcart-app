/**
 * Tests for the web tier's sectioner.
 *
 * This mirrors ai-service/tests/test_sectioner.py deliberately: the two
 * implementations must agree, and duplicated assertions are what catches them
 * drifting apart. If a case is added here, add it there too.
 */

import { describe, expect, it } from "vitest";
import { splitIntoSections } from "@/lib/sectioner";

/** Distinct filler per section — identical bodies are deduplicated by design. */
function body(chars: number, filler = "Beispielsatz. "): string {
  return filler.repeat(Math.ceil(chars / filler.length)).slice(0, chars);
}

const titles = (sections: { title: string }[]) => sections.map((s) => s.title);

describe("splitIntoSections", () => {
  it("splits on headings", () => {
    const doc = `### Dativ mit fehlen
${body(400, "Fehlt dir etwas? ")}

### Konjunktiv II
${body(400, "Ich haette gern. ")}`;

    expect(titles(splitIntoSections(doc).generable)).toEqual([
      "Dativ mit fehlen",
      "Konjunktiv II",
    ]);
  });

  it("strips markdown emphasis from titles", () => {
    // Drive's text export bakes emphasis into headings.
    const doc = `### **fehlen (+ Dativ)**\n${body(400)}`;

    expect(splitIntoSections(doc).generable[0].title).toBe("fehlen (+ Dativ)");
  });

  it("keeps deeper headings inside their section", () => {
    const doc = `### Passiv mit worden
${body(300)}

##### 1. Beispiele
${body(300, "Es wurde gemacht. ")}`;

    const { generable } = splitIntoSections(doc);

    expect(generable).toHaveLength(1);
    expect(generable[0].body).toContain("1. Beispiele");
  });

  it("skips alphabetical index buckets as reference", () => {
    const doc = `### A
${body(400, "abheben, ankommen. ")}

### B
${body(400, "begegnen, bestellen. ")}

### fehlen (+ Dativ)
${body(400, "Fehlt dir etwas? ")}`;

    const { generable, skipped } = splitIntoSections(doc);

    expect(titles(generable)).toEqual(["fehlen (+ Dativ)"]);
    expect(skipped.every((s) => s.skipReason === "reference")).toBe(true);
  });

  it("skips a titled index section", () => {
    const doc = `## Wortschatz-Index (A-Z)
${body(800)}

### Konjunktiv II
${body(400, "Ich haette gern. ")}`;

    expect(titles(splitIntoSections(doc).generable)).toEqual(["Konjunktiv II"]);
  });

  it("skips sections too short to carry a card", () => {
    const doc = `### Zu kurz
${body(150, "Kurzer Text. ")}

### Lang genug
${body(400, "Langer Text. ")}`;

    const { generable, skipped } = splitIntoSections(doc);

    expect(titles(generable)).toEqual(["Lang genug"]);
    expect(skipped[0].skipReason).toBe("too_short");
  });

  it("generates a duplicated section only once", () => {
    // Copy-pasted notes must not spend a second model call on the same text.
    const repeated = body(400);
    const doc = `### lassen\n${repeated}\n\n### lassen\n${repeated}`;

    const { generable, skipped } = splitIntoSections(doc);

    expect(generable).toHaveLength(1);
    expect(skipped[0].skipReason).toBe("duplicate");
  });

  it("splits an oversized section into parts", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) =>
      `Absatz ${i}. ${body(900, `Text ${i}. `)}`
    ).join("\n\n");
    const doc = `### Leseverstehen B2\n${paragraphs}`;

    const { generable } = splitIntoSections(doc);

    expect(generable.length).toBeGreaterThan(1);
    expect(generable.every((s) => s.body.length <= 6000)).toBe(true);
    // Parts stay attributable to the section they came from.
    expect(generable.every((s) => s.title === "Leseverstehen B2")).toBe(true);
    expect(generable[0].part).toBe(1);
  });

  it("splits oversized sections on paragraph boundaries", () => {
    // Cards cite source snippets, so a split must not cut mid-sentence.
    const paragraphs = Array.from({ length: 10 }, (_, i) =>
      `Absatz ${i}. ${body(900, `Text ${i}. `)}`
    ).join("\n\n");

    for (const section of splitIntoSections(`### Lang\n${paragraphs}`).generable) {
      expect(section.body.trimStart().startsWith("Absatz")).toBe(true);
    }
  });

  it("treats content before the first heading as a section", () => {
    const doc = `${body(400)}\n\n### Erste Überschrift\n${body(400, "Anders. ")}`;

    expect(splitIntoSections(doc, "Meine Notizen").generable[0].title).toBe("Meine Notizen");
  });

  it("accounts for every section, reporting skips rather than dropping them", () => {
    const doc = `### A
${body(300, "abheben, ankommen. ")}

### Kurz
${body(50, "Kurz. ")}

### Echte Lektion
${body(400, "Fehlt dir etwas? ")}`;

    const { sections, generable, skipped } = splitIntoSections(doc);

    expect(sections).toHaveLength(3);
    expect(generable.length + skipped.length).toBe(sections.length);
    expect(skipped.every((s) => s.skipReason)).toBe(true);
  });

  it("preserves Persian glosses alongside German", () => {
    const doc = "### fehlen (+ Dativ)\n" + "**fehlen** — کم بودن، جای خالی داشتن\n".repeat(30);

    const section = splitIntoSections(doc).generable[0];

    expect(section.body).toContain("کم بودن");
    expect(section.body).toContain("fehlen");
  });

  it("produces no sections for an empty document", () => {
    expect(splitIntoSections("").sections).toEqual([]);
  });
});
