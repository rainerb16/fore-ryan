// The arcade's sound, synthesized with WebAudio like the games' (no files): a
// quiet room tone with the odd blip from a machine in attract mode, a tick as
// the camera moves between cabinets, a coin dropping in on PLAY, and the
// broken machines' sparks, steam, clunks and secrets. Kept low: it's a room,
// not a game. Starts on the first tap or key press, so autoplay never blocks it.

import { store } from "../../shared/storage";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const MUTE_KEY = "arcade.muted";
/** Overall volume, under full for headroom. */
const LEVEL = 0.7;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = store.get(MUTE_KEY, "0") === "1";
let blipTimer = 0;

export const isMuted = (): boolean => muted;

export function setMuted(on: boolean): void {
  muted = on;
  store.set(MUTE_KEY, on ? "1" : "0");
  if (ctx && master) master.gain.setTargetAtTime(on ? 0 : LEVEL, ctx.currentTime, 0.03);
  if (!on) startAudio();
}

/** Starts the audio on a user's tap or key press. Safe to call on every one. */
export function startAudio(): void {
  if (ctx) {
    if (ctx.state === "suspended" && !document.hidden) void ctx.resume();
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
  // Peaks are rounded off rather than clipped (see the ski jump's audio.ts).
  const soft = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const over = Math.abs(x) - 0.7;
    curve[i] = over <= 0 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh(over / 0.3));
  }
  soft.curve = curve;
  master.connect(soft).connect(ctx.destination);

  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  roomTone(ctx, master);
  scheduleBlip();
}

/** The hum of a room full of machines: mains hum and a low, soft rumble. */
function roomTone(c: AudioContext, out: AudioNode): void {
  const hum = c.createOscillator();
  hum.frequency.value = 60;
  const humGain = c.createGain();
  humGain.gain.value = 0.012;
  hum.connect(humGain).connect(out);
  hum.start();

  const rumble = c.createBufferSource();
  rumble.buffer = noise;
  rumble.loop = true;
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 220;
  const rumbleGain = c.createGain();
  rumbleGain.gain.value = 0.03;
  rumble.connect(low).connect(rumbleGain).connect(out);
  rumble.start();
}

// Leaving the arcade for a game, or the tab going away: silence. A page kept
// for Back resumes when it is shown again.
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});
window.addEventListener("pagehide", () => {
  if (ctx) void ctx.suspend();
});
window.addEventListener("pageshow", (e) => {
  if (ctx && e.persisted && !document.hidden) void ctx.resume();
});

function panned(pan: number): AudioNode | null {
  if (!ctx || !master) return null;
  if (pan === 0 || !ctx.createStereoPanner) return master;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
}

function tone(freq: number, dur: number, type: OscillatorType, when: number, vol: number, out: AudioNode | null = master): void {
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sweep(from: number, to: number, dur: number, type: OscillatorType, vol: number, when = 0, out: AudioNode | null = master): void {
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function burst(
  dur: number,
  type: BiquadFilterType,
  freq: number,
  vol: number,
  opts: { when?: number; attack?: number; q?: number; out?: AudioNode | null } = {},
): void {
  if (!ctx || !master || !noise) return;
  const { when = 0, attack = 0.004, q = 0.8, out = master } = opts;
  if (!out) return;
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

// A faint attract-mode jingle from some machine down the row, now and then.
const BLIPS = [
  [523, 659, 784, 1047],
  [784, 659, 523, 392],
  [440, 554, 659, 880],
  [659, 784, 988, 784],
];
function scheduleBlip(): void {
  clearTimeout(blipTimer);
  blipTimer = window.setTimeout(() => {
    if (ctx && ctx.state === "running") {
      const notes = BLIPS[Math.floor(Math.random() * BLIPS.length)];
      const out = panned(Math.random() * 1.6 - 0.8);
      notes.forEach((f, i) => tone(f, 0.09, "square", i * 0.085, 0.012, out));
    }
    scheduleBlip();
  }, 7000 + Math.random() * 9000);
}

/** Sounds the arcade plays. `pan` is where on screen it happens, -1 left to 1 right. */
export const sfx = {
  /** The camera gliding to another cabinet. */
  move(): void {
    tone(1400, 0.03, "square", 0, 0.02);
    burst(0.25, "bandpass", 900, 0.03, { attack: 0.06, q: 1.5 });
  },
  /** A coin dropping in, and the credit registering. */
  coin(): void {
    tone(2637, 0.12, "triangle", 0, 0.08);
    tone(3520, 0.18, "triangle", 0.05, 0.06);
    burst(0.05, "highpass", 5000, 0.05, { when: 0.12 });
    tone(1319, 0.08, "square", 0.22, 0.04);
    tone(1976, 0.16, "square", 0.3, 0.04);
  },
  /** A boot to the side of a cabinet. */
  kick(pan: number): void {
    const out = panned(pan);
    sweep(140, 55, 0.18, "sine", 0.3, 0, out);
    burst(0.12, "lowpass", 700, 0.18, { out });
    // Something loose rattling inside.
    for (let i = 0; i < 4; i++) burst(0.03, "bandpass", 2600 + i * 300, 0.04, { when: 0.08 + i * 0.05, q: 4, out });
  },
  /** Sparks from the coin door, and the electrical buzz. */
  spark(pan: number): void {
    const out = panned(pan);
    tone(120, 0.35, "sawtooth", 0, 0.05, out);
    tone(180, 0.3, "square", 0.02, 0.025, out);
    for (let i = 0; i < 7; i++) burst(0.025, "highpass", 3500, 0.09, { when: i * 0.045 + Math.random() * 0.02, out });
  },
  /** The screen flickering on for a moment. */
  flicker(pan: number): void {
    const out = panned(pan);
    tone(15700, 0.4, "sine", 0, 0.008, out); // the CRT's whine
    burst(0.15, "bandpass", 1800, 0.04, { q: 2, out });
  },
  /** Steam hissing out of an overheating cabinet. */
  steam(pan: number): void {
    burst(1.4, "highpass", 3000, 0.07, { attack: 0.15, out: panned(pan) });
  },
  /** A coin rattling out of the return slot and rolling away. */
  coinOut(pan: number): void {
    const out = panned(pan);
    tone(2349, 0.1, "triangle", 0.05, 0.06, out);
    // Bouncing on the carpet, each bounce quicker and quieter.
    [0.25, 0.42, 0.54, 0.62].forEach((at, i) => tone(2093, 0.05, "triangle", at, 0.04 / (i + 1), out));
  },
  /** A spray can: the ball rattling as it's shaken, then `seconds` of hiss in short strokes. */
  spray(pan: number, seconds: number): void {
    const out = panned(pan);
    for (let i = 0; i < 4; i++) burst(0.035, "bandpass", 3200, 0.07, { when: i * 0.1, q: 6, out });
    // Back-and-forth strokes: a hiss for each, with a breath between.
    const strokes = Math.max(1, Math.round(seconds / 0.3));
    for (let i = 0; i < strokes; i++) burst(0.26, "highpass", 4800, 0.07, { when: 0.45 + i * 0.3, attack: 0.03, out });
  },
  /** The secret: the machine splutters to life. */
  secret(pan: number): void {
    const out = panned(pan);
    sweep(80, 400, 0.5, "sawtooth", 0.05, 0, out);
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, "square", 0.55 + i * 0.11, 0.05, out));
  },
  /** And dies again. */
  powerDown(pan: number): void {
    const out = panned(pan);
    sweep(600, 40, 1.1, "sawtooth", 0.06, 0, out);
    burst(0.3, "lowpass", 400, 0.06, { when: 0.9, out });
  },
};
