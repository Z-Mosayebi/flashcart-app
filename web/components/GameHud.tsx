"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePreferences } from "@/components/PreferencesProvider";
import UserAvatar from "@/components/UserAvatar";
import GoalRing from "@/components/GoalRing";
import LevelUpCelebration from "@/components/LevelUpCelebration";
import { usePlayerProgress } from "@/components/usePlayerProgress";

/** The player bar under the nav: level, XP, streak, today's goal. */
export default function GameHud() {
  const { status, data: session } = useSession();
  const pathname = usePathname();
  const { t } = usePreferences();
  const { progress, levelUp, dismissLevelUp } = usePlayerProgress();

  if (status !== "authenticated" || pathname === "/" || !progress) return null;

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
        <div className="card-surface flex items-center gap-3 px-3 py-2">
          <div className="relative shrink-0">
            <UserAvatar name={session?.user?.name} email={session?.user?.email} image={session?.user?.image} size={34} />
            <span className="absolute -bottom-1 -right-2 rounded-full bg-gold px-1.5 text-[9px] font-extrabold text-canvas">
              {t("game.lvShort", { n: progress.level })}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-[11px] text-ink-muted">
              <span>{t("game.level", { n: progress.level })}</span>
              <span className="tabular-nums">
                {progress.xp} / {progress.nextLevelXp} XP
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress.pct}%`,
                  backgroundImage: "linear-gradient(90deg, rgb(var(--brand)), rgb(var(--gold)))",
                }}
              />
            </div>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-caution" title={t("dashboard.streak")}>
            🔥 {progress.streak}
          </span>
          {/* The ring needs room: hidden on phones, where the bar stays compact. */}
          <span className="hidden sm:block">
            <GoalRing done={progress.today.done} goal={progress.today.goal} size={40} />
          </span>
        </div>
      </div>
      <AnimatePresence>
        {levelUp !== null && <LevelUpCelebration level={levelUp} onClose={dismissLevelUp} />}
      </AnimatePresence>
    </>
  );
}
