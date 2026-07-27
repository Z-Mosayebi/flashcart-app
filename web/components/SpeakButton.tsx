"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { speech, hasGermanVoice } from "@/lib/speech";

interface SpeakButtonProps {
  text: string;
  lang?: string;
  /** Speak as soon as the component mounts / text changes. */
  autoPlay?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

/**
 * Audio playback control for German card text. Renders nothing when the
 * device has no German voice installed, so we never show a dead button.
 */
export default function SpeakButton({
  text,
  lang = "de-DE",
  autoPlay = false,
  size = "md",
  label = "Listen",
  className,
}: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(speech.isSupported() && hasGermanVoice());
  }, []);

  const play = useCallback(() => {
    if (speaking) {
      speech.cancel();
      setSpeaking(false);
      return;
    }
    speech.speak(text, {
      lang,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [text, lang, speaking]);

  // Auto-play new card prompts, but only after voices are ready.
  useEffect(() => {
    if (!autoPlay || !text) return;
    const t = setTimeout(() => {
      speech.speak(text, {
        lang,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoPlay, lang]);

  // Stop audio if the component unmounts mid-sentence.
  useEffect(() => () => speech.cancel(), []);

  if (!supported) return null;

  const dims = {
    sm: "h-8 w-8",
    md: "h-11 w-11",
    lg: "h-14 w-14",
  }[size];

  const icon = {
    sm: 14,
    md: 18,
    lg: 22,
  }[size];

  return (
    <motion.button
      type="button"
      onClick={play}
      whileTap={{ scale: 0.9 }}
      aria-label={speaking ? "Stop audio" : label}
      title={speaking ? "Stop audio" : label}
      className={clsx(
        "relative flex shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
        speaking
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface text-ink-muted hover:border-brand hover:text-brand",
        dims,
        className
      )}
    >
      {/* Ripple while audio plays */}
      <AnimatePresence>
        {speaking && (
          <motion.span
            className="absolute inset-0 rounded-full bg-brand/30"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        {speaking ? (
          <>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </>
        ) : (
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        )}
      </svg>
    </motion.button>
  );
}
