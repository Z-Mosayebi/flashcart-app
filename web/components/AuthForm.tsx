"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";

type Mode = "signin" | "signup";

export default function AuthForm({
  initialMode = "signin",
  googleEnabled,
}: {
  initialMode?: Mode;
  googleEnabled: boolean;
}) {
  const { t, locale } = usePreferences();
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/review";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      if (mode === "signup") {
        if (password.length < 8) {
          setError(t("auth.error.weakPassword"));
          return;
        }

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, locale }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(
            body.error === "email_taken"
              ? t("auth.error.exists")
              : body.error === "weak_password"
                ? t("auth.error.weakPassword")
                : body.error === "server_error" || res.status >= 500
                  ? t("auth.error.server")
                  : t("auth.error.generic")
          );
          return;
        }
      }

      // Both paths finish by signing in with the same credentials.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t("auth.error.invalid"));
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError(t("auth.error.generic"));
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
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {mode === "signin" ? t("auth.signIn.title") : t("auth.signUp.title")}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {mode === "signin" ? t("auth.signIn.subtitle") : t("auth.signUp.subtitle")}
      </p>

      {googleEnabled && (
        <>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="btn-ghost mt-6 w-full"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" />
            </svg>
            {t("auth.google")}
          </button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs uppercase tracking-wide text-ink-faint">{t("auth.or")}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className={googleEnabled ? "space-y-3" : "mt-6 space-y-3"}>
        <AnimatePresence mode="popLayout">
          {mode === "signup" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="name">
                {t("auth.name")}
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="mb-1.5 block text-sm text-ink-muted" htmlFor="email">
            {t("auth.email")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label className="block text-sm text-ink-muted" htmlFor="password">
              {t("auth.password")}
            </label>
            {mode === "signin" && (
              <Link
                href="/forgot-password"
                className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                {t("auth.forgot.link")}
              </Link>
            )}
          </div>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {busy ? t("common.loading") : mode === "signin" ? t("auth.signInCta") : t("auth.signUpCta")}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
        }}
        className="mt-5 w-full text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
      >
        {mode === "signin" ? t("auth.toSignUp") : t("auth.toSignIn")}
      </button>
    </motion.div>
  );
}
