"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import type { TranslationKey } from "@/lib/i18n";
import {
  GOALS,
  LEVELS,
  MAX_CONTACT_CHARS,
  MAX_MESSAGE_CHARS,
  PAY_OPTIONS,
  type Goal,
  type Level,
  type PayOption,
} from "@/lib/premium";

interface Latest {
  status: "PENDING" | "APPROVED" | "REJECTED";
}

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
            value === o ? "border-brand bg-brand text-white" : "border-line text-ink-muted hover:text-ink"
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export default function PremiumRequestForm() {
  const { t, locale } = usePreferences();
  const [latest, setLatest] = useState<Latest | null>(null);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [pay, setPay] = useState<PayOption | null>(null);
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/premium/request", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setLatest(d.request);
        setPremiumUntil(d.premiumUntil);
      })
      .catch(() => setError(t("common.error")))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!goal || !level || !pay || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, level, willingToPay: pay, contact, message }),
      });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      setSent(true);
    } catch {
      setError(t("common.error"));
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return <div className="skeleton h-64 w-full" />;

  const active = premiumUntil && new Date(premiumUntil) > new Date();
  const date = premiumUntil
    ? new Date(premiumUntil).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" })
    : "";

  if (sent) return <p className="card-surface p-6 text-ink">{t("premium.sent")}</p>;
  if (active) return <p className="card-surface p-6 text-ink">{t("premium.status.APPROVED", { date })}</p>;
  if (latest?.status === "PENDING") return <p className="card-surface p-6 text-ink">{t("premium.status.PENDING")}</p>;

  return (
    <div className="card-surface space-y-6 p-5 sm:p-7">
      {latest?.status === "REJECTED" && <p className="text-sm text-ink-muted">{t("premium.status.REJECTED")}</p>}

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-ink">{t("premium.goal")}</legend>
        <Choice options={GOALS} value={goal} onChange={setGoal} label={(g) => t(`premium.goal.${g}` as TranslationKey)} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-ink">{t("premium.level")}</legend>
        <Choice
          options={LEVELS}
          value={level}
          onChange={setLevel}
          label={(l) => (l === "UNKNOWN" ? t("premium.level.UNKNOWN") : l)}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-ink">{t("premium.pay")}</legend>
        <Choice options={PAY_OPTIONS} value={pay} onChange={setPay} label={(p) => t(`premium.pay.${p}` as TranslationKey)} />
      </fieldset>

      <label className="block space-y-1">
        <span className="font-medium text-ink">{t("premium.contact")}</span>
        <input
          className="field"
          value={contact}
          maxLength={MAX_CONTACT_CHARS}
          onChange={(e) => setContact(e.target.value)}
        />
        <span className="block text-xs text-ink-faint">{t("premium.contactHint")}</span>
      </label>

      <label className="block space-y-1">
        <span className="font-medium text-ink">{t("premium.message")}</span>
        <textarea
          className="field min-h-[5rem] resize-none"
          value={message}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {error && <p className="text-sm text-critical">{error}</p>}

      <button onClick={submit} disabled={!goal || !level || !pay || sending} className="btn-primary">
        {sending ? t("premium.sending") : t("premium.submit")}
      </button>
    </div>
  );
}
