"use client";

import { useState } from "react";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import { usePlan } from "@/components/usePlan";
import { usePlayerProgress } from "@/components/usePlayerProgress";
import { DAILY_GOALS, goalAllowed, type DailyGoal } from "@/lib/game";
import { announceProgress } from "@/lib/progress-events";

/** Cards per day: 5 / 10 / 20 / 30. 30 is locked on the free plan (the server enforces it too). */
export default function DailyGoalPicker() {
  const { t } = usePreferences();
  const { plan } = usePlan();
  const { progress } = usePlayerProgress();
  const [saving, setSaving] = useState<DailyGoal | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);

  const current = chosen ?? progress?.today.goal ?? null;
  const who = { premium: plan?.plan === "premium", admin: !!plan?.admin };

  async function choose(goal: DailyGoal) {
    setSaving(goal);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyGoal: goal }),
      });
      if (res.ok) {
        setChosen(goal);
        announceProgress();
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <h2 className="font-medium">{t("settings.goal")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("settings.goalHint")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {DAILY_GOALS.map((g) => {
          const locked = !goalAllowed(g, who);
          const active = current === g;
          return (
            <button
              key={g}
              type="button"
              disabled={locked || saving !== null}
              aria-pressed={active}
              onClick={() => void choose(g)}
              className={clsx(
                "flex min-h-11 min-w-14 flex-col items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors",
                active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:bg-surface-raised",
                locked && "cursor-not-allowed opacity-60"
              )}
            >
              <span>{locked ? `🔒 ${g}` : g}</span>
              {locked && <span className="text-[10px] font-medium text-gold">{t("settings.goalPremium")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
