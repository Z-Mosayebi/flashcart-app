"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { isLevelUp } from "@/lib/game";
import { PROGRESS_EVENT } from "@/lib/progress-events";

export interface PlayerProgressDto {
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  pct: number;
  streak: number;
  today: { done: number; goal: number };
  collection: { common: number; uncommon: number; rare: number; epic: number; legendary: number; new: number };
  dueNow: number;
}

/** Progress for the signed-in player; refetches on PROGRESS_EVENT and reports level-ups. */
export function usePlayerProgress() {
  const { status } = useSession();
  const [progress, setProgress] = useState<PlayerProgressDto | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const lastLevel = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/progress", { cache: "no-store" });
      if (!res.ok) return;
      const data: PlayerProgressDto = await res.json();
      if (isLevelUp(lastLevel.current, data.level)) setLevelUp(data.level);
      lastLevel.current = data.level;
      setProgress(data);
    } catch {
      /* the HUD simply keeps its last reading */
    }
  }, []);

  // Keyed on the session: the HUD lives in the root layout, so it is already
  // mounted when an email/password sign-in completes without a full reload.
  // Loading only once authenticated also avoids a 401 on signed-out pages.
  useEffect(() => {
    if (status !== "authenticated") {
      setProgress(null);
      lastLevel.current = null;
      return;
    }
    void load();
    const onChange = () => void load();
    window.addEventListener(PROGRESS_EVENT, onChange);
    return () => window.removeEventListener(PROGRESS_EVENT, onChange);
  }, [load, status]);

  return { progress, levelUp, dismissLevelUp: () => setLevelUp(null) };
}
