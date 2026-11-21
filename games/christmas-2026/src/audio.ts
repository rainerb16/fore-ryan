// Every sound in the jump, synthesized with WebAudio like the golf game's, so
// there are no audio files. Two layers run the whole time and follow the jump:
// skis hissing on the snow, and wind in flight. Everything else is a one-shot.

import { createAudio } from "../../../shared/audio";

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

function layer(c: AudioContext, out: AudioNode, noise: AudioBuffer, type: BiquadFilterType, q: number): Layer {
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

const audio = createAudio({
  muteKey: "skijump.muted",
  level: 0.8,
  playOnSilent: true,
  onReady(ctx, master, noise) {
    hiss = layer(ctx, master, noise, "bandpass", 0.8);
    wind = layer(ctx, master, noise, "lowpass", 1.2);
  },
  // A song still queued is dropped: a page kept for Back, or unmuted later,
  // would otherwise pick it up mid-phrase.
  onStop() {
    hush();
    setLayers(0, 0);
  },
});
const { tone, sweep, burst } = audio;

export const isMuted = audio.isMuted;
export const setMuted = audio.setMuted;
audio.listen();

/** A fresh output for something scheduled ahead, panned if asked. */
function bus(pan = 0): GainNode | null {
  const { context: ctx, master } = audio;
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
  const ctx = audio.context;
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
  const ctx = audio.context;
  if (!ctx || !hiss || !wind) return;
  const t = ctx.currentTime;
  // Kept low: they sit under everything else.
  hiss.gain.gain.setTargetAtTime(skis * 0.1, t, 0.08);
  hiss.filter.frequency.setTargetAtTime(500 + skis * 2200, t, 0.1);
  wind.gain.gain.setTargetAtTime(wind_ * 0.07, t, 0.15);
  // Slow motion deepens the wind, like a slowed-down recording.
  wind.filter.frequency.setTargetAtTime((300 + wind_ * 1400) * (slow ? 0.45 : 1), t, 0.15);
}

/**
 * Sleigh bells tuned to the song: the notes of each chord, three octaves up.
 * Bells ringing chord tones blend with the music instead of clashing with it.
 */
const BELLS = {
  C: [2093.0, 2637.0, 3136.0], // C, E, G
  F: [2793.8, 3520.0, 4186.0], // F, A, C
  G: [2349.3, 3136.0, 3951.1], // D, G, B
} as const;
type Chord = keyof typeof BELLS;

/**
 * One shake of sleigh bells: a soft rattle of the pellets inside, then the
 * chord's bells ringing in a quick, even ripple.
 */
function shake(out: AudioNode, when: number, vol: number, chord: Chord = "C"): void {
  burst(0.05, "highpass", 8000, vol * 0.45, { when, attack: 0.002, out });
  BELLS[chord].forEach((f, i) => {
    const at = when + i * 0.012;
    tone(f, 0.22, "sine", at, vol, out);
    tone(f * 2, 0.08, "sine", at, vol * 0.25, out); // the octave above, in tune
  });
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
/** The chord of each bar of four beats; the bass and the bells both follow it. */
const CHORDS: Chord[] = ["C", "C", "C", "C", "F", "C", "G", "G", "C", "C", "C", "C", "F", "C", "G", "C"];
const BASS: Record<Chord, number> = { C: 131, F: 175, G: 196 };

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
  CHORDS.forEach((chord, bar) => {
    const freq = BASS[chord];
    const t = START + bar * 4 * BEAT;
    tone(freq, BEAT * 1.6, "sine", t, 0.16, out);
    tone(freq * 1.5, BEAT * 1.6, "sine", t + 2 * BEAT, 0.11, out);
  });
  // Sleigh bells shaken on every half-beat, harder on the beat, as in every
  // recording ever made, ringing the bar's chord.
  const halves = Math.round((at - START) / (BEAT / 2));
  for (let i = 0; i < halves; i++) {
    const chord = CHORDS[Math.min(CHORDS.length - 1, Math.floor(i / 8))];
    shake(out, START + (i * BEAT) / 2, i % 2 ? 0.028 : 0.056, chord);
  }
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
