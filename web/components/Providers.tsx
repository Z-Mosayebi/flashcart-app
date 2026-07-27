"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { Locale, isLocale } from "@/lib/i18n";

export default function Providers({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  // Seed the UI language from the signed-in user's saved preference so the
  // first paint is already in their language.
  const initialLocale: Locale = isLocale(session?.user?.locale)
    ? session.user.locale
    : "en";

  return (
    <SessionProvider session={session}>
      <PreferencesProvider initialLocale={initialLocale}>{children}</PreferencesProvider>
    </SessionProvider>
  );
}
