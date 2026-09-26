"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";
import SpeakButton from "@/components/SpeakButton";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const FAQ_KEYS = [1, 2, 3, 4, 5] as const;

const SAMPLE = "Der Grund, weswegen ich Deutsch lerne, ist meine Arbeit.";

export default function Landing() {
  const { t, locale, setLocale } = usePreferences();

  const features = [
    {
      titleKey: "landing.feature1.title",
      bodyKey: "landing.feature1.body",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ),
    },
    {
      titleKey: "landing.feature2.title",
      bodyKey: "landing.feature2.body",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      titleKey: "landing.feature3.title",
      bodyKey: "landing.feature3.body",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      ),
    },
  ] as const;

  return (
    <div className="-mt-6 sm:-mt-8">
      {/* Header */}
      <header className="flex items-center justify-between py-5">
        <span className="font-display text-lg font-semibold tracking-tight">Flashcard</span>
        <div className="flex items-center gap-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={
                l === locale
                  ? "rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink"
                  : "rounded-lg px-2.5 py-1 text-xs text-ink-faint hover:text-ink"
              }
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </header>

      {/* Hero */}
      <motion.section
        initial="hidden"
        animate="show"
        transition={{ staggerChildren: 0.08 }}
        className="py-16 text-center sm:py-24"
      >
        <motion.h1
          variants={fadeUp}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl"
        >
          {t("landing.tagline")}
        </motion.h1>

        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-5 max-w-xl text-lg text-ink-muted"
        >
          {t("landing.subtitle")}
        </motion.p>

        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link href="/signin" className="btn-primary w-full sm:w-auto">
            {t("landing.cta")}
          </Link>
          <Link href="/signin" className="btn-ghost w-full sm:w-auto">
            {t("landing.ctaSecondary")}
          </Link>
        </motion.div>

        {/* Live audio demo — the product's differentiator, playable before signup */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-14 max-w-lg"
        >
          <div className="card-surface flex items-center gap-4 p-5 text-left">
            <SpeakButton text={SAMPLE} size="lg" />
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                {t("review.listen")}
              </p>
              <p lang="de" className="text-german">
                {SAMPLE}
              </p>
            </div>
          </div>
        </motion.div>
      </motion.section>

      {/* Features */}
      <section className="grid gap-4 pb-20 sm:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.titleKey}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="card-surface p-6"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              {f.icon}
            </div>
            <h2 className="font-medium">{t(f.titleKey)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t(f.bodyKey)}</p>
          </motion.div>
        ))}
      </section>

      {/* FAQ — plain <details> so it works without JavaScript and search
          engines see every answer. */}
      <section aria-labelledby="faq-title" className="mx-auto max-w-2xl pb-20">
        <h2 id="faq-title" className="mb-5 text-center font-display text-2xl font-semibold tracking-tight">
          {t("landing.faq.title")}
        </h2>
        <div className="space-y-3">
          {FAQ_KEYS.map((n) => (
            <details key={n} className="card-surface group p-0">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium">
                <h3 className="text-base">{t(`landing.faq.q${n}`)}</h3>
                <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-ink-muted">{t(`landing.faq.a${n}`)}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
