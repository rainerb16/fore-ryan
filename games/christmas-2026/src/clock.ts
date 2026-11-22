// Runs the simulation in fixed steps that keep pace with real time, so every
// device plays the same jump. Each step is told the real moment it stands for,
// so a tap can be applied at the step it happened in, not the next frame's first.

export interface StepClock {
  /**
   * Runs every step due by `nowMs` (a frame's timestamp). `run` gets the real
   * time each step ends at; `scale` is how fast simulation time runs right now
   * (slow motion is below 1).
   */
  advance(nowMs: number, run: (endMs: number) => void, scale: () => number): void;
  /** How far the next step has got, 0 to 1, for drawing between two steps. */
  readonly blend: number;
  /** Starts the clock again from the next `advance`. */
  reset(): void;
}

/** `step` is in simulation seconds; a hidden tab catches up at most `maxCatchUp` seconds. */
export function createStepClock(step: number, maxCatchUp = 0.1): StepClock {
  /** Real time, in ms, the simulation has reached. */
  let simAt: number | null = null;
  let blend = 0;
  return {
    advance(nowMs, run, scale) {
      if (simAt === null) simAt = nowMs;
      // Back from a hidden tab: skip ahead rather than replay seconds at once.
      simAt = Math.max(simAt, nowMs - maxCatchUp * 1000);
      for (;;) {
        const stepMs = (step * 1000) / scale();
        if (simAt + stepMs > nowMs) {
          blend = Math.max(0, (nowMs - simAt) / stepMs);
          return;
        }
        simAt += stepMs;
        run(simAt);
      }
    },
    get blend() {
      return blend;
    },
    reset() {
      simAt = null;
      blend = 0;
    },
  };
}
