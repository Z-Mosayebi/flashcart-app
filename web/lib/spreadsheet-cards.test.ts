/**
 * Tests for direct spreadsheet-to-card mapping.
 *
 * This path has no model in it, so nothing downstream will paper over a wrong
 * column guess: a term/meaning mix-up ships a deck of backwards cards. These
 * tests are the only thing standing between a mis-detected header and that.
 */

import { describe, expect, it } from "vitest";
import {
  buildCardsFromRows,
  detectColumns,
  rowsToMarkdown,
} from "@/lib/spreadsheet-cards";

describe("detectColumns", () => {
  it("detects English headers", () => {
    const rows = [
      ["German", "Meaning", "Example"],
      ["fehlen", "to be missing", "Fehlt dir etwas?"],
    ];

    const detection = detectColumns(rows);

    expect(detection.mappable).toBe(true);
    expect(detection.hasHeaderRow).toBe(true);
    expect(detection.columns.map((c) => c.role)).toEqual(["term", "meaning", "example"]);
  });

  it("detects German headers", () => {
    const rows = [
      ["Wort", "Bedeutung", "Beispielsatz", "Thema"],
      ["fehlen", "vermissen", "Fehlt dir etwas?", "Dativ"],
    ];

    expect(detectColumns(rows).columns.map((c) => c.role)).toEqual([
      "term",
      "meaning",
      "example",
      "topic",
    ]);
  });

  it("detects Persian headers", () => {
    // The learner this was built for labels columns in Persian.
    const rows = [
      ["آلمانی", "معنی", "مثال"],
      ["fehlen", "کم بودن", "Fehlt dir etwas?"],
    ];

    const detection = detectColumns(rows);

    expect(detection.mappable).toBe(true);
    expect(detection.columns.map((c) => c.role)).toEqual(["term", "meaning", "example"]);
  });

  it("prefers the example role when a header could match two roles", () => {
    // "Wort im Satz" contains a term keyword but names an example.
    const rows = [
      ["Vokabel", "Bedeutung", "Wort im Satz"],
      ["fehlen", "vermissen", "Fehlt dir etwas?"],
    ];

    expect(detectColumns(rows).columns[2].role).toBe("example");
  });

  it("falls back to term/meaning ordering when there is no header", () => {
    const rows = [
      ["fehlen", "to be missing"],
      ["ankommen", "to arrive"],
    ];

    const detection = detectColumns(rows);

    expect(detection.hasHeaderRow).toBe(false);
    expect(detection.mappable).toBe(true);
    expect(detection.columns.map((c) => c.role)).toEqual(["term", "meaning"]);
    // No row is consumed as a header, so both pairs survive.
    expect(detection.rowCount).toBe(2);
  });

  it("is not mappable when no meaning column can be identified", () => {
    const rows = [
      ["Notes", "Comments", "Other"],
      ["something", "something else", "more"],
    ];

    const detection = detectColumns(rows);

    expect(detection.mappable).toBe(false);
    expect(detection.reason).toBeTruthy();
  });

  it("reports an empty sheet rather than claiming it is mappable", () => {
    expect(detectColumns([]).mappable).toBe(false);
    expect(detectColumns([["", ""]]).mappable).toBe(false);
  });

  it("reports a header-only sheet as having no rows", () => {
    const detection = detectColumns([["German", "Meaning"]]);

    expect(detection.mappable).toBe(false);
    expect(detection.reason).toContain("no rows");
  });
});

