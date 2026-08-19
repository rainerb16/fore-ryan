// Issues the token a contest run must present when it is submitted. Called when
// the run starts, so the server has its own record of when play began.

import { issueToken, recentTokenCount } from "./_db";
import { contestEndsAt, contestIsClosed, TOKENS_PER_HOUR } from "./_env";
import { clientIp, fail, hashIp, json } from "./_http";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail(405, "Use POST");

  if (contestIsClosed()) {
    return fail(403, "The contest has closed — runs can no longer be posted");
  }

  try {
    const ipHash = hashIp(clientIp(req));

    // This is the only endpoint that needs no credentials and writes a row, so
    // it is the one worth capping. A person cannot reach this by playing.
    if (ipHash && (await recentTokenCount(ipHash)) >= TOKENS_PER_HOUR) {
      return fail(429, "Too many runs started — try again shortly");
    }

    const row = await issueToken(ipHash);
    return json({
      token: row.token,
      issuedAt: row.issued_at,
      closesAt: contestEndsAt()?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("run-start failed", err);
    return fail(500, "Could not start a run");
  }
};

export const config = { path: "/api/run-start" };
