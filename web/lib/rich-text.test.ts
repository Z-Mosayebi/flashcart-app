import { describe, expect, it } from "vitest";
import { splitQuoted } from "@/lib/rich-text";

describe("splitQuoted", () => {
  it("returns plain text untouched", () =>
    expect(splitQuoted("No quotes here.")).toEqual([{ text: "No quotes here.", quoted: false }]));

  it("marks single-quoted phrases, keeping the quotes", () =>
    expect(splitQuoted("Use 'ist' and 'zu + Infinitiv' here.")).toEqual([
      { text: "Use ", quoted: false },
      { text: "'ist'", quoted: true },
      { text: " and ", quoted: false },
      { text: "'zu + Infinitiv'", quoted: true },
      { text: " here.", quoted: false },
    ]));

  it("handles a quote at the very start and end", () =>
    expect(splitQuoted("'weswegen'")).toEqual([{ text: "'weswegen'", quoted: true }]));

  it("handles typographic quotes", () =>
    expect(splitQuoted("after ‘ist’, use")).toEqual([
      { text: "after ", quoted: false },
      { text: "‘ist’", quoted: true },
      { text: ", use", quoted: false },
    ]));

  it("leaves apostrophes inside words alone", () => {
    expect(splitQuoted("Versuch's nochmal, don't worry")).toEqual([
      { text: "Versuch's nochmal, don't worry", quoted: false },
    ]);
    expect(splitQuoted("You don't need 'dass' here")).toEqual([
      { text: "You don't need ", quoted: false },
      { text: "'dass'", quoted: true },
      { text: " here", quoted: false },
    ]);
  });

  it("ignores an unmatched quote", () =>
    expect(splitQuoted("an 'open quote with no end")).toEqual([
      { text: "an 'open quote with no end", quoted: false },
    ]));
});