describe("buildCardsFromRows", () => {
  const rows = [
    ["German", "Meaning", "Example"],
    ["fehlen", "to be missing", "Fehlt dir etwas?"],
  ];

  it("builds cards in both directions", () => {
    // Recognising a word and producing it are different skills; production is
    // the one this product exists to train, so it must not be dropped.
    const cards = buildCardsFromRows(rows, detectColumns(rows));

    const recognition = cards.find((c) => c.prompt.includes('What does "fehlen"'));
    const production = cards.find((c) => c.prompt.includes("How do you say"));

    expect(recognition?.answer).toBe("to be missing");
    expect(production?.answer).toBe("fehlen");
  });

  it("adds a cloze card matching the conjugated form in the example", () => {
    // Notes list the infinitive but use it conjugated: "fehlen" vs "Fehlt dir
    // etwas?". Requiring an exact match would drop the cloze card for nearly
    // every real row, and the answer has to be the form the sentence needs.
    const cards = buildCardsFromRows(rows, detectColumns(rows));
    const cloze = cards.find((c) => c.type === "CLOZE");

    expect(cloze?.prompt).toContain("_____");
    expect(cloze?.prompt).not.toContain("Fehlt");
    expect(cloze?.answer).toBe("Fehlt");
  });

  it("skips the cloze card when no form of the term appears", () => {
    const unrelated = [
      ["German", "Meaning", "Example"],
      ["fehlen", "to be missing", "Ein ganz anderer Satz."],
    ];

    const cards = buildCardsFromRows(unrelated, detectColumns(unrelated));

    expect(cards.some((c) => c.type === "CLOZE")).toBe(false);
  });

  it("blanks a multi-word term on its first significant word", () => {
    const phrase = [
      ["German", "Meaning", "Example"],
      ["in Verlegenheit geraten", "to get embarrassed", "Ich bin in Verlegenheit geraten."],
    ];

    const cloze = buildCardsFromRows(phrase, detectColumns(phrase)).find(
      (c) => c.type === "CLOZE"
    );

    expect(cloze?.prompt).toContain("_____");
  });

  it("uses a topic column when present, and a default otherwise", () => {
    const withTopic = [
      ["German", "Meaning", "Topic"],
      ["fehlen", "to be missing", "Dativ verbs"],
    ];
    expect(buildCardsFromRows(withTopic, detectColumns(withTopic))[0].topicName).toBe(
      "Dativ verbs"
    );

    const withoutTopic = [
      ["German", "Meaning"],
      ["fehlen", "to be missing"],
    ];
    expect(
      buildCardsFromRows(withoutTopic, detectColumns(withoutTopic), {
        defaultTopic: "My vocabulary",
      })[0].topicName
    ).toBe("My vocabulary");
  });

  it("skips rows missing either half of the pair", () => {
    // A card whose answer is blank cannot be graded, so the row is dropped
    // rather than turned into an ungradeable card.
    const partial = [
      ["German", "Meaning"],
      ["fehlen", "to be missing"],
      ["ankommen", ""],
      ["", "to arrive"],
    ];

    const cards = buildCardsFromRows(partial, detectColumns(partial));

    expect(cards.every((c) => c.answer.trim().length > 0)).toBe(true);
    expect(cards.some((c) => c.prompt.includes("ankommen"))).toBe(false);
  });

  it("does not consume the first data row when there is no header", () => {
    const headerless = [
      ["fehlen", "to be missing"],
      ["ankommen", "to arrive"],
    ];

    const cards = buildCardsFromRows(headerless, detectColumns(headerless));

    expect(cards.some((c) => c.answer === "fehlen")).toBe(true);
    expect(cards.some((c) => c.answer === "ankommen")).toBe(true);
  });

  it("handles a term containing regex metacharacters", () => {
    // Terms are interpolated into a RegExp for the cloze blank; an unescaped
    // "(" would throw and take the whole import down with it.
    const tricky = [
      ["German", "Meaning", "Example"],
      ["auffallen (+ Dativ)", "to stand out", "Mir ist auffallen (+ Dativ) aufgefallen."],
    ];

    expect(() => buildCardsFromRows(tricky, detectColumns(tricky))).not.toThrow();
  });

  it("keeps Persian meanings intact", () => {
    const persian = [
      ["آلمانی", "معنی"],
      ["fehlen", "کم بودن"],
    ];

    const cards = buildCardsFromRows(persian, detectColumns(persian));

    expect(cards.some((c) => c.answer === "کم بودن")).toBe(true);
  });
});

describe("rowsToMarkdown", () => {
  it("renders rows as a readable grid and drops blank ones", () => {
    const text = rowsToMarkdown([
      ["German", "Meaning"],
      ["fehlen", "to be missing"],
      ["", ""],
    ]);

    expect(text).toBe("German | Meaning\nfehlen | to be missing");
  });
});
