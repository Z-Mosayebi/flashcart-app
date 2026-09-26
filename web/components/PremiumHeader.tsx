"use client";

import { usePreferences } from "@/components/PreferencesProvider";

export default function PremiumHeader() {
  const { t } = usePreferences();
  return (
    <header className="space-y-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t("premium.title")}</h1>
      <p className="text-ink-muted">{t("premium.subtitle")}</p>
    </header>
  );
}
