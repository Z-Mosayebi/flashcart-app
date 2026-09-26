import { describe, expect, it } from "vitest";
import { tagExplanation, tagLabel } from "@/lib/error-tags";

describe("tagLabel", () => {
  it("gives known tags a readable name in each language", () => {
    expect(tagLabel("verb-tense", "en")).toBe("Verb tense");
    expect(tagLabel("verb-tense", "de")).toBe("Zeitform");
    expect(tagLabel("case-declension", "en")).toBe("Case");
  });
  it("normalises case and underscores", () => expect(tagLabel("Word_Order", "en")).toBe("Word order"));
  it("humanises unknown tags", () => expect(tagLabel("some-new-tag", "en")).toBe("Some new tag"));
});

describe("tagExplanation", () => {
  it("explains every tag the grader is told to use", () => {
    for (const tag of [
      "word-order",
      "case-declension",
      "verb-conjugation",
      "preposition-choice",
      "article-agreement",
      "gender-agreement",
      "wrong-verb-position",
      "spelling",
      "missing-element",
      "verb-tense",
    ]) {
      expect(tagExplanation(tag, "en"), tag).toBeTruthy();
      expect(tagExplanation(tag, "de"), tag).toBeTruthy();
    }
  });
  it("has no explanation for unknown tags", () => expect(tagExplanation("some-new-tag", "en")).toBeNull());
});
