// Public standings. Reads go through the server too, so the Supabase key never
// ships to the browser and there is one path into the database.

import { personalBest, rankOf, topRuns, type LeaderboardRow } from "./_db";
import { contestEndsAt, contestIsClosed, LEADERBOARD_LIMIT } from "./_env";
import { fail, json } from "./_http";

/**
 * Callers identify themselves with the handle submit-run gave them, never an
 * address: query strings end up in access logs.
 */
const isHandle = (v: string | null): v is string => v !== null && /^[0-9a-f]{64}$/.test(v);

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
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || LEADERBOARD_LIMIT),
  );
  const handle = url.searchParams.get("handle");
  const mineHash = isHandle(handle) ? handle : null;

  try {
    const [top, mine] = await Promise.all([
      topRuns(limit),
      mineHash ? personalBest(mineHash) : Promise.resolve(null),
    ]);

    // Listed runs rank by position; one below the cut needs counting, or the
    // pinned row would show a dash where the whole point is the number.
    let mineRank: number | null = null;
    if (mine) {
      const listed = top.findIndex((r) => r.email_hash === mine.email_hash);
      mineRank = listed >= 0 ? listed + 1 : await rankOf(mine);
    }

    return json({
      top: top.map((row, i) => publicRow(row, i + 1)),
      mine: mine ? publicRow(mine, mineRank) : null,
      closesAt: contestEndsAt()?.toISOString() ?? null,
      closed: contestIsClosed(),
    });
  } catch (err) {
    console.error("leaderboard failed", err);
    return fail(500, "Could not load the leaderboard");
  }
};

export const config = { path: "/api/leaderboard" };
