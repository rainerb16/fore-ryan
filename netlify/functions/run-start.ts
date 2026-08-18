// Issues the token a contest run must present when it is submitted. Called when
// the run starts, so the server has its own record of when play began.

import { issueToken } from "./_db";
import { clientIp, fail, hashIp, json } from "./_http";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail(405, "Use POST");

  try {
    const row = await issueToken(hashIp(clientIp(req)));
    return json({ token: row.token, issuedAt: row.issued_at });
  } catch (err) {
    console.error("run-start failed", err);
    return fail(500, "Could not start a run");
  }
};

export const config = { path: "/api/run-start" };
