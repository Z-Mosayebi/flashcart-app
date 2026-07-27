"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Locale, TranslationKey, translate, isLocale } from "@/lib/i18n";

export type ThemePref = "light" | "dark" | "system";

interface Preferences {
  locale: Locale;
  theme: ThemePref;
  autoPlayAudio: boolean;
}

interface PreferencesContext extends Preferences {
  setLocale: (l: Locale) => void;
  setTheme: (t: ThemePref) => void;
  setAutoPlayAudio: (v: boolean) => void;
  /** Translate a key in the active locale. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<PreferencesContext | null>(null);

const STORAGE_KEY = "flashcart:prefs";

function applyTheme(theme: ThemePref) {
  if (typeof document === "undefined") return;
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function PreferencesProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [autoPlayAudio, setAutoPlayState] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Preferences>;
        if (isLocale(saved.locale)) setLocaleState(saved.locale);
        if (saved.theme) setThemeState(saved.theme);
        if (typeof saved.autoPlayAudio === "boolean") setAutoPlayState(saved.autoPlayAudio);
      }
    } catch {
      /* corrupt storage — fall back to defaults */
    }
  }, []);

  // Keep <html> class and lang attribute in sync.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const persist = useCallback((next: Partial<Preferences>) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next }));
    } catch {
      /* storage unavailable (private mode) — preference stays in memory only */
    }
  }, []);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      persist({ locale: l });
      // Best-effort server sync so the choice follows the user across devices.
      fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: l }),
      }).catch(() => {});
    },
    [persist]
  );

  const setTheme = useCallback(
    (t: ThemePref) => {
      setThemeState(t);
      persist({ theme: t });
    },
    [persist]
  );

  const setAutoPlayAudio = useCallback(
    (v: boolean) => {
      setAutoPlayState(v);
      persist({ autoPlayAudio: v });
    },
    [persist]
  );

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  );

  return (
    <Ctx.Provider
      value={{ locale, theme, autoPlayAudio, setLocale, setTheme, setAutoPlayAudio, t }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences(): PreferencesContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}

/** Convenience hook when a component only needs the translator. */
export function useT() {
  return usePreferences().t;
}
