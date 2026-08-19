// Run and level bookkeeping. Deliberately has no opinion on screens or audio —
// update.ts drives the transitions so this stays a cycle-free leaf.

import { levelConfig } from "../../shared/rules";
import { scoreLevel } from "../../shared/scoring";
import type { LevelStats, RunSummary } from "../../shared/types";
import { updateHud } from "../ui/hud";
import { BIRTHDAY_LIVES, CONTEST_LIVES, MODE, type GameMode } from "./config";
import { rand } from "./rng";
import { game, hazards, shots } from "./state";
import { applyTheme } from "../render/theme";
import { layoutHoles } from "./world";

/** Snapshot of the level in progress. */
export function currentLevelStats(): LevelStats {
  return {
    level: game.level,
    holes: game.holes,
    shots: game.levelShots,
    durationMs: Math.round(game.elapsed - game.levelStartMs),
    livesLost: game.levelLivesLost,
  };
}

export function beginLevel(n: number): void {
  game.level = n;
  game.cfg = levelConfig(n);
  game.holes = 0;
  game.levelStartMs = game.elapsed;
  game.levelShots = 0;
  game.levelLivesLost = 0;

  // Every level starts from a clean board and its own difficulty baseline; the
  // in-level ramp then builds pressure on top of that.
  hazards.length = 0;
  shots.length = 0;
  game.speedMult = 1;
  game.spawnMult = 1;
  game.rampTimer = 0;
  game.spawnTimer = 0;
  game.nextSpawn = rand(game.cfg.hazardSpawnMinMs, game.cfg.hazardSpawnMaxMs);

  applyTheme(n);
  layoutHoles();
  updateHud();
}

export function startRun(mode: GameMode): void {
  game.mode = mode;
  game.points = 0;
  game.maxLives = mode === MODE.CONTEST ? CONTEST_LIVES : BIRTHDAY_LIVES;
  game.lives = game.maxLives;
  game.elapsed = 0;
  game.log.length = 0;
  beginLevel(1);
}

/** Record the level just finished and add its points to the run total. */
export function bankLevel(): LevelStats {
  const stats = currentLevelStats();
  game.log.push(stats);
  game.points += scoreLevel(stats).total;
  return stats;
}

export function runSummary(): RunSummary {
  const levels = game.log;
  return {
    levelReached: game.level,
    levelsCleared: levels.filter((s) => s.holes >= levelConfig(s.level).holesToClear).length,
    points: game.points,
    durationMs: levels.reduce((sum, s) => sum + s.durationMs, 0),
    shotsFired: levels.reduce((sum, s) => sum + s.shots, 0),
    holesSunk: levels.reduce((sum, s) => sum + s.holes, 0),
    levels,
  };
}

export const isContest = (): boolean => game.mode === MODE.CONTEST;
