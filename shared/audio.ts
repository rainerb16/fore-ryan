// The sound engine every page shares, synthesized with WebAudio (no files).
// Each page makes one and keeps only its own sounds; this handles starting the
// audio on a tap, which browsers insist on, and stopping it with the page.

import { store } from "./storage";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
  interface Navigator {
    audioSession?: { type: string };
  }
}

export interface AudioOptions {
  /** localStorage key that remembers the mute button. */
  muteKey: string;
  /** Overall volume, under 1 for headroom. */
  level: number;
  /**
   * Plays with the iPhone ringer on silent, as games and videos do. It also
   * pauses the player's own music, so it suits a game, not a background hum.
   */
  playOnSilent?: boolean;
  /** Builds anything that runs the whole time (room tone, wind), once. */
  onReady?: (ctx: AudioContext, master: GainNode, noise: AudioBuffer) => void;
  /** Drops anything scheduled ahead (a song), on mute or leaving the page. */
  onStop?: () => void;
}

export interface BurstOptions {
  when?: number;
  attack?: number;
  q?: number;
  out?: AudioNode | null;
}

export interface Audio {
  readonly context: AudioContext | null;
  readonly master: GainNode | null;
  isMuted(): boolean;
  setMuted(on: boolean): void;
  /** Starts or resumes the audio. Safe to call on every tap. */
  start(): void;
  /** Calls `start` on every tap and key press from now on. */
  listen(): void;
  /** Silences it for the rest of the page, without touching the mute setting. */
  stop(): void;
  /** A note with a quick attack and a decay. */
  tone(freq: number, dur: number, type: OscillatorType, when?: number, vol?: number, out?: AudioNode | null): void;
  /** A pitch that slides from one frequency to another: thuds and swooshes. */
  sweep(from: number, to: number, dur: number, type: OscillatorType, vol: number, when?: number, out?: AudioNode | null): void;
  /** A burst of filtered noise: crunches, hisses, cheers. */
  burst(dur: number, type: BiquadFilterType, freq: number, vol: number, opts?: BurstOptions): void;
}

/** Rounds off peaks rather than clipping them: untouched below 0.7, eased above. */
function softClip(ctx: AudioContext): WaveShaperNode {
  const soft = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const over = Math.abs(x) - 0.7;
    curve[i] = over <= 0 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh(over / 0.3));
  }
  soft.curve = curve;
  soft.oversample = "2x";
  return soft;
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio(opts: AudioOptions): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = store.get(opts.muteKey, "0") === "1";
  let stopped = false;

  // Not just "suspended": iOS parks audio as "interrupted" after a call, the
  // lock screen or a notification, and only a resume brings it back.
  const resume = (): void => {
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  };
  const suspend = (): void => {
    ctx?.suspend().catch(() => {});
  };

  function build(): void {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS 17+; elsewhere there is no audioSession and the option does nothing.
    if (opts.playOnSilent && navigator.audioSession) navigator.audioSession.type = "playback";
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = opts.level;
    master.connect(softClip(ctx)).connect(ctx.destination);
    noise = makeNoise(ctx);
    // A page's own setup failing should not take its sound effects with it.
    try {
      opts.onReady?.(ctx, master, noise);
    } catch (err) {
      console.error("Audio setup failed", err);
    }
  }

  function start(): void {
    if (muted || stopped || document.hidden) return;
    // A closed context can never resume, so start over with a new one.
    if (ctx?.state === "closed") ctx = master = noise = null;
    if (!ctx) build();
    resume();
  }

  // A hidden tab, or a page left for another: silence. A page kept for Back
  // resumes when it is shown again.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) suspend();
    else if (!muted && !stopped) resume();
  });
  window.addEventListener("pagehide", () => {
    opts.onStop?.();
    suspend();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && !document.hidden && !muted && !stopped) resume();
  });

  return {
    get context() {
      return ctx;
    },
    get master() {
      return master;
    },
    isMuted: () => muted,
    setMuted(on) {
      muted = on;
      store.set(opts.muteKey, on ? "1" : "0");
      if (ctx && master) master.gain.setTargetAtTime(on ? 0 : opts.level, ctx.currentTime, 0.03);
      if (on) {
        opts.onStop?.();
        // Pause once the fade is done; stopping mid-wave would click.
        setTimeout(() => muted && suspend(), 150);
      } else {
        start();
      }
    },
    start,
    stop() {
      stopped = true;
      suspend();
    },
    listen() {
      // Touch only counts as a gesture that may start audio when the finger
      // lifts (iOS especially), so listen for the end of a touch and clicks too.
      for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const) {
        window.addEventListener(type, start, { capture: true });
      }
    },
    tone(freq, dur, type, when = 0, vol = 0.18, out = master) {
      if (muted || !ctx || !out) return;
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
    },
    sweep(from, to, dur, type, vol, when = 0, out = master) {
      if (muted || !ctx || !out) return;
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
    },
    burst(dur, type, freq, vol, { when = 0, attack = 0.005, q = 0.8, out = master } = {}) {
      if (muted || !ctx || !noise || !out) return;
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
    },
  };
}
