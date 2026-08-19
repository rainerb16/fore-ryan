import { BIRTHDAY_LIVES, HEAD_R, MODE, STATE, type GameMode, type GameState } from "./config";
import { levelConfig } from "../../shared/rules";
import type { LevelConfig } from "../../shared/rules";
import type { LevelStats } from "../../shared/types";
import type { Confetti, Hazard, Hole, Player, Shot, Spark } from "./types";

/** Scalar game state. Grouped in one object so modules share live values. */
export const game = {
  W: 0,
  H: 0,
  scale: 1,
  /** Device pixel ratio the canvas was sized at. */
  dpr: 1,
  baseHeadR: HEAD_R,
  state: STATE.START as GameState,
  mode: MODE.BIRTHDAY as GameMode,

  // --- progression ---
  level: 1,
  cfg: levelConfig(1) as LevelConfig,
  /** Holes sunk in the current level. */
  holes: 0,
  /** Points banked from levels already scored. */
  points: 0,
  lives: BIRTHDAY_LIVES,
  /** Lives this mode starts with, so the HUD knows how many hearts to draw. */
  maxLives: BIRTHDAY_LIVES,
  /** Total run time. Also the birthday round's clock. */
  elapsed: 0,

  // --- current level tally, folded into `log` when the level ends ---
  levelStartMs: 0,
  levelShots: 0,
  levelLivesLost: 0,
  log: [] as LevelStats[],
  /** Server-issued token for the contest run in progress; null when unsubmittable. */
  runToken: null as string | null,

  spawnTimer: 0,
  nextSpawn: 0,
  shotTimer: 0,
  speedMult: 1,
  spawnMult: 1,
  rampTimer: 0,
  invuln: 0,
  shake: 0,
  firing: false,
  dragging: false,
  frozen: false,
  finale: false,
  finaleT: 0,
  rainTimer: 0,
};

export const player: Player = { x: 0, y: 0, targetX: null, lean: 0, spinT: 0, spinDir: 1 };
export const shots: Shot[] = [];
export const hazards: Hazard[] = [];
export const holes: Hole[] = [];
export const confetti: Confetti[] = [];
export const sparks: Spark[] = [];
export const keys = { left: false, right: false };
