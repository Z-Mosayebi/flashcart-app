import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Landing from "@/components/Landing";
import { requireUserId } from "@/lib/auth";
import { FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Structured data: what the app is, who makes it, and the FAQ — read by
// Google (rich results) and by AI assistants.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      inLanguage: ["en", "de"],
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      creator: { "@id": `${SITE_URL}/#creator` },
    },
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#creator`,
      name: "Parastoo Mosayebi",
      url: "https://parastoomosayebi.de",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default async function Home() {
  // Signed-in users don't need the pitch — send them straight to work.
  const userId = await requireUserId();
  if (userId) redirect("/review");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Landing />
    </>
  );
}
