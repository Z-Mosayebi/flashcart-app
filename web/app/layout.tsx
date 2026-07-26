import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Flashcart — AI German Tutor",
  description: "Leitner-method flashcards generated from your Notion notes, with an AI tutor loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-neutral-800 px-6 py-4 flex gap-6 items-center">
          <span className="font-semibold tracking-tight">Flashcart</span>
          <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-white">
            Dashboard
          </Link>
          <Link href="/review" className="text-sm text-neutral-400 hover:text-white">
            Review
          </Link>
        </nav>
        <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
