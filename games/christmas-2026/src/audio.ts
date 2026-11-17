// Every sound in the jump, synthesized with WebAudio like the golf game's, so
// there are no audio files. Two layers run the whole time and follow the jump:
// skis hissing on the snow, and wind in flight. Everything else is a one-shot.
// The audio context starts on the first tap of Start, so autoplay blocking
// never trips. On iOS, the silent switch mutes it too.

import { store } from "../../../shared/storage";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const MUTE_KEY = "skijump.muted";
/** Overall volume, a little under full for headroom. */
const LEVEL = 0.8;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = store.get(MUTE_KEY, "0") === "1";

/** A looping noise layer whose loudness and brightness follow the jump. */
interface Layer {
  filter: BiquadFilterNode;
  gain: GainNode;
}
let hiss: Layer | null = null;
let wind: Layer | null = null;

/**
 * Songs and the sleigh's bells are scheduled ahead, so each goes through its
 * own bus: dropping the bus silences whatever it still had queued.
 */
const buses = new Set<GainNode>();

function makeNoise(c: AudioContext): AudioBuffer {
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function layer(c: AudioContext, out: AudioNode, type: BiquadFilterType, q: number): Layer {
  const source = c.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(out);
  source.start();
  return { filter, gain };
}

/** Starts the audio on a user's tap. Safe to call on every tap. */
export function initAudio(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
    return;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : LEVEL;
  // The levels below leave headroom, but the payoff stacks a lot up at once.
  // A soft clipper rounds off any peak that still gets through, where hard
  // clipping would crackle. (Not a compressor: Chrome's adds its own makeup
  // gain, which makes the loud moments louder.)
  const soft = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    // Untouched below 0.7; above it, eased round so it never reaches full scale.
    const x = (i / (curve.length - 1)) * 2 - 1;
    const over = Math.abs(x) - 0.7;
    curve[i] = over <= 0 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh(over / 0.3));
  }
  soft.curve = curve;
  soft.oversample = "2x";
  master.connect(soft).connect(ctx.destination);
  noise = makeNoise(ctx);
  hiss = layer(ctx, master, "bandpass", 0.8);
  wind = layer(ctx, master, "lowpass", 1.2);
}

// The frame loop stops in a hidden tab, so the layers would hold their last
// level: pause everything with the tab instead.
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});

export const isMuted = (): boolean => muted;

export function setMuted(on: boolean): void {
  muted = on;
  store.set(MUTE_KEY, on ? "1" : "0");
  if (ctx && master) master.gain.setTargetAtTime(on ? 0 : LEVEL, ctx.currentTime, 0.03);
}

/** A fresh output for something scheduled ahead, panned if asked. */
function bus(pan = 0): GainNode | null {
  if (!ctx || !master) return null;
  const gain = ctx.createGain();
  if (pan !== 0 && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner).connect(master);
  } else {
    gain.connect(master);
  }
  buses.add(gain);
  return gain;
}

/** Silences every song and jingle still queued, for a fresh jump. */
export function hush(): void {
  if (!ctx) return;
  for (const gain of buses) {
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const g = gain;
    setTimeout(() => g.disconnect(), 400);
  }
  buses.clear();
}

/** How loud and bright the ski hiss and the wind are right now, 0 to 1. */
export function setLayers(skis: number, wind_: number, slow = false): void {
  if (!ctx || !hiss || !wind) return;
  const t = ctx.currentTime;
  // Kept low: they sit under everything else.
  hiss.gain.gain.setTargetAtTime(skis * 0.1, t, 0.08);
  hiss.filter.frequency.setTargetAtTime(500 + skis * 2200, t, 0.1);
  wind.gain.gain.setTargetAtTime(wind_ * 0.07, t, 0.15);
  // Slow motion deepens the wind, like a slowed-down recording.
  wind.filter.frequency.setTargetAtTime((300 + wind_ * 1400) * (slow ? 0.45 : 1), t, 0.15);
}

