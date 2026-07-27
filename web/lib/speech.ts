/**
 * German text-to-speech.
 *
 * Deliberately behind a provider interface: today this runs entirely on the
 * browser's built-in Web Speech API (free, offline, no API key). If we later
 * want consistently native-sounding audio on every device, we implement a
 * second SpeechProvider that hits a neural TTS endpoint and swap the export
 * at the bottom of this file — no calling code changes.
 */

export interface SpeakOptions {
  /** BCP-47 tag. Cards are German; UI strings may be English. */
  lang?: string;
  /** 0.1–10, where 1 is the voice's normal speed. Learners do better slightly slow. */
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface SpeechProvider {
  isSupported(): boolean;
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
}

/** Voices we prefer, best first. These are the highest-quality German voices
 *  commonly installed on macOS/iOS, Windows and Chrome. */
const PREFERRED_DE_VOICES = [
  "Anna (Premium)",
  "Anna (Enhanced)",
  "Petra (Premium)",
  "Petra (Enhanced)",
  "Markus",
  "Yannick",
  "Google Deutsch",
  "Microsoft Katja Online",
  "Microsoft Katja",
  "Microsoft Hedda",
  "Anna",
];

/**
 * Picks the best available German voice.
 *
 * Ranking beats naive `find(v => v.lang === 'de-DE')` because the first
 * matching voice is often a low-quality compact one while a far better
 * neural voice sits further down the list.
 */
function pickGermanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const german = voices.filter((v) => v.lang?.toLowerCase().startsWith("de"));
  if (german.length === 0) return null;

  for (const preferred of PREFERRED_DE_VOICES) {
    const hit = german.find((v) => v.name === preferred);
    if (hit) return hit;
  }
  // Prefer any voice whose name hints it's a higher-quality variant.
  const enhanced = german.find((v) => /premium|enhanced|neural|natural|online/i.test(v.name));
  if (enhanced) return enhanced;
  // Prefer de-DE over de-AT/de-CH for a standard-German learner.
  const deDE = german.find((v) => v.lang?.toLowerCase() === "de-de");
  return deDE ?? german[0];
}

class BrowserSpeechProvider implements SpeechProvider {
  private voices: SpeechSynthesisVoice[] = [];
  private ready = false;

  constructor() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.loadVoices();
    // Chrome populates voices asynchronously — this fires once they're in.
    window.speechSynthesis.addEventListener?.("voiceschanged", () => this.loadVoices());
  }

  private loadVoices() {
    try {
      this.voices = window.speechSynthesis.getVoices();
      this.ready = this.voices.length > 0;
    } catch {
      this.ready = false;
    }
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  speak(text: string, opts: SpeakOptions = {}) {
    if (!this.isSupported() || !text.trim()) return;
    const synth = window.speechSynthesis;

    // Never let two utterances overlap.
    synth.cancel();

    if (!this.ready) this.loadVoices();

    const utterance = new SpeechSynthesisUtterance(text);
    const lang = opts.lang ?? "de-DE";
    utterance.lang = lang;
    // Slightly under normal speed: learners need to catch word boundaries.
    utterance.rate = opts.rate ?? 0.9;
    utterance.pitch = 1;

    if (lang.startsWith("de")) {
      const voice = pickGermanVoice(this.voices);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => opts.onStart?.();
    utterance.onend = () => opts.onEnd?.();
    utterance.onerror = (e) => {
      // "interrupted"/"canceled" are normal when the user taps another card.
      if (e.error === "interrupted" || e.error === "canceled") {
        opts.onEnd?.();
        return;
      }
      opts.onError?.(e.error ?? "speech failed");
      opts.onEnd?.();
    };

    synth.speak(utterance);
  }

  cancel() {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
  }
}

export const speech: SpeechProvider = new BrowserSpeechProvider();

/** True if this device can speak German at all (used to hide audio controls). */
export function hasGermanVoice(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices();
  // Before voices load we optimistically assume yes; the control re-renders later.
  if (voices.length === 0) return true;
  return voices.some((v) => v.lang?.toLowerCase().startsWith("de"));
}
