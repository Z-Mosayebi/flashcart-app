import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";
import NavBar from "@/components/NavBar";

const inter = Inter({
  subsets: ["latin", "latin-ext"], // latin-ext covers German ä ö ü ß
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flashcart — Learn German you can actually speak",
  description:
    "Spoken German flashcards built from your own notes, with an AI tutor that keeps asking until the grammar sticks. Spaced repetition that adapts to how hard you struggled.",
  openGraph: {
    title: "Flashcart — Learn German you can actually speak",
    description:
      "Spoken flashcards from your own notes, an AI tutor that pushes until you produce the grammar yourself, and reviews timed to how you actually did.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
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
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('flashcart:prefs')||'{}');var t=p.theme||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <Providers session={session}>
          <NavBar />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
