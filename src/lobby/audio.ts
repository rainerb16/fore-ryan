// The arcade's sound, synthesized with WebAudio like the games' (no files): a
// quiet room tone with the odd blip from a machine in attract mode, a tick as
// the camera moves between cabinets, a coin dropping in on PLAY, and the
// broken machines' sparks, steam, clunks and secrets. Kept low: it's a room,
// not a game. Starts on the first tap or key press, so autoplay never blocks it.

import { createAudio } from "../../shared/audio";

/** A faint attract-mode jingle every so often, once the sound has started. */
let blipTimer = 0;

const audio = createAudio({
  muteKey: "arcade.muted",
  level: 0.7,
  onReady(ctx, master, noise) {
    roomTone(ctx, master, noise);
    scheduleBlip();
  },
});
const { tone, sweep, burst } = audio;

export const isMuted = audio.isMuted;
export const setMuted = audio.setMuted;
/** Starts the sound on every tap or key press from now on. */
export const listenForTaps = audio.listen;
/** No more sound on this page: the 3D arcade has gone. */
export const stopSound = audio.stop;

/** The hum of a room full of machines: mains hum and a low, soft rumble. */
function roomTone(c: AudioContext, out: AudioNode, noise: AudioBuffer): void {
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

function panned(pan: number): AudioNode | null {
  const { context: ctx, master } = audio;
  if (!ctx || !master) return null;
  if (pan === 0 || !ctx.createStereoPanner) return master;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
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
    if (audio.context?.state === "running") {
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
  /** The little bell over a shop door, as it opens. */
  doorBell(): void {
    [0, 0.13, 0.3].forEach((at, i) => {
      tone(2637, 0.6, "sine", at, 0.07 / (i + 1));
      tone(3951, 0.4, "sine", at + 0.01, 0.035 / (i + 1));
    });
    burst(0.4, "bandpass", 700, 0.04, { attack: 0.05, q: 1 }); // the door's whoosh
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
