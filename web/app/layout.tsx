import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";
import NavBar from "@/components/NavBar";
import GameHud from "@/components/GameHud";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

const inter = Inter({
  subsets: ["latin", "latin-ext"], // latin-ext covers German ä ö ü ß
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Flashcard" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "learn German",
    "German flashcards",
    "speak German",
    "German grammar practice",
    "AI German tutor",
    "spaced repetition",
    "Deutsch lernen",
    "Karteikarten Deutsch",
  ],
  authors: [{ name: "Parastoo Mosayebi", url: "https://parastoomosayebi.de" }],
  creator: "Parastoo Mosayebi",
  openGraph: {
    title: SITE_TITLE,
    description:
      "Spoken flashcards from your own notes, an AI tutor that teaches the grammar step by step, and reviews timed to how you actually did.",
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    alternateLocale: ["de_DE"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "Spoken German flashcards from your own notes, with an AI tutor that teaches the grammar step by step.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1020" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang={session?.user?.locale ?? "en"} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so there's no light flash
            on a dark-mode device. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse((localStorage.getItem('flashcard:prefs')||localStorage.getItem('flashcart:prefs'))||'{}');var t=p.theme||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <Providers session={session}>
          <NavBar />
          <GameHud />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
