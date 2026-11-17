/** What one level of a contest run produced. Recorded per level, submitted as a set. */
export interface LevelStats {
  level: number;
  /** Holes sunk. Below the level's holesToClear means the run ended here. */
  holes: number;
  shots: number;
  durationMs: number;
  livesLost: number;
}

export interface LevelScore {
  holes: number;
  clear: number;
  flawless: number;
  speed: number;
  total: number;
}

/** A finished contest run, as submitted to the leaderboard. */
export interface RunSummary {
  levelReached: number;
  levelsCleared: number;
  points: number;
  durationMs: number;
  shotsFired: number;
  holesSunk: number;
  levels: LevelStats[];
}
