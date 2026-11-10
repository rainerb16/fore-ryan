// Issues the token a run must present when it is submitted. Called when the run
// starts, so the server has its own record of when play began, and for which game.

import { issueToken, recentTokenCount } from "./_db";
import { TOKENS_PER_HOUR } from "./_env";
import { contestEndsAt, contestIsClosed, LEGACY_GAME, serverGame } from "./_games";
import { clientIp, fail, hashIp, json } from "./_http";

/** Clients older than the arcade POST no body at all. */
async function requestedGame(req: Request): Promise<unknown> {
  try {
    const body = (await req.json()) as { gameId?: unknown };
    return body?.gameId ?? LEGACY_GAME;
  } catch {
    return LEGACY_GAME;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail(405, "Use POST");

  const game = serverGame(await requestedGame(req));
  if (!game) return fail(400, "Unknown game");
  if (contestIsClosed(game)) {
    return fail(403, "The contest has closed — runs can no longer be posted");
  }

  try {
    const ipHash = hashIp(clientIp(req));

    // This is the only endpoint that needs no credentials and writes a row, so
    // it is the one worth capping. A person cannot reach this by playing.
    if (ipHash && (await recentTokenCount(ipHash)) >= TOKENS_PER_HOUR) {
      return fail(429, "Too many runs started — try again shortly");
    }

    const row = await issueToken(game.entry.id, ipHash);
    return json({
      token: row.token,
      issuedAt: row.issued_at,
      closesAt: contestEndsAt(game)?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("run-start failed", err);
    return fail(500, "Could not start a run");
  }
};

export const config = { path: "/api/run-start" };
