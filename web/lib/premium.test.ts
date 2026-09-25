import { describe, expect, it } from "vitest";
import { MAX_CONTACT_CHARS, MAX_MESSAGE_CHARS, validatePremiumRequest } from "@/lib/premium";

const valid = { goal: "EXAM", level: "B1", willingToPay: "FROM_5_TO_10" };

describe("validatePremiumRequest", () => {
  it("accepts the required fields and trims optional ones", () => {
    expect(validatePremiumRequest({ ...valid, contact: "  @parastoo ", message: " Hallo " })).toEqual({
      ok: true,
      value: { ...valid, contact: "@parastoo", message: "Hallo" },
    });
  });
  it("turns blank optional fields into null", () => {
    expect(validatePremiumRequest({ ...valid, contact: "   ", message: "" })).toEqual({
      ok: true,
      value: { ...valid, contact: null, message: null },
    });
  });
  it("rejects unknown enum values", () => {
    expect(validatePremiumRequest({ ...valid, goal: "FUN" }).ok).toBe(false);
    expect(validatePremiumRequest({ ...valid, level: "D1" }).ok).toBe(false);
    expect(validatePremiumRequest({ ...valid, willingToPay: 5 }).ok).toBe(false);
  });
  it("rejects over-long optional fields", () => {
    expect(validatePremiumRequest({ ...valid, contact: "x".repeat(MAX_CONTACT_CHARS + 1) }).ok).toBe(false);
    expect(validatePremiumRequest({ ...valid, message: "x".repeat(MAX_MESSAGE_CHARS + 1) }).ok).toBe(false);
  });
  it("rejects a non-object body", () => {
    expect(validatePremiumRequest(null).ok).toBe(false);
    expect(validatePremiumRequest("x").ok).toBe(false);
  });
});
