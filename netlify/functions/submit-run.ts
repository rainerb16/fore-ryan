// Accepts a finished run. Everything the client claims is treated as a
// proposal: the game's own rules derive the score from the run's details and
// check them against what is physically possible, and the run token proves the
// run was started here, for this game, and has not been submitted before.

import { consumeToken, findToken, insertRun, recentRunCount } from "./_db";
import { RATE_LIMIT_PER_HOUR, TOKEN_TTL_MS, WALL_CLOCK_SLACK } from "./_env";
import { contestIsClosed, LEGACY_GAME, serverGame } from "./_games";
import { clientIp, fail, hashIp, isUuid, json } from "./_http";
import { cleanName, MAX_NAME_LENGTH } from "../../shared/names";

interface Payload {
  gameId?: unknown;
  token?: unknown;
  displayName?: unknown;
  playerId?: unknown;
  details?: unknown;
  /** What clients sent before the arcade adapter; still accepted. */
  summary?: unknown;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail(405, "Use POST");

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return fail(400, "Expected JSON");
  }

  const game = serverGame(body.gameId ?? LEGACY_GAME);
  if (!game) return fail(400, "Unknown game");
  if (contestIsClosed(game)) {
    return fail(403, "The contest has closed — this run can no longer be posted");
  }

  const displayName = cleanName(body.displayName);
  if (!displayName) return fail(400, `Enter a name of 1 to ${MAX_NAME_LENGTH} characters`);
  if (!isUuid(body.playerId)) return fail(400, "Missing player id");
  if (!isUuid(body.token)) return fail(400, "Missing run token");
  const details = body.details ?? body.summary;
  if (!details || typeof details !== "object") return fail(400, "Missing run summary");
  const playerId = body.playerId;

  // 1. The game's rules derive the score from the details, or refuse the run.
  const verdict = game.judge(details);
  if (!verdict.ok) {
    console.warn("rejected run", { game: game.entry.id, displayName, reasons: verdict.reasons });
    return fail(422, "That run did not add up");
  }

  try {
    // 2. The token has to exist, be for this game, be fresh, and be unused.
    const token = await findToken(body.token);
    if (!token) return fail(403, "Unknown run token");
    if (token.game_id !== game.entry.id) return fail(403, "That run token is for a different game");
    if (token.used_at) return fail(409, "That run was already submitted");

    const age = Date.now() - new Date(token.issued_at).getTime();
    if (age > TOKEN_TTL_MS) return fail(410, "That run took too long to submit");

    // 3. Wall-clock sanity: a run claiming 90 seconds of play cannot be
    //    submitted 10 seconds after the token was issued.
    if (age < verdict.durationMs * WALL_CLOCK_SLACK) {
      console.warn("rejected run: too fast in wall-clock terms", {
        game: game.entry.id,
        displayName,
        age,
        claimed: verdict.durationMs,
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

    if (verdict.flagged) console.warn("flagged run", { game: game.entry.id, displayName });

    await insertRun({
      game_id: game.entry.id,
      display_name: displayName,
      player_id: playerId,
      points: verdict.points,
      duration_ms: verdict.durationMs,
      run_token: body.token,
      flagged: verdict.flagged,
      ...verdict.columns,
      client_meta: {
        ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        ip_hash: hashIp(clientIp(req)),
        claimed_points: (details as { points?: unknown }).points ?? null,
      },
    });

    return json({ points: verdict.points });
  } catch (err) {
    console.error("submit-run failed", err);
    return fail(500, "Could not save that run");
  }
};

export const config = { path: "/api/submit-run" };
