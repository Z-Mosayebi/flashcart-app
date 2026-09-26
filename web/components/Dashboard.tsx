"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import GoalRing from "@/components/GoalRing";
import { usePlayerProgress } from "@/components/usePlayerProgress";
import { RARITIES } from "@/lib/card-look";
import type { TranslationKey } from "@/lib/i18n";

interface TopicMastery {
  topic: string;
  total: number;
  mastered: number;
  pct: number;
}

interface Mistake {
  cardPrompt: string;
  cardAnswer: string;
  topic: string;
  userAnswer: string;
  aiFeedback: string | null;
  errorTags: string[];
  createdAt: string;
}

interface DashboardData {
  overall: { total: number; byBox: Record<string, number>; masteredPct: number };
  dueToday: number;
  totalCards: number;
  streak: number;
  topicMastery: TopicMastery[];
  recentMistakes: Mistake[];
  accuracyPct: number;
  totalAttempts: number;
}

function StatTile({
  label,
  value,
  suffix,
  delay,
}: {
  label: string;
  value: number;
  suffix?: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-surface p-4 sm:p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-3xl">
        {value}
        {suffix && <span className="text-lg text-ink-muted">{suffix}</span>}
      </p>
    </motion.div>
  );
}

export default function Dashboard() {
  const { t } = usePreferences();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { progress } = usePlayerProgress();

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setData)
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-9 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-surface p-8 text-center">
        <p className="text-ink-muted">{error ?? t("common.error")}</p>
      </div>
    );
  }

  if (data.totalCards === 0) {
    return (
      <div className="card-surface px-6 py-14 text-center">
        <h2 className="font-display text-xl font-semibold">{t("dashboard.empty.title")}</h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-muted">{t("dashboard.empty.body")}</p>
      </div>
    );
  }

  const heading = "mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint";
  const today = progress?.today;
  const left = today ? Math.max(today.goal - today.done, 0) : 0;
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h1>

      {/* Today: the goal ring and what's left */}
      {today && (
        <motion.section {...rise(0)}>
          <h2 className={heading}>{t("dashboard.today")}</h2>
          <div className="card-surface flex items-center gap-4 p-4 sm:p-5">
            <GoalRing done={today.done} goal={today.goal} size={74} />
            <p className="text-sm leading-relaxed text-ink-muted">
              {left > 0 ? t("dashboard.goalLeft", { n: left }) : t("dashboard.goalDone")}
            </p>
          </div>
        </motion.section>
      )}

      {/* Play: straight into review */}
      {progress && (
        <motion.div {...rise(0.05)}>
          {progress.dueNow > 0 ? (
            <Link href="/review" className="btn-primary w-full py-4 text-base">
              {t("dashboard.play", { n: progress.dueNow })}
            </Link>
          ) : (
            <p className="card-surface p-4 text-center font-medium text-positive">{t("dashboard.caughtUp")}</p>
          )}
        </motion.div>
      )}

      {/* The collection: cards by rarity, plus the ones not played yet */}
      {progress && (
        <motion.section {...rise(0.1)}>
          <h2 className={heading}>{t("dashboard.collection")}</h2>
          <div className="grid grid-cols-6 gap-2">
            {RARITIES.map((r) => (
              <div
                key={r}
                className={clsx(
                  "holo-card flex aspect-[3/4] flex-col items-center justify-end p-1.5 text-center",
                  `rarity-${r}`
                )}
              >
                <span className="relative text-lg font-extrabold tabular-nums">{progress.collection[r]}</span>
                <span className="relative w-full truncate text-[10px] text-ink-muted">
                  {t(`card.rarity.${r}` as TranslationKey)}
                </span>
              </div>
            ))}
            <div className="card-surface flex aspect-[3/4] flex-col items-center justify-end p-1.5 text-center">
              <span className="text-lg font-extrabold tabular-nums">{progress.collection.new}</span>
              <span className="w-full truncate text-[10px] text-ink-muted">{t("dashboard.new")}</span>
            </div>
          </div>
        </motion.section>
      )}

      {/* Topics */}
      {data.topicMastery.length > 0 && (
        <motion.section {...rise(0.15)}>
          <h2 className={heading}>{t("dashboard.topics")}</h2>
          <div className="card-surface space-y-3.5 p-4 sm:p-5">
            {data.topicMastery.slice(0, 8).map((tm, i) => (
              <div key={tm.topic}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-german">{tm.topic}</span>
                  <span className="shrink-0 tabular-nums text-ink-faint">{tm.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundImage: "linear-gradient(90deg, rgb(var(--brand)), rgb(var(--gold)))" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${tm.pct}%` }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Two quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label={t("dashboard.accuracy")} value={data.accuracyPct} suffix="%" delay={0.2} />
        <StatTile label={t("dashboard.answers")} value={data.totalAttempts} delay={0.25} />
      </div>

      {/* Recent mistakes */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card-surface p-5 sm:p-6"
      >
        <h2 className="mb-4 font-medium">{t("dashboard.recentMistakes")}</h2>
        {data.recentMistakes.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("dashboard.noMistakes")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recentMistakes.map((m, i) => (
              <li key={i} className="py-3.5 first:pt-0 last:pb-0">
                <p className="mb-1 text-xs text-ink-faint">{m.topic}</p>
                <p lang="de" className="text-german text-sm">
                  {m.cardPrompt}
                </p>
                <p className="mt-1.5 text-sm text-critical">
                  <span className="text-ink-faint">✗ </span>
                  {m.userAnswer}
                </p>
                <p lang="de" className="mt-0.5 text-german text-sm text-positive">
                  <span className="text-ink-faint">✓ </span>
                  {m.cardAnswer}
                </p>
                {m.errorTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.errorTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
