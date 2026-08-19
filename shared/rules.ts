// Rules shared by the game client and the server-side score validator.
// Nothing here may touch the DOM, the canvas, or any browser API — a Netlify
// Function imports this file to re-derive a submitted score from scratch.

export const HAZARDS = ["water", "tree"] as const;
export type HazardType = (typeof HAZARDS)[number];

export const START_LIVES = 3;

/** Minimum ms between shots while fire is held. Also the validator's rate ceiling. */
export const SHOT_COOLDOWN = 320;

export interface LevelConfig {
  level: number;
  name: string;
  /** Holes that must be sunk to clear the level. */
  holesToClear: number;
  /** Holes on screen at once. */
  holeCount: number;
  holeSpeedMult: number;
  hazardSpawnMinMs: number;
  hazardSpawnMaxMs: number;
  hazardFallMult: number;
  /** Relative spawn weight per hazard type — this is what gives a level its flavour. */
  hazardWeights: Record<HazardType, number>;
  /** Target clear time. Beating it earns the speed bonus. */
  parMs: number;
}

/** Hand-tuned opening levels. Beyond these the tail is generated. */
export const AUTHORED_LEVELS: readonly LevelConfig[] = [
  {
    level: 1,
    name: "Driving Range",
    holesToClear: 5,
    holeCount: 2,
    holeSpeedMult: 1,
    hazardSpawnMinMs: 560,
    hazardSpawnMaxMs: 900,
    hazardFallMult: 1,
    hazardWeights: { water: 1, tree: 1 },
    parMs: 30000,
  },
  {
    level: 2,
    name: "Front Nine",
    holesToClear: 6,
    holeCount: 2,
    holeSpeedMult: 1.15,
    hazardSpawnMinMs: 540,
    hazardSpawnMaxMs: 860,
    hazardFallMult: 1.05,
    hazardWeights: { water: 1, tree: 1 },
    parMs: 34000,
  },
  {
    level: 3,
    name: "Water Hazard",
    holesToClear: 7,
    holeCount: 3,
    holeSpeedMult: 1.3,
    hazardSpawnMinMs: 480,
    hazardSpawnMaxMs: 780,
    hazardFallMult: 1.12,
    hazardWeights: { water: 3, tree: 1 },
    parMs: 40000,
  },
  {
    level: 4,
    name: "The Woods",
    holesToClear: 8,
    holeCount: 3,
    holeSpeedMult: 1.45,
    hazardSpawnMinMs: 430,
    hazardSpawnMaxMs: 700,
    hazardFallMult: 1.2,
    hazardWeights: { water: 1, tree: 3 },
    parMs: 46000,
  },
  {
    level: 5,
    name: "Championship",
    holesToClear: 9,
    holeCount: 3,
    holeSpeedMult: 1.6,
    hazardSpawnMinMs: 380,
    hazardSpawnMaxMs: 620,
    hazardFallMult: 1.3,
    hazardWeights: { water: 1, tree: 1 },
    parMs: 52000,
  },
];

// Endless tail: extrapolate from the last authored level, tightening on every
// axis with no plateau. A run therefore always ends — deep enough in, the level
// becomes unsurvivable and the leaderboard separates players on skill rather
// than on how long they were willing to sit there.
//
// The bounds below are safety rails, not difficulty caps, and sit far beyond any
// level a person will reach. Past them the simulation itself would misbehave: a
// hazard falling further than the player's own height between two frames could
// cross it without ever registering a hit, which would make deep levels easier.
const SAFETY = {
  /** A real cap — a very long level is tedious, not hard. */
  holesToClear: 12,
  holeSpeedMult: 8,
  hazardSpawnMinMs: 90,
  hazardSpawnMaxMs: 150,
  hazardFallMult: 6,
};

/** Stop stretching par this far in, so scores cannot run away on the speed bonus. */
const PAR_GROWTH_LEVELS = 15;

export function levelConfig(level: number): LevelConfig {
  const n = Math.max(1, Math.floor(level));
  const authored = AUTHORED_LEVELS[n - 1];
  if (authored) return authored;

  const base = AUTHORED_LEVELS[AUTHORED_LEVELS.length - 1];
  const t = n - AUTHORED_LEVELS.length; // 1, 2, 3, ... into the tail

  const holesToClear = Math.min(SAFETY.holesToClear, base.holesToClear + Math.ceil(t / 2));
  return {
    level: n,
    name: `Sudden Death ${t}`,
    holesToClear,
    holeCount: base.holeCount,
    holeSpeedMult: Math.min(SAFETY.holeSpeedMult, base.holeSpeedMult * 1.06 ** t),
    hazardSpawnMinMs: Math.max(SAFETY.hazardSpawnMinMs, base.hazardSpawnMinMs * 0.94 ** t),
    hazardSpawnMaxMs: Math.max(SAFETY.hazardSpawnMaxMs, base.hazardSpawnMaxMs * 0.94 ** t),
    hazardFallMult: Math.min(SAFETY.hazardFallMult, base.hazardFallMult * 1.04 ** t),
    // Alternate the flavour so the tail doesn't feel like one long level.
    hazardWeights: t % 2 === 1 ? { water: 2, tree: 1 } : { water: 1, tree: 2 },
    parMs: holesToClear * (5200 + 200 * Math.min(t, PAR_GROWTH_LEVELS)),
  };
}
