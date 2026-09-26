"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";
import { playCardSound } from "@/lib/card-sounds";

/** A short, dismissible "Level N!" burst; closes itself after a few seconds. */
export default function LevelUpCelebration({ level, onClose }: { level: number; onClose: () => void }) {
  const { t, cardSounds } = usePreferences();

  useEffect(() => {
    if (cardSounds) playCardSound("levelUp");
    const timer = setTimeout(onClose, 3200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
    >
      <motion.div
        initial={{ scale: 0.6, rotate: -6 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="relative rounded-3xl border-2 border-gold bg-surface px-10 py-8 text-center shadow-[0_0_60px_rgb(var(--gold)/0.55)]"
      >
        <p className="text-4xl">✨</p>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">{t("game.levelUp")}</p>
        <p className="mt-1 font-display text-5xl font-extrabold text-ink">{t("game.level", { n: level })}</p>
      </motion.div>
    </motion.div>
  );
}
