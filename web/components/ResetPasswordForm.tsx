"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";

type Status = "checking" | "invalid" | "ready" | "done";

export default function ResetPasswordForm() {
  const { t } = usePreferences();
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check the link before showing the form, so an expired one doesn't waste the
  // user's time typing a password that can't be saved.
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    let active = true;
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((body) => {
        if (active) setStatus(body.valid ? "ready" : "invalid");
      })
      .catch(() => {
        if (active) setStatus("invalid");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (password.length < 8) {
      setError(t("auth.error.weakPassword"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "invalid_token") {
          setStatus("invalid");
        } else {
          setError(
            body.error === "weak_password"
              ? t("auth.error.weakPassword")
              : t("auth.error.server")
          );
        }
        return;
      }

      setStatus("done");
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
      {status === "checking" && (
        <p className="py-8 text-center text-sm text-ink-muted">
          {t("auth.reset.checking")}
        </p>
      )}

      {status === "invalid" && (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("auth.reset.invalid.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("auth.reset.invalid.body")}</p>
          <Link href="/forgot-password" className="btn-primary mt-6 w-full">
            {t("auth.reset.invalid.cta")}
          </Link>
        </>
      )}

      {status === "done" && (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("auth.reset.done.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("auth.reset.done.body")}</p>
          <button
            type="button"
            onClick={() => router.push("/signin")}
            className="btn-primary mt-6 w-full"
          >
            {t("auth.signInCta")}
          </button>
        </>
      )}

      {status === "ready" && (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("auth.reset.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{t("auth.reset.subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="password">
                {t("auth.reset.password")}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="confirm">
                {t("auth.reset.confirm")}
              </label>
              <input
                id="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {busy ? t("common.loading") : t("auth.reset.cta")}
            </button>
          </form>
        </>
      )}
    </motion.div>
  );
}
