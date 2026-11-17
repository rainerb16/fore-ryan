// Public standings for one game. Reads go through the server too, so the
// Supabase key never ships to the browser and there is one path into the database.

import { personalBest, rankOf, topRuns, type LeaderboardRow } from "./_db";
import { LEADERBOARD_LIMIT } from "./_env";
import { contestEndsAt, contestIsClosed, LEGACY_GAME, serverGame } from "./_games";
import { fail, isUuid, json } from "./_http";

/** Named fields only, so nothing new leaks if a column is added to the view. */
const publicRow = (row: LeaderboardRow, rank: number | null) => ({
  rank,
  display_name: row.display_name,
  points: row.points,
  level_reached: row.level_reached,
  levels_cleared: row.levels_cleared,
  duration_ms: row.duration_ms,
  created_at: row.created_at,
});

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return fail(405, "Use GET");

  const url = new URL(req.url);
  const game = serverGame(url.searchParams.get("game") ?? LEGACY_GAME);
  if (!game) return fail(400, "Unknown game");
  const { id, sort } = game.entry;

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || LEADERBOARD_LIMIT));
  // Callers identify themselves with the player id their browser generated.
  const handle = url.searchParams.get("player");
  const playerId = isUuid(handle) ? handle : null;

  try {
    const [top, mine] = await Promise.all([
      topRuns(id, sort, limit),
      playerId ? personalBest(id, playerId) : Promise.resolve(null),
    ]);

    // Listed runs rank by position; one below the cut needs counting, or the
    // pinned row would show a dash where the whole point is the number.
    let mineRank: number | null = null;
    if (mine) {
      const listed = top.findIndex((r) => r.player_id === mine.player_id);
      mineRank = listed >= 0 ? listed + 1 : await rankOf(id, sort, mine);
    }

    return json({
      top: top.map((row, i) => publicRow(row, i + 1)),
      mine: mine ? publicRow(mine, mineRank) : null,
      closesAt: contestEndsAt(game)?.toISOString() ?? null,
      closed: contestIsClosed(game),
    });
  } catch (err) {
    console.error("leaderboard failed", err);
    return fail(500, "Could not load the leaderboard");
  }
};

export const config = { path: "/api/leaderboard" };
