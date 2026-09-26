/**
 * Card-game sound effects, synthesised with the Web Audio API.
 *
 * No audio files: nothing to download or license, and it plays everywhere,
 * including iPhone Safari (which is unreliable with Ogg). Browsers only allow
 * sound after the user has interacted with the page, so an effect played
 * before that is silently skipped rather than queued.
 */

export type CardSound = "deal" | "flip" | "correct" | "wrong" | "complete" | "levelUp";

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** A short burst of white noise, the raw material of paper sounds. */
function noise(ac: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  return src;
}

function envelope(ac: AudioContext, peak: number, attack: number, release: number): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  return g;
}

function tone(ac: AudioContext, freq: number, start: number, length: number, peak: number, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const PLAYERS: Record<CardSound, (ac: AudioContext) => void> = {
  // A card sliding off the deck: filtered noise sweeping down.
  deal(ac) {
    const src = noise(ac, 0.22);
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(3200, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(700, ac.currentTime + 0.2);
    src.connect(filter).connect(envelope(ac, 0.22, 0.02, 0.19)).connect(ac.destination);
    src.start();
  },
  // A card turning over: a short, bright flick.
  flip(ac) {
    const src = noise(ac, 0.07);
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1800;
    src.connect(filter).connect(envelope(ac, 0.18, 0.005, 0.06)).connect(ac.destination);
    src.start();
  },
  // Two rising notes: a gentle "ding-ding".
  correct(ac) {
    tone(ac, 784, 0, 0.18, 0.12, "triangle"); // G5
    tone(ac, 1175, 0.09, 0.28, 0.1, "triangle"); // D6
  },
  // A soft, low, falling tone — noticeable, not punishing.
  wrong(ac) {
    const osc = ac.createOscillator();
    const t = ac.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(190, t + 0.28);
    osc.connect(envelope(ac, 0.1, 0.02, 0.3)).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.36);
  },
  // New level: a bright rising fanfare.
  levelUp(ac) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ac, f, i * 0.08, 0.35, 0.11, "triangle"));
  },
  // Deck finished: a short rising arpeggio.
  complete(ac) {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.09, 0.3, 0.1, "triangle"));
  },
};

export function playCardSound(sound: CardSound): void {
  try {
    // Before any tap or keypress the browser would hold the sound and play
    // it late; skip it instead.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;

    const ac = context();
    if (!ac) return;
    if (ac.state === "running") PLAYERS[sound](ac);
    else void ac.resume().then(() => PLAYERS[sound](ac)).catch(() => {});
  } catch {
    /* audio unavailable — the game works silently */
  }
}
