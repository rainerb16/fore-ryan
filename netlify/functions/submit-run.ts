// Accepts a finished contest run. Everything the client claims is treated as a
// proposal: the score is recomputed from the per-level stats, the stats are
// checked against what the rules physically allow, and the run token proves the
// run was actually started here and has not been submitted before.

import { consumeToken, findToken, insertRun, recentRunCount } from "./_db";
import { contestIsClosed, RATE_LIMIT_PER_HOUR, TOKEN_TTL_MS, WALL_CLOCK_SLACK } from "./_env";
import { cleanName, clientIp, fail, hashIp, isUuid, json } from "./_http";
import { validateRun } from "../../shared/scoring";
import type { RunSummary } from "../../shared/types";

interface Payload {
  token?: unknown;
  displayName?: unknown;
  playerId?: unknown;
  summary?: unknown;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail(405, "Use POST");

  if (contestIsClosed()) {
    return fail(403, "The contest has closed — this run can no longer be posted");
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return fail(400, "Expected JSON");
  }

  const displayName = cleanName(body.displayName);
  if (!displayName) return fail(400, "Enter a name of 1 to 40 characters");
  if (!isUuid(body.playerId)) return fail(400, "Missing player id");
  if (!isUuid(body.token)) return fail(400, "Missing run token");
  if (!body.summary || typeof body.summary !== "object") return fail(400, "Missing run summary");

  const summary = body.summary as RunSummary;
  const playerId = body.playerId;

  // 1. The run has to reproduce its own score from its own stats.
  const check = validateRun(summary);
  if (!check.ok) {
    console.warn("rejected run", { displayName, reasons: check.reasons });
    return fail(422, "That run did not add up");
  }

  try {
    // 2. The token has to exist, be fresh, and not have been used.
    const token = await findToken(body.token);
    if (!token) return fail(403, "Unknown run token");
    if (token.used_at) return fail(409, "That run was already submitted");

    const issuedAt = new Date(token.issued_at).getTime();
    const age = Date.now() - issuedAt;
    if (age > TOKEN_TTL_MS) return fail(410, "That run took too long to submit");

    // 3. Wall-clock sanity: a run claiming 90 seconds of play cannot be
    //    submitted 10 seconds after the token was issued.
    if (age < summary.durationMs * WALL_CLOCK_SLACK) {
      console.warn("rejected run: too fast in wall-clock terms", {
        displayName,
        age,
        claimed: summary.durationMs,
      });
      return fail(422, "That run did not add up");
    }

    // 4. Rate limit per player, so nobody can grind the endpoint.
    if ((await recentRunCount(playerId)) >= RATE_LIMIT_PER_HOUR) {
      return fail(429, "Too many runs submitted in the last hour — try again shortly");
    }

    // 5. Consume the token. This is atomic: if two submissions race, only one
    //    gets the row back and the other is rejected as a replay.
    if (!(await consumeToken(body.token))) {
      return fail(409, "That run was already submitted");
    }

    await insertRun({
      display_name: displayName,
      player_id: playerId,
      // The server's own number, never the client's claim.
      points: check.computedPoints,
      level_reached: summary.levelReached,
      levels_cleared: summary.levelsCleared,
      duration_ms: Math.round(summary.durationMs),
      shots_fired: summary.shotsFired,
      holes_sunk: summary.holesSunk,
      levels: summary.levels,
      run_token: body.token,
      client_meta: {
        ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        ip_hash: hashIp(clientIp(req)),
        claimed_points: summary.points,
      },
    });

    return json({ points: check.computedPoints });
  } catch (err) {
    console.error("submit-run failed", err);
    return fail(500, "Could not save that run");
  }
};

export const config = { path: "/api/submit-run" };
