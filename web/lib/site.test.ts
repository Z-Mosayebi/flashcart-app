import { describe, expect, it } from "vitest";
import { FAQ, PRIVATE_PATHS, resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("prefers the explicit address and drops a trailing slash", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://flashcard.example.de/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }),
    ).toBe("https://flashcard.example.de");
  });

  it("uses Vercel's production domain when no address is set", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "flashcard.example.de" })).toBe("https://flashcard.example.de");
  });

  it("falls back to localhost in development", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });
});

describe("site content", () => {
  it("keeps every signed-in page out of the index", () => {
    for (const p of ["/review", "/tutor", "/dashboard", "/settings", "/premium", "/admin", "/api/"]) {
      expect(PRIVATE_PATHS).toContain(p);
    }
    expect(PRIVATE_PATHS).not.toContain("/");
  });

  it("builds the FAQ structured data from real English text", () => {
    expect(FAQ).toHaveLength(5);
    for (const { q, a } of FAQ) {
      expect(q).not.toMatch(/^landing\./);
      expect(a.length).toBeGreaterThan(40);
    }
  });
});
