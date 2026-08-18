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

// Endless tail: extrapolate from the last authored level. Every axis is capped so
// deep levels stay hard-but-possible rather than mathematically unwinnable.
const TAIL_CAPS = {
  holesToClear: 12,
  holeSpeedMult: 2.6,
  hazardSpawnMinMs: 240,
  hazardSpawnMaxMs: 420,
  hazardFallMult: 1.9,
};

export function levelConfig(level: number): LevelConfig {
  const n = Math.max(1, Math.floor(level));
  const authored = AUTHORED_LEVELS[n - 1];
  if (authored) return authored;

  const base = AUTHORED_LEVELS[AUTHORED_LEVELS.length - 1];
  const t = n - AUTHORED_LEVELS.length; // 1, 2, 3, ... into the tail

  const holesToClear = Math.min(TAIL_CAPS.holesToClear, base.holesToClear + Math.ceil(t / 2));
  return {
    level: n,
    name: `Sudden Death ${t}`,
    holesToClear,
    holeCount: base.holeCount,
    holeSpeedMult: Math.min(TAIL_CAPS.holeSpeedMult, base.holeSpeedMult * 1.06 ** t),
    hazardSpawnMinMs: Math.max(TAIL_CAPS.hazardSpawnMinMs, base.hazardSpawnMinMs * 0.94 ** t),
    hazardSpawnMaxMs: Math.max(TAIL_CAPS.hazardSpawnMaxMs, base.hazardSpawnMaxMs * 0.94 ** t),
    hazardFallMult: Math.min(TAIL_CAPS.hazardFallMult, base.hazardFallMult * 1.04 ** t),
    // Alternate the flavour so the tail doesn't feel like one long level.
    hazardWeights: t % 2 === 1 ? { water: 2, tree: 1 } : { water: 1, tree: 2 },
    parMs: holesToClear * (5200 + 200 * t),
  };
}
