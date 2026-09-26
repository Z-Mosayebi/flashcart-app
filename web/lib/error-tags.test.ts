import { describe, expect, it } from "vitest";
import { GRADER_TAGS, tagExplanation, tagLabel } from "@/lib/error-tags";

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
  it("explains the extra tags the grader may use", () => {
    for (const tag of [
      "vocabulary",
      "punctuation",
      "capitalization",
      "adjective-ending",
      "plural-form",
      "separable-verb",
      "off-topic",
    ]) {
      expect(tagExplanation(tag, "en"), tag).toBeTruthy();
      expect(tagExplanation(tag, "de"), tag).toBeTruthy();
    }
  });
  it("maps common synonyms onto known tags", () => {
    expect(tagLabel("word-choice", "en")).toBe(tagLabel("vocabulary", "en"));
    expect(tagLabel("capitalisation", "en")).toBe(tagLabel("capitalization", "en"));
    expect(tagLabel("plural", "en")).toBe(tagLabel("plural-form", "en"));
    expect(tagLabel("tense", "en")).toBe(tagLabel("verb-tense", "en"));
  });
  it("still explains a tag it has never seen", () => {
    expect(tagExplanation("some-new-tag", "en")).toMatch(/expected answer/i);
    expect(tagExplanation("some-new-tag", "de")).toBeTruthy();
  });
});

describe("GRADER_TAGS", () => {
  it("lists every tag the grader is allowed to use, each explained", () => {
    expect(GRADER_TAGS.length).toBe(17);
    for (const tag of GRADER_TAGS) expect(tagExplanation(tag, "en")).not.toMatch(/expected answer/i);
  });
});
