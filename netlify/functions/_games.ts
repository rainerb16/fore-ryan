// What the server knows about each game: when its contest closes, and how to
// turn a submitted run's details into a trusted score and the columns stored.
// A game with no entry here cannot start or post runs.

import { gameById, type GameEntry } from "../../shared/games";
import { validateRun } from "../../games/birthday-2026/rules/scoring";
import type { RunSummary } from "../../games/birthday-2026/rules/types";
import type { RunColumns } from "./_db";

/**
 * Rejected runs are refused outright. Accepted runs may still be flagged: a
 * plausible-but-surprising run is kept for a human to look at rather than lost.
 */
export type Verdict =
  | { ok: false; reasons: string[] }
  | { ok: true; points: number; durationMs: number; flagged: boolean; columns: RunColumns };

export interface ServerGame {
  entry: GameEntry;
  /** Env var holding the contest's closing time, as an ISO timestamp. */
  closesAtVar: string;
  judge(details: unknown): Verdict;
}

const RULES: Record<string, Omit<ServerGame, "entry">> = {
  "birthday-2026": {
    // The name it had before the arcade, so the deployed setting still applies.
    closesAtVar: "CONTEST_ENDS_AT",
    judge(details) {
      const summary = details as RunSummary;
      const check = validateRun(summary);
      if (!check.ok) return { ok: false, reasons: check.reasons };
      return {
        ok: true,
        // The server's own number, never the client's claim.
        points: check.computedPoints,
        durationMs: Math.round(summary.durationMs),
        flagged: false,
        columns: {
          level_reached: summary.levelReached,
          levels_cleared: summary.levelsCleared,
          shots_fired: summary.shotsFired,
          holes_sunk: summary.holesSunk,
          levels: summary.levels,
        },
      };
    },
  },
};

export function serverGame(id: unknown): ServerGame | null {
  const entry = gameById(id);
  const rules = entry && RULES[entry.id];
  return entry && rules ? { entry, ...rules } : null;
}

/** Runs from clients older than the arcade carry no game id; they were all golf. */
export const LEGACY_GAME = "birthday-2026";

/** When this game's contest closes, or null if it runs indefinitely. */
export function contestEndsAt(game: ServerGame): Date | null {
  const raw = process.env[game.closesAtVar];
  if (!raw) return null;
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) {
    console.warn(`Ignoring unparseable ${game.closesAtVar}: ${raw}`);
    return null;
  }
  return when;
}

export function contestIsClosed(game: ServerGame): boolean {
  const ends = contestEndsAt(game);
  return ends !== null && Date.now() > ends.getTime();
}
