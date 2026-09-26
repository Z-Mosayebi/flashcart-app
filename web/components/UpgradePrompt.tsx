"use client";

import Link from "next/link";
import { usePreferences } from "@/components/PreferencesProvider";
import { usePlan, type LimitKind } from "@/components/usePlan";
import type { TranslationKey } from "@/lib/i18n";

/** Shown wherever a limit is hit: what happened, and how to get more. */
export default function UpgradePrompt({ kind, limit }: { kind: LimitKind; limit: number }) {
  const { t } = usePreferences();
  const { plan } = usePlan();
  const pending = plan?.request?.status === "PENDING";

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-4 text-sm">
      <p className="font-semibold text-ink">{t(`limit.${kind}` as TranslationKey, { limit })}</p>
      {pending ? (
        <p className="mt-1 text-ink-muted">{t("limit.pending")}</p>
      ) : (
        <>
          <p className="mt-1 text-ink-muted">{t("limit.body")}</p>
          <Link href="/premium" className="btn-primary mt-3 inline-flex">
            {t("limit.cta")}
          </Link>
        </>
      )}
      {kind !== "documents" && <p className="mt-3 text-xs text-ink-faint">{t("limit.resets")}</p>}
    </div>
  );
}
