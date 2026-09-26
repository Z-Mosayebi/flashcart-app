/**
 * Splits text into plain and single-quoted runs, so the UI can set grammar
 * keywords like 'ist' or 'zu + Infinitiv' in bold (with their quotes kept).
 *
 * A quote only opens after a non-letter (start, space, punctuation) and only
 * closes before one, so apostrophes inside words — "don't", "Versuch's" —
 * are never mistaken for quotes. An unmatched quote stays plain text.
 */

export interface TextRun {
  text: string;
  quoted: boolean;
}

const QUOTED = /(^|[^\p{L}\p{N}])(['‘](?=\S)[^'‘’\n]{1,80}?['’])(?=$|[^\p{L}\p{N}])/gu;

export function splitQuoted(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;

  for (const match of text.matchAll(QUOTED)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) runs.push({ text: text.slice(last, start), quoted: false });
    runs.push({ text: match[2], quoted: true });
    last = start + match[2].length;
  }

  if (last < text.length) runs.push({ text: text.slice(last), quoted: false });
  return runs;
}
