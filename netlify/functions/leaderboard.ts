// Public standings. Reads go through the server too, so the Supabase anon key
// never ships to the browser and there is only one path into the database.

import { personalBest, topRuns } from "./_db";
import { contestEndsAt, contestIsClosed, LEADERBOARD_LIMIT } from "./_env";
import { fail, hashEmail, json, looksLikeEmail } from "./_http";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return fail(405, "Use GET");

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || LEADERBOARD_LIMIT));
  // Optional: the caller's own email, so they can see their standing without
  // it being in the top list. Hashed here; never stored by this endpoint.
  const self = url.searchParams.get("email");

  try {
    const [top, mine] = await Promise.all([
      topRuns(limit),
      looksLikeEmail(self) ? personalBest(hashEmail(self)) : Promise.resolve(null),
    ]);

    const ranked = top.map((row, i) => ({ rank: i + 1, ...row }));
    const rank = mine ? ranked.find((r) => r.points === mine.points && r.display_name === mine.display_name)?.rank ?? null : null;

    return json({
      top: ranked,
      mine: mine ? { ...mine, rank } : null,
      closesAt: contestEndsAt()?.toISOString() ?? null,
      closed: contestIsClosed(),
    });
  } catch (err) {
    console.error("leaderboard failed", err);
    return fail(500, "Could not load the leaderboard");
  }
};

export const config = { path: "/api/leaderboard" };
