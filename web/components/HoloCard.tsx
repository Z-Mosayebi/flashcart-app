"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import { showStreak, type Rarity } from "@/lib/card-look";
import type { TranslationKey } from "@/lib/i18n";

/**
 * A collectible review card: gold-edged, holographic, with a rarity band that
 * follows the Leitner box. It shows one face at a time and flips when `side`
 * changes — turning edge-on, swapping faces, turning back — so the card's
 * height always fits the face on show (long feedback included).
 */
export default function HoloCard({
  side,
  front,
  back,
  rarity,
  topic,
  streak,
  position,
  onFlip,
}: {
  side: "front" | "back";
  front: ReactNode;
  back: ReactNode;
  rarity: Rarity;
  topic: string;
  streak: number;
  position: { index: number; total: number };
  /** Called at the moment the faces swap (for the flip sound). */
  onFlip?: () => void;
}) {
  const { t } = usePreferences();
  const [scope, animate] = useAnimate();
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(side);
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  useEffect(() => {
    if (side === shown) return;
    let cancelled = false;

    (async () => {
      if (reduceMotion) {
        await animate(scope.current, { opacity: 0 }, { duration: 0.2 });
        if (cancelled) return;
        setShown(side);
        onFlipRef.current?.();
        await animate(scope.current, { opacity: 1 }, { duration: 0.25 });
        return;
      }
      // Unhurried: about 0.75s end to end, easing in and out like a real card.
      await animate(scope.current, { rotateY: 90 }, { duration: 0.33, ease: [0.45, 0, 0.8, 0.4] });
      if (cancelled) return;
      setShown(side);
      onFlipRef.current?.();
      await animate(scope.current, { rotateY: [-90, 0] }, { duration: 0.42, ease: [0.2, 0.6, 0.35, 1] });
    })();

    return () => {
      cancelled = true;
    };
    // Only a change of requested side starts a flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  return (
    <div style={{ perspective: 1200 }}>
      <div ref={scope} className={clsx("holo-card", `rarity-${rarity}`)}>
        <div className="holo-band">
          <span className="relative min-w-0 truncate text-xs font-medium text-white/90">{topic}</span>
          <span className="relative flex shrink-0 items-center gap-2 text-[11px] text-white/90">
            {showStreak(streak) && (
              <span className="rounded-full bg-black/35 px-2 py-0.5" title={t("card.streak")}>
                🔥 {streak}
              </span>
            )}
            <span className="rounded-full bg-black/25 px-2 py-0.5">
              #{position.index} / {position.total}
            </span>
          </span>
          <span className="holo-rarity">{t(`card.rarity.${rarity}` as TranslationKey).toUpperCase()}</span>
        </div>
        <div className="relative">{shown === "front" ? front : back}</div>
      </div>
    </div>
  );
}
