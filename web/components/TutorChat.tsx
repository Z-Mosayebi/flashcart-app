"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import SpeakButton from "@/components/SpeakButton";

interface Topic {
  id: string;
  name: string;
  description: string | null;
  pattern: string | null;
  cardCount: number;
  masteredPct: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let messageCounter = 0;
const nextId = () => `m${++messageCounter}`;

export default function TutorChat() {
  const { t, autoPlayAudio } = usePreferences();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [topic, setTopic] = useState<Topic | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mastered, setMastered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setTopics(d.topics ?? []))
      .catch(() => setError(t("common.error")))
      .finally(() => setLoadingTopics(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(
    async (text: string, activeTopic: Topic, activeSession: string | null) => {
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/tutor/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId: activeTopic.id,
            sessionId: activeSession,
            message: text,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();

        setSessionId(data.sessionId);
        setMessages((m) => [...m, { id: nextId(), role: "assistant", content: data.reply }]);
        if (data.mastered) setMastered(true);
      } catch {
        setError(t("common.error"));
      } finally {
        setSending(false);
      }
    },
    [t]
  );

  function startSession(chosen: Topic) {
    setTopic(chosen);
    setMessages([]);
    setSessionId(null);
    setMastered(false);
    // Empty message tells the server to have the tutor open the conversation.
    void send("", chosen, null);
  }

  function submit() {
    const text = input.trim();
    if (!text || !topic || sending || mastered) return;
    setMessages((m) => [...m, { id: nextId(), role: "user", content: text }]);
    setInput("");
    void send(text, topic, sessionId);
    inputRef.current?.focus();
  }

  function reset() {
    setTopic(null);
    setMessages([]);
    setSessionId(null);
    setMastered(false);
    setError(null);
  }

  // ---------- Topic picker ----------

  if (!topic) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("tutor.title")}</h1>
          <p className="text-ink-muted">{t("tutor.subtitle")}</p>
        </header>

        {loadingTopics ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="card-surface p-8 text-center">
            <p className="text-ink-muted">{t("tutor.noTopics")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {topics.map((tp, i) => (
              <motion.button
                key={tp.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => startSession(tp)}
                className="card-surface group p-5 text-left transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium text-german">{tp.name}</h2>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                    {tp.masteredPct}%
                  </span>
                </div>
                {tp.pattern && (
                  <p className="mt-2 line-clamp-2 text-sm text-ink-muted text-german">{tp.pattern}</p>
                )}
                <p className="mt-3 text-xs text-ink-faint">{tp.cardCount} cards</p>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- Conversation ----------

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col sm:h-[calc(100dvh-10rem)]">
      <header className="flex items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold tracking-tight">{topic.name}</h1>
          {topic.pattern && (
            <p className="truncate text-sm text-ink-muted text-german">{topic.pattern}</p>
          )}
        </div>
        <button onClick={reset} className="shrink-0 text-sm text-ink-muted hover:text-ink">
          {t("tutor.back")}
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-line bg-surface p-4 sm:p-6"
      >
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={clsx("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role === "assistant" && (
                <SpeakButton
                  text={m.content}
                  size="sm"
                  autoPlay={autoPlayAudio && m.id === messages[messages.length - 1]?.id}
                  className="mt-1"
                />
              )}
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-german sm:max-w-[75%]",
                  m.role === "user"
                    ? "rounded-br-md bg-brand text-white"
                    : "rounded-bl-md bg-surface-raised text-ink"
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm text-ink-faint"
          >
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-ink-faint"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
            {t("tutor.thinking")}
          </motion.div>
        )}

        <AnimatePresence>
          {mastered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className="rounded-2xl border border-positive/30 bg-positive/10 p-5 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 15 }}
                className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-positive text-white"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </motion.div>
              <p className="font-medium text-positive">{t("tutor.mastered.title")}</p>
              <p className="mt-1 text-sm text-ink-muted">{t("tutor.mastered.body")}</p>
              <button onClick={reset} className="btn-ghost mt-4">
                {t("tutor.newSession")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
            {error}
          </div>
        )}
      </div>

      {!mastered && (
        <div className="safe-bottom flex items-end gap-2 pt-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            lang="de"
            placeholder={t("tutor.placeholder")}
            disabled={sending}
            className="field max-h-32 min-h-[3rem] flex-1 resize-none text-german"
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={submit}
            disabled={sending || !input.trim()}
            aria-label={t("tutor.send")}
            className="btn-primary h-12 w-12 !px-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        </div>
      )}
    </div>
  );
}
