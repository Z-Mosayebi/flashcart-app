"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { usePreferences, ThemePref } from "@/components/PreferencesProvider";
import { LOCALES, LOCALE_LABELS, Locale } from "@/lib/i18n";
import SpeakButton from "@/components/SpeakButton";
import NotionConnect from "@/components/NotionConnect";
import UserAvatar from "@/components/UserAvatar";

/** Segmented control used for both language and theme. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  idPrefix,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  idPrefix: string;
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "relative rounded-lg px-4 py-2 text-sm transition-colors",
              active ? "text-white" : "text-ink-muted hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={`${idPrefix}-seg`}
                className="absolute inset-0 rounded-lg bg-brand"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPanel() {
  const { t, locale, setLocale, theme, setTheme, autoPlayAudio, setAutoPlayAudio } =
    usePreferences();
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>

      {/* Who's signed in — confirms which account the settings below apply to,
          which matters once someone has both a Google and a password login. */}
      {session?.user && (
        <section className="card-surface flex items-center gap-4 p-5 sm:p-6">
          <UserAvatar
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            size={52}
          />
          <div className="min-w-0">
            {session.user.name && (
              <p className="truncate font-medium">{session.user.name}</p>
            )}
            <p className="truncate text-sm text-ink-muted">{session.user.email}</p>
          </div>
        </section>
      )}

      {/* Notion — the content source, so it leads. Suspense because
          NotionConnect reads the ?notion= OAuth result from the URL. */}
      <Suspense fallback={<div className="skeleton h-56 w-full" />}>
        <NotionConnect />
      </Suspense>

      {/* Interface language */}
      <section className="card-surface p-5 sm:p-6">
        <h2 className="font-medium">{t("settings.language")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("settings.languageHint")}</p>
        <div className="mt-4">
          <Segmented<Locale>
            idPrefix="locale"
            value={locale}
            onChange={setLocale}
            options={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
          />
        </div>
      </section>

      {/* Appearance */}
      <section className="card-surface p-5 sm:p-6">
        <h2 className="font-medium">{t("settings.theme")}</h2>
        <div className="mt-4">
          <Segmented<ThemePref>
            idPrefix="theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: t("settings.theme.light") },
              { value: "dark", label: t("settings.theme.dark") },
              { value: "system", label: t("settings.theme.system") },
            ]}
          />
        </div>
      </section>

      {/* Audio */}
      <section className="card-surface p-5 sm:p-6">
        <h2 className="font-medium">{t("settings.audio")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("settings.audioHint")}</p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <label htmlFor="autoplay" className="text-sm">
            {t("settings.audioAuto")}
          </label>
          <button
            id="autoplay"
            role="switch"
            aria-checked={autoPlayAudio}
            onClick={() => setAutoPlayAudio(!autoPlayAudio)}
            className={clsx(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
              autoPlayAudio ? "bg-brand" : "bg-line"
            )}
          >
            <motion.span
              layout
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className={clsx(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow",
                autoPlayAudio ? "right-1" : "left-1"
              )}
            />
          </button>
        </div>

        {/* Let people hear the voice their device will actually use. */}
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-line px-4 py-3">
          <SpeakButton
            text="Der Grund, weswegen ich Deutsch lerne, ist meine Arbeit."
            size="sm"
          />
          <p lang="de" className="text-german text-sm text-ink-muted">
            Der Grund, weswegen ich Deutsch lerne, ist meine Arbeit.
          </p>
        </div>
      </section>
    </div>
  );
}
