"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";

export default function ForgotPasswordForm() {
  const { t } = usePreferences();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // The endpoint answers the same way for known and unknown addresses, so
      // there is nothing to branch on beyond the request itself failing.
      if (!res.ok) {
        setError(t("auth.error.server"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("auth.error.server"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-surface mx-auto w-full max-w-md p-6 sm:p-8"
    >
      {sent ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("auth.forgot.sent.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t("auth.forgot.sent.body", { email })}
          </p>
          <Link href="/signin" className="btn-primary mt-6 w-full">
            {t("auth.forgot.back")}
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("auth.forgot.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{t("auth.forgot.subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="email">
                {t("auth.email")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-2.5 text-sm text-critical"
              >
                {error}
              </motion.p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t("common.loading") : t("auth.forgot.cta")}
            </button>
          </form>

          <Link
            href="/signin"
            className="mt-5 block w-full text-center text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            {t("auth.forgot.back")}
          </Link>
        </>
      )}
    </motion.div>
  );
}
