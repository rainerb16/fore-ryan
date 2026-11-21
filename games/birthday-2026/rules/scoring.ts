// The points formula. The client shows it; the server re-derives it from the
// submitted per-level stats and rejects anything that doesn't reproduce.

import { CONTEST_LIVES, levelConfig, SHOT_COOLDOWN } from "./rules";
import type { LevelScore, LevelStats, RunSummary } from "./types";

export const SCORING = {
  /** Per hole sunk, multiplied by the level number. */
  holeBase: 100,
  /** Awarded once for clearing a level, multiplied by the level number. */
  levelClear: 500,
  /** Clearing a level without losing a life, multiplied by the level number. */
  flawlessBonus: 300,
  /** Per whole second under par, multiplied by the level number. */
  speedPerSecond: 20,
} as const;

/**
 * Score one level. A level the player died on still earns hole points — progress
 * counts — but none of the clear, flawless, or speed bonuses.
 */
export function scoreLevel(stats: LevelStats): LevelScore {
  const cfg = levelConfig(stats.level);
  const mult = cfg.level;
  const cleared = stats.holes >= cfg.holesToClear;

  const holes = stats.holes * SCORING.holeBase * mult;
  const clear = cleared ? SCORING.levelClear * mult : 0;
  const flawless = cleared && stats.livesLost === 0 ? SCORING.flawlessBonus * mult : 0;
  const secondsUnderPar = cleared
    ? Math.max(0, Math.floor((cfg.parMs - stats.durationMs) / 1000))
    : 0;
  const speed = secondsUnderPar * SCORING.speedPerSecond * mult;

  return { holes, clear, flawless, speed, total: holes + clear + flawless + speed };
}

export function runTotal(levels: readonly LevelStats[]): number {
  return levels.reduce((sum, s) => sum + scoreLevel(s).total, 0);
}

// --- validation -------------------------------------------------------------

/**
 * Fastest the holes sunk could have been sunk: one shot each at the fire-rate
 * ceiling, plus a beat for the last ball. Scales with holes rather than with the
 * level's target, because the level a run ends on is cut short — measuring that
 * against a full clear would call an ordinary quick death impossible.
 */
export function minLevelMs(level: number, holes?: number): number {
  const cfg = levelConfig(level);
  const sunk = Math.min(holes ?? cfg.holesToClear, cfg.holesToClear);
  return sunk > 0 ? sunk * SHOT_COOLDOWN + 400 : 0;
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
  /** Score recomputed from the submitted stats, whatever the client claimed. */
  computedPoints: number;
}

/** Server-side gate. Never trust `summary.points` — trust this. */
export function validateRun(summary: RunSummary): ValidationResult {
  const reasons: string[] = [];
  const levels = summary.levels ?? [];

  if (levels.length === 0) reasons.push("no levels recorded");
  if (levels.length > 200) reasons.push("implausible level count");

  let livesLost = 0;
  let durationMs = 0;
  let shots = 0;
  let holes = 0;

  levels.forEach((s, i) => {
    const cfg = levelConfig(s.level);
    const where = `level ${s.level}`;

    if (s.level !== i + 1) reasons.push(`${where}: levels out of sequence`);
    if (s.holes < 0 || s.holes > cfg.holesToClear) reasons.push(`${where}: hole count out of range`);
    if (s.shots < s.holes) reasons.push(`${where}: more holes than shots`);
    if (s.durationMs < minLevelMs(s.level, s.holes)) {
      reasons.push(`${where}: sunk faster than possible`);
    }
    if (s.shots > s.durationMs / SHOT_COOLDOWN + 2) reasons.push(`${where}: fire rate exceeded`);
    if (s.livesLost < 0 || s.livesLost > CONTEST_LIVES) reasons.push(`${where}: bad life count`);

    // Only the final level may be incomplete — you can't advance without clearing.
    const cleared = s.holes >= cfg.holesToClear;
    if (!cleared && i !== levels.length - 1) reasons.push(`${where}: advanced without clearing`);

    livesLost += s.livesLost;
    durationMs += s.durationMs;
    shots += s.shots;
    holes += s.holes;
  });

  if (livesLost > CONTEST_LIVES) reasons.push("lost more lives than the run allows");

  const computedPoints = runTotal(levels);
  if (summary.shotsFired !== shots) reasons.push("shot total does not match per-level stats");
  if (summary.holesSunk !== holes) reasons.push("hole total does not match per-level stats");
  if (Math.abs(summary.durationMs - durationMs) > 1500) {
    reasons.push("run duration does not match per-level stats");
  }

  return { ok: reasons.length === 0, reasons, computedPoints };
}

// --- plausibility -----------------------------------------------------------

/**
 * Where real play ends, with room to spare. Set from the rules and the live
 * board in Nov 2026, whose best run reached level 13 at about 2s a hole.
 */
export const PLAUSIBLE = {
  /** Deepest level a run may reach. The tail gets exponentially harder. */
  maxLevel: 20,
  /**
   * Fastest any one cleared level may go per hole. With 3 holes on screen a
   * flawless player can briefly manage about 0.45s; the fire rate allows 0.32s.
   */
  minMsPerHole: 400,
  /** Fastest a run's cleared levels may average per hole. The board's best is about 1.8s. */
  minAvgMsPerHole: 600,
  /** Highest share of shots that may sink a hole, once there are enough to tell. */
  maxAccuracy: 0.9,
  accuracyFromHoles: 20,
} as const;

/**
 * Why a run that adds up still looks like no real player made it, or nothing.
 * Such a run is kept but flagged, which keeps it off the board for a person to
 * look at. Call on a run `validateRun` accepted.
 */
export function implausible(summary: RunSummary): string[] {
  const reasons: string[] = [];
  const levels = summary.levels;

  // Counted from the levels themselves: the claimed level is only a label.
  const played = levels.length;
  if (played > PLAUSIBLE.maxLevel) reasons.push(`reached level ${played}, past ${PLAUSIBLE.maxLevel}`);
  if (summary.levelReached !== played) reasons.push(`claims level ${summary.levelReached} but played ${played}`);

  let clearedMs = 0;
  let clearedHoles = 0;
  for (const s of levels) {
    if (s.holes < levelConfig(s.level).holesToClear) continue;
    clearedMs += s.durationMs;
    clearedHoles += s.holes;
    if (s.durationMs < s.holes * PLAUSIBLE.minMsPerHole) {
      reasons.push(`level ${s.level}: cleared too fast (${Math.round(s.durationMs / s.holes)}ms a hole)`);
    }
  }
  if (clearedHoles > 0 && clearedMs < clearedHoles * PLAUSIBLE.minAvgMsPerHole) {
    reasons.push(`averaged ${Math.round(clearedMs / clearedHoles)}ms a hole over its cleared levels`);
  }

  if (summary.holesSunk >= PLAUSIBLE.accuracyFromHoles && summary.shotsFired > 0) {
    const accuracy = summary.holesSunk / summary.shotsFired;
    if (accuracy > PLAUSIBLE.maxAccuracy) reasons.push(`accuracy ${Math.round(accuracy * 100)}%`);
  }
  return reasons;
}
