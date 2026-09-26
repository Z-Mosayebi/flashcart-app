"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";
import { waitingStage } from "@/lib/ai-waiting";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Shown while the AI grades an answer or writes a tutor reply: a moving card
 * icon, a message that changes as the wait grows, and a bar that never stops
 * moving — so a slow answer never looks like a frozen app.
 */
export default function AiWaiting({ context }: { context: "review" | "tutor" }) {
  const { t } = usePreferences();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage = waitingStage(elapsed);
  const message = t(`wait.${context}.${stage}` as TranslationKey);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
      {/* A small card turning over and over. */}
      <motion.div
        aria-hidden
        className="h-10 w-7 rounded-md border-2 border-brand bg-brand/20 shadow-[0_0_14px_rgb(var(--brand)/0.45)]"
        animate={{ rotateY: [0, 180, 360] }}
        transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
        style={{ transformPerspective: 400 }}
      />

      <AnimatePresence mode="wait">
        <motion.p
          key={stage}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35 }}
          className="max-w-xs text-sm leading-relaxed text-ink"
        >
          {message}
        </motion.p>
      </AnimatePresence>

      <div aria-hidden className="wait-bar h-1 w-40 overflow-hidden rounded-full bg-line" />
    </div>
  );
}
