import { translate } from "@/lib/i18n";

/**
 * The site's public address. Vercel reports the production domain itself
 * (the custom domain once one is added), so links in the sitemap, the
 * canonical tag and the share image follow a domain change on the next deploy.
 * NEXT_PUBLIC_SITE_URL overrides it when set.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Flashcard";
export const SITE_TITLE = "Flashcard — AI German flashcards & speaking tutor";
export const SITE_DESCRIPTION =
  "Learn to speak German with spoken flashcards made from your own notes, an AI tutor that teaches grammar step by step, and spaced repetition that adapts to you. Free to start.";

/** Pages that are part of the signed-in app: never indexed. */
export const PRIVATE_PATHS = ["/review", "/tutor", "/dashboard", "/settings", "/premium", "/admin", "/api/"];

/** The home page FAQ in English, for its structured data. The visible FAQ
 *  reads the same dictionary keys, so the two can't drift apart. */
export const FAQ: { q: string; a: string }[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  q: translate("en", `landing.faq.q${n}`),
  a: translate("en", `landing.faq.a${n}`),
}));
