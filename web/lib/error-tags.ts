/**
 * Readable names and short explanations for the error tags the AI grader
 * attaches to an answer (see ai-service/app/services/tutor.py). Learners tap a
 * tag to learn what kind of mistake it is.
 */

import type { Locale } from "@/lib/i18n";

interface TagInfo {
  label: Record<Locale, string>;
  explanation: Record<Locale, string>;
}

const TAGS: Record<string, TagInfo> = {
  "word-order": {
    label: { en: "Word order", de: "Wortstellung" },
    explanation: {
      en: "The words are in the wrong order. In a main clause the conjugated verb is the second element; time–manner–place usually follow that order.",
      de: "Die Wörter stehen in der falschen Reihenfolge. Im Hauptsatz steht das konjugierte Verb an zweiter Stelle; danach meist Zeit – Art – Ort.",
    },
  },
  "case-declension": {
    label: { en: "Case", de: "Kasus" },
    explanation: {
      en: "A noun, article or adjective has the wrong case ending. Check whether it should be nominative, accusative, dative or genitive — the verb or preposition decides.",
      de: "Ein Nomen, Artikel oder Adjektiv hat die falsche Kasusendung. Prüfe, ob Nominativ, Akkusativ, Dativ oder Genitiv nötig ist — das bestimmt das Verb oder die Präposition.",
    },
  },
  "verb-conjugation": {
    label: { en: "Verb form", de: "Konjugation" },
    explanation: {
      en: "The verb ending doesn't match the subject (ich lerne, du lernst, er lernt …).",
      de: "Die Verbendung passt nicht zum Subjekt (ich lerne, du lernst, er lernt …).",
    },
  },
  "verb-tense": {
    label: { en: "Verb tense", de: "Zeitform" },
    explanation: {
      en: "The sentence is in the wrong tense for what you want to say — e.g. past (Perfekt) where the prompt asks for present or future.",
      de: "Der Satz steht in der falschen Zeitform — z. B. Perfekt, wo die Aufgabe Präsens oder Futur verlangt.",
    },
  },
  "preposition-choice": {
    label: { en: "Preposition", de: "Präposition" },
    explanation: {
      en: "The wrong preposition is used here. Many verbs and nouns come with a fixed preposition (warten auf, sich freuen über) — learn them as a pair.",
      de: "Hier passt die Präposition nicht. Viele Verben und Nomen haben eine feste Präposition (warten auf, sich freuen über) — lerne sie als Paar.",
    },
  },
  "article-agreement": {
    label: { en: "Article", de: "Artikel" },
    explanation: {
      en: "The article doesn't match the noun's gender, number or case (der/die/das, ein/eine …).",
      de: "Der Artikel passt nicht zu Genus, Numerus oder Kasus des Nomens (der/die/das, ein/eine …).",
    },
  },
  "gender-agreement": {
    label: { en: "Gender", de: "Genus" },
    explanation: {
      en: "The noun's gender is wrong somewhere — the article, adjective or pronoun must match der, die or das.",
      de: "Das Genus stimmt nicht — Artikel, Adjektiv oder Pronomen müssen zu der, die oder das passen.",
    },
  },
  "wrong-verb-position": {
    label: { en: "Verb position", de: "Verbstellung" },
    explanation: {
      en: "The verb is in the wrong place. In subordinate clauses (weil, dass, weswegen …) the conjugated verb goes to the very end.",
      de: "Das Verb steht an der falschen Stelle. In Nebensätzen (weil, dass, weswegen …) steht das konjugierte Verb ganz am Ende.",
    },
  },
  spelling: {
    label: { en: "Spelling", de: "Rechtschreibung" },
    explanation: {
      en: "A word is misspelled. Remember that German nouns start with a capital letter.",
      de: "Ein Wort ist falsch geschrieben. Denk daran: Nomen schreibt man groß.",
    },
  },
  vocabulary: {
    label: { en: "Word choice", de: "Wortwahl" },
    explanation: {
      en: "A word doesn't fit here — it means something else, or a different German word is used in this context.",
      de: "Ein Wort passt hier nicht — es bedeutet etwas anderes, oder im Deutschen sagt man in diesem Zusammenhang ein anderes Wort.",
    },
  },
  punctuation: {
    label: { en: "Punctuation", de: "Zeichensetzung" },
    explanation: {
      en: "A comma or other mark is missing or misplaced. In German, subordinate clauses (weil, dass, weswegen …) are always set off with commas.",
      de: "Ein Komma oder anderes Zeichen fehlt oder steht falsch. Nebensätze (weil, dass, weswegen …) werden im Deutschen immer mit Komma abgetrennt.",
    },
  },
  capitalization: {
    label: { en: "Capital letters", de: "Groß-/Kleinschreibung" },
    explanation: {
      en: "Capitalisation is off. German capitalises every noun and the first word of a sentence; 'Sie' (formal you) is capitalised too.",
      de: "Groß- und Kleinschreibung stimmt nicht. Alle Nomen und der Satzanfang werden großgeschrieben, ebenso die Anrede 'Sie'.",
    },
  },
  "adjective-ending": {
    label: { en: "Adjective ending", de: "Adjektivendung" },
    explanation: {
      en: "The adjective has the wrong ending. It depends on the article in front of it and on the noun's gender, number and case.",
      de: "Das Adjektiv hat die falsche Endung. Sie hängt vom Artikel davor und von Genus, Numerus und Kasus des Nomens ab.",
    },
  },
  "plural-form": {
    label: { en: "Plural", de: "Plural" },
    explanation: {
      en: "The plural is wrong. German plurals are irregular (-e, -er, -n, -s, umlaut …) — learn each noun with its plural.",
      de: "Die Pluralform stimmt nicht. Deutsche Pluralformen sind unregelmäßig (-e, -er, -n, -s, Umlaut …) — lerne jedes Nomen mit Plural.",
    },
  },
  "separable-verb": {
    label: { en: "Separable verb", de: "Trennbares Verb" },
    explanation: {
      en: "A separable verb isn't split correctly. In a main clause the prefix goes to the end (Ich rufe dich an); in a subordinate clause it stays joined (…, dass ich dich anrufe).",
      de: "Ein trennbares Verb ist falsch getrennt. Im Hauptsatz steht die Vorsilbe am Ende (Ich rufe dich an), im Nebensatz bleibt sie dran (…, dass ich dich anrufe).",
    },
  },
  "off-topic": {
    label: { en: "Off topic", de: "Am Thema vorbei" },
    explanation: {
      en: "The answer doesn't do what the prompt asked — read the task again and answer that specific question.",
      de: "Die Antwort passt nicht zur Aufgabe — lies sie noch einmal und beantworte genau diese Frage.",
    },
  },
  "missing-element": {
    label: { en: "Missing part", de: "Fehlender Teil" },
    explanation: {
      en: "Something the sentence needs is missing — a word, a clause, or the structure the prompt asked for.",
      de: "Dem Satz fehlt etwas — ein Wort, ein Satzteil oder die Struktur, die die Aufgabe verlangt.",
    },
  },
};

/** Tags the grader is told to choose from (mirrored in ai-service/app/services/tutor.py). */
export const GRADER_TAGS = Object.keys(TAGS);

/** Other names models use for the same mistakes. */
const SYNONYMS: Record<string, string> = {
  "word-choice": "vocabulary",
  "wrong-word": "vocabulary",
  capitalisation: "capitalization",
  plural: "plural-form",
  tense: "verb-tense",
  "comma": "punctuation",
};

function normalise(tag: string): string {
  const key = tag.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return SYNONYMS[key] ?? key;
}

const FALLBACK: Record<Locale, string> = {
  en: "Compare your sentence with the expected answer to see exactly what changed.",
  de: "Vergleiche deinen Satz mit der erwarteten Antwort, um genau zu sehen, was anders ist.",
};

export function tagLabel(tag: string, locale: Locale): string {
  const known = TAGS[normalise(tag)];
  if (known) return known.label[locale];
  const words = normalise(tag).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every tag gets an explanation: a specific one if known, otherwise a pointer to the answer. */
export function tagExplanation(tag: string, locale: Locale): string {
  return TAGS[normalise(tag)]?.explanation[locale] ?? FALLBACK[locale];
}
