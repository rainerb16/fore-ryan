import { HEAD_R, START_LIVES, STATE, type GameState } from "./config";
import type { Confetti, Hazard, Hole, Player, Shot, Spark } from "./types";

/** Scalar game state. Grouped in one object so modules share live values. */
export const game = {
  W: 0,
  H: 0,
  scale: 1,
  baseHeadR: HEAD_R,
  state: STATE.START as GameState,
  score: 0,
  lives: START_LIVES,
  elapsed: 0,
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