function tone(freq: number, dur: number, type: OscillatorType, when: number, vol: number, out: AudioNode | null = master): void {
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A pitch that slides from one frequency to another: thuds and swooshes. */
function sweep(from: number, to: number, dur: number, type: OscillatorType, vol: number, when = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A burst of filtered noise: crunches, cheers, fireworks. */
function burst(
  dur: number,
  type: BiquadFilterType,
  freq: number,
  vol: number,
  opts: { when?: number; attack?: number; q?: number; out?: AudioNode } = {},
): void {
  if (!ctx || !master || !noise) return;
  const { when = 0, attack = 0.005, q = 0.8, out = master } = opts;
  const t0 = ctx.currentTime + when;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  source.connect(filter).connect(gain).connect(out);
  source.start(t0, Math.random());
  source.stop(t0 + dur + 0.05);
}

/**
 * One shake of sleigh bells: the bright rattle of the pellets inside, and a
 * handful of small, slightly out-of-tune bells ringing at once.
 */
function shake(out: AudioNode, when: number, vol: number): void {
  burst(0.09, "highpass", 7000, vol * 0.9, { when, attack: 0.003, out });
  for (let i = 0; i < 5; i++) {
    const f = 2400 + Math.random() * 3200;
    const at = when + Math.random() * 0.035;
    tone(f, 0.2, "sine", at, vol, out);
    tone(f * 2.76, 0.09, "sine", at, vol * 0.4, out); // a bell's clangy overtone
  }
}

// "Jingle Bells" (James Lord Pierpont, 1857), the chorus twice: [frequency, beats].
// Public domain.
const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99;
const JINGLE_BELLS: Array<[number, number]> = [
  [E5, 1], [E5, 1], [E5, 2], [E5, 1], [E5, 1], [E5, 2],
  [E5, 1], [G5, 1], [C5, 1.5], [D5, 0.5], [E5, 4],
  [F5, 1], [F5, 1], [F5, 1.5], [F5, 0.5], [F5, 1], [E5, 1], [E5, 1], [E5, 0.5], [E5, 0.5],
  [E5, 1], [D5, 1], [D5, 1], [E5, 1], [D5, 2], [G5, 2],
  [E5, 1], [E5, 1], [E5, 2], [E5, 1], [E5, 1], [E5, 2],
  [E5, 1], [G5, 1], [C5, 1.5], [D5, 0.5], [E5, 4],
  [F5, 1], [F5, 1], [F5, 1], [F5, 1], [F5, 1], [E5, 1], [E5, 1], [E5, 0.5], [E5, 0.5],
  [G5, 1], [G5, 1], [F5, 1], [D5, 1], [C5, 4],
];
/** The bass under each bar of four beats: C, C, C, C, F, C, G, G, then again ending on C. */
const BASS = [131, 131, 131, 131, 175, 131, 196, 196, 131, 131, 131, 131, 175, 131, 196, 131];

const BEAT = 0.21;
/** How long the song lasts, so the fireworks can last as long. */
export const JINGLE_SECONDS = JINGLE_BELLS.reduce((sum, [, beats]) => sum + beats, 0) * BEAT;

/** The song waits for the landing thud to pass, so the two don't pile up. */
const START = 0.6;

function playJingleBells(): void {
  const out = bus();
  if (!out) return;
  let at = START;
  for (const [freq, beats] of JINGLE_BELLS) {
    tone(freq, beats * BEAT * 0.9, "triangle", at, 0.26, out);
    tone(freq * 2, beats * BEAT * 0.5, "sine", at, 0.05, out); // a little sparkle on top
    at += beats * BEAT;
  }
  BASS.forEach((freq, bar) => {
    const t = START + bar * 4 * BEAT;
    tone(freq, BEAT * 1.6, "sine", t, 0.16, out);
    tone(freq * 1.5, BEAT * 1.6, "sine", t + 2 * BEAT, 0.11, out);
  });
  // Sleigh bells shaken on every half-beat, harder on the beat, as in every recording ever made.
  const halves = Math.round((at - START) / (BEAT / 2));
  for (let i = 0; i < halves; i++) shake(out, START + (i * BEAT) / 2, i % 2 ? 0.028 : 0.056);
}

export const sfx = {
  /** Shoving off from the start gate. */
  pushOff(): void {
    tone(260, 0.05, "square", 0, 0.05);
    burst(0.35, "bandpass", 1200, 0.12, { attack: 0.03 });
  },
  /** Leaving the lip: brighter for a better take-off. */
  takeoff(quality: "perfect" | "good" | "late"): void {
    burst(0.4, "highpass", 2500, 0.1, { attack: 0.01 });
    if (quality === "perfect") [784, 1175, 1568].forEach((f, i) => tone(f, 0.3, "triangle", i * 0.05, 0.12));
    else if (quality === "good") [659, 988].forEach((f, i) => tone(f, 0.25, "triangle", i * 0.06, 0.1));
    else tone(220, 0.25, "sawtooth", 0, 0.06);
  },
  /** Santa's sleigh crossing the sky, left to right, over `seconds`. */
  sleigh(seconds: number): void {
    if (!ctx) return;
    const left = bus(-0.7);
    const right = bus(0.7);
    if (!left || !right) return;
    const count = Math.floor(seconds / 0.16);
    for (let i = 0; i < count; i++) {
      const q = i / count;
      // Swelling in as it arrives, fading as it goes.
      const vol = 0.05 * Math.sin(q * Math.PI);
      shake(q < 0.5 ? left : right, i * 0.16, Math.max(vol, 0.004));
    }
    // A distant "ho ho ho".
    [0, 0.32, 0.64].forEach((at) => sweep(150, 105, 0.24, "sawtooth", 0.05, seconds * 0.4 + at));
  },
  /**
   * Skis touching down cleanly, and the crowd, louder for a longer jump. Under
   * the payoff the song and fireworks take over, so the thud is softer and the
   * crowd stays out of it.
   */
  land(distance: number, payoff = false): void {
    sweep(120, 45, 0.3, "sine", payoff ? 0.2 : 0.35);
    burst(0.25, "lowpass", 600, payoff ? 0.12 : 0.2);
    if (payoff) return;
    const roar = Math.min(1, Math.max(0.2, (distance - 70) / 70));
    burst(3.2, "bandpass", 1100, 0.18 * roar, { when: 0.15, attack: 0.5, q: 0.6 });
    burst(2.6, "bandpass", 2400, 0.08 * roar, { when: 0.25, attack: 0.4, q: 1.2 });
  },
  /** Going down in a heap, presents everywhere. */
  crash(): void {
    sweep(140, 40, 0.4, "sine", 0.4);
    burst(0.9, "lowpass", 1800, 0.3, { attack: 0.01 });
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "sawtooth", 0.3 + i * 0.16, 0.05));
  },
  /** A new personal best. */
  best(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", i * 0.09, 0.11));
  },
  /** One firework bursting, `far` 0 (close) to 1 (distant). */
  boom(far: number): void {
    // Under the song, so kept modest.
    const vol = 0.14 * (1 - far * 0.6);
    sweep(90, 35, 0.6, "sine", vol);
    burst(0.7, "lowpass", 900 - far * 400, vol * 0.8, { attack: 0.004 });
    // The crackle after.
    for (let i = 0; i < 6; i++) burst(0.05, "highpass", 4000, vol * 0.25, { when: 0.25 + Math.random() * 0.5 });
  },
  /** The payoff song. */
  jingleBells: playJingleBells,
};
