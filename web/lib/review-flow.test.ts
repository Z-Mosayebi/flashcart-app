import { describe, expect, it } from "vitest";
import { afterAnswer, verdictLabelKey, shouldReveal } from "@/lib/review-flow";

describe("afterAnswer", () => {
  it("finishes a card answered correctly first time", () => expect(afterAnswer("CORRECT", false)).toBe("done"));
  it("offers one retry after a wrong or partial first answer", () => {
    expect(afterAnswer("INCORRECT", false)).toBe("retry-offered");
    expect(afterAnswer("PARTIAL", false)).toBe("retry-offered");
  });
  it("never offers a second retry", () => {
    expect(afterAnswer("INCORRECT", true)).toBe("done");
    expect(afterAnswer("PARTIAL", true)).toBe("done");
    expect(afterAnswer("CORRECT", true)).toBe("done");
  });
});

describe("shouldReveal", () => {
  it("keeps the answer hidden while a retry is still possible", () => {
    expect(shouldReveal("INCORRECT", false)).toBe(false);
    expect(shouldReveal("PARTIAL", false)).toBe(false);
  });
  it("reveals once the card is finished", () => {
    expect(shouldReveal("CORRECT", false)).toBe(true);
    expect(shouldReveal("INCORRECT", true)).toBe(true);
  });
});

describe("verdictLabelKey", () => {
  it("encourages on the first miss", () => {
    expect(verdictLabelKey("INCORRECT", false)).toBe("review.incorrect");
    expect(verdictLabelKey("PARTIAL", false)).toBe("review.partial");
  });
  it("doesn't repeat 'try again' after the retry", () => {
    expect(verdictLabelKey("INCORRECT", true)).toBe("review.showAnswerLabel");
    expect(verdictLabelKey("PARTIAL", true)).toBe("review.showAnswerLabel");
  });
  it("is 'correct' whenever the answer is right", () => {
    expect(verdictLabelKey("CORRECT", false)).toBe("review.correct");
    expect(verdictLabelKey("CORRECT", true)).toBe("review.correct");
  });
});

describe("when the learner doesn't know", () => {
  it("skips the retry and finishes the card", () => {
    expect(afterAnswer("INCORRECT", false, true)).toBe("done");
    expect(shouldReveal("INCORRECT", false, true)).toBe(true);
  });
  it("is unchanged when the flag is absent", () => {
    expect(afterAnswer("INCORRECT", false)).toBe("retry-offered");
    expect(afterAnswer("INCORRECT", false, false)).toBe("retry-offered");
  });
});
