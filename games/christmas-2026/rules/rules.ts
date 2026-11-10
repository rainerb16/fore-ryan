// Scoring and the plausibility limits the server applies to a submitted jump.
// The limits come from running the simulation itself, so they move with any
// retuning instead of drifting out of step with it.

import { INRUN_LENGTH } from "./hill";
import { newJump, PHYSICS, step, type Jump, type TakeoffQuality } from "./sim";

export const GAME_ID = "christmas-2026";

/** The brief's hard bounds. Anything outside is kept but flagged for a look. */
export const MAX_DISTANCE_M = 250;
const MAX_DURATION_MS = 120_000;

/** What the game submits as the run's `details`. */
export interface JumpDetails {
  distance_m: number;
  takeoff_quality: TakeoffQuality;
  crashed: boolean;
  best_glide_ms: number;
  duration_ms: number;
}

/** Points are centimetres, so they fit the existing integer column. */
export const pointsFor = (distanceM: number): number => Math.round(distanceM * 100);

export const QUALITIES: readonly TakeoffQuality[] = ["perfect", "good", "late"];

const DT = 1 / 120;

/**
 * Plays a whole jump: tap `tapBefore` seconds before the lip (null for never),
 * and hold through the flight while `holding(j)` says so.
 */
export function simulate(tapBefore: number | null, holding: (j: Jump) => boolean): Jump {
  const j = newJump();
  step(j, { pressed: true, held: true }, DT);
  let tapped = false;
  while (j.phase !== "done" && j.time < 600) {
    let pressed = false;
    if (j.phase === "inrun" && tapBefore !== null && !tapped) {
      const toLip = (INRUN_LENGTH - j.s) / Math.max(j.speed, 0.01);
      if (toLip <= tapBefore) pressed = tapped = true;
    }
    step(j, { pressed, held: j.phase === "flight" && holding(j) }, DT);
  }
  return j;
}

/** A representative tap for each grade, and "late" never taps at all. */
const TAP: Record<TakeoffQuality, number | null> = {
  perfect: 0.02,
  good: (PHYSICS.perfectWindow + PHYSICS.earlyWindow) / 2,
  late: null,
};

/**
 * The furthest each take-off can go: holding the whole flight. That lands as a
 * crash, so any real jump with that take-off is shorter.
 */
export const LONGEST: Record<TakeoffQuality, number> = Object.fromEntries(
  QUALITIES.map((q) => [q, simulate(TAP[q], () => true).distance ?? 0]),
) as Record<TakeoffQuality, number>;

/** The quickest possible run, push-off to done: a late take-off, never holding. */
export const SHORTEST_RUN_MS = simulate(null, () => false).time * 1000;

/** Longest flight there is, so the longest anyone can hold a glide. */
const LONGEST_GLIDE_MS = (() => {
  const j = simulate(TAP.perfect, () => true);
  return (j.landedTime - j.takeoffTime) * 1000;
})();

export type JumpVerdict =
  | { ok: false; reasons: string[] }
  | { ok: true; points: number; durationMs: number; flagged: boolean; reasons: string[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Malformed or crashed jumps are refused. A well-formed jump outside what the
 * simulation allows is accepted but flagged, so a person can look at it.
 */
export function judgeJump(raw: unknown): JumpVerdict {
  const d = raw as Partial<JumpDetails> | null;
  if (!d || typeof d !== "object") return { ok: false, reasons: ["no details"] };
  if (!isNum(d.distance_m) || !isNum(d.best_glide_ms) || !isNum(d.duration_ms)) {
    return { ok: false, reasons: ["missing or non-numeric stats"] };
  }
  if (typeof d.crashed !== "boolean" || !QUALITIES.includes(d.takeoff_quality as TakeoffQuality)) {
    return { ok: false, reasons: ["missing or unknown take-off or crash flag"] };
  }
  if (d.crashed) return { ok: false, reasons: ["crashed jumps do not count"] };

  const quality = d.takeoff_quality as TakeoffQuality;
  const reasons: string[] = [];
  if (d.distance_m < 0 || d.distance_m > MAX_DISTANCE_M) reasons.push(`distance ${d.distance_m} m outside 0–${MAX_DISTANCE_M}`);
  // 2% headroom for frame timing differences between devices.
  if (d.distance_m > LONGEST[quality] * 1.02) reasons.push(`farther than a ${quality} take-off can go`);
  if (d.duration_ms < SHORTEST_RUN_MS * 0.95 || d.duration_ms > MAX_DURATION_MS) {
    reasons.push(`run of ${d.duration_ms} ms is not plausible`);
  }
  if (d.best_glide_ms < 0 || d.best_glide_ms > LONGEST_GLIDE_MS * 1.05) reasons.push("glide longer than any flight");

  return {
    ok: true,
    points: pointsFor(Math.min(Math.max(d.distance_m, 0), MAX_DISTANCE_M)),
    durationMs: Math.round(d.duration_ms),
    flagged: reasons.length > 0,
    reasons,
  };
}

/** The details a finished jump submits. */
export function detailsOf(j: Jump): JumpDetails {
  return {
    distance_m: Math.round((j.distance ?? 0) * 100) / 100,
    takeoff_quality: j.quality ?? "late",
    crashed: j.crashed,
    best_glide_ms: Math.round(j.bestGlide * 1000),
    duration_ms: Math.round(j.time * 1000),
  };
}
