// Thin PostgREST client. Supabase's REST API is a handful of plain HTTP calls,
// so this avoids pulling a client library into the function bundle. The service
// role key bypasses Row Level Security and must never leave the server.

import { env } from "./_env";

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
}

export interface RunToken {
  token: string;
  issued_at: string;
  used_at: string | null;
}

export async function issueToken(ipHash: string | null): Promise<RunToken> {
  const res = await rest("run_tokens", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ip_hash: ipHash }),
  });
  const [row] = (await res.json()) as RunToken[];
  return row;
}

export async function findToken(token: string): Promise<RunToken | null> {
  const res = await rest(`run_tokens?token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
  const [row] = (await res.json()) as RunToken[];
  return row ?? null;
}

/**
 * Mark a token used, only if still unused. PostgREST returns the rows it changed,
 * so an empty result means someone else got there first. That is the replay check.
 */
export async function consumeToken(token: string): Promise<boolean> {
  const res = await rest(
    `run_tokens?token=eq.${encodeURIComponent(token)}&used_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

/** Tokens issued to this address in the last hour, for rate limiting run starts. */
export async function recentTokenCount(ipHash: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await rest(
    `run_tokens?ip_hash=eq.${encodeURIComponent(ipHash)}&issued_at=gte.${since}&select=token`,
    { headers: { Prefer: "count=exact", Range: "0-0" } },
  );
  const range = res.headers.get("content-range"); // "0-0/12"
  return Number(range?.split("/")[1] ?? 0);
}

export interface RunRow {
  display_name: string;
  email_hash: string;
  points: number;
  level_reached: number;
  levels_cleared: number;
  duration_ms: number;
  shots_fired: number;
  holes_sunk: number;
  levels: unknown;
  run_token: string;
  client_meta: unknown;
}

export async function insertRun(row: RunRow): Promise<void> {
  await rest("runs", { method: "POST", body: JSON.stringify(row) });
}

/** Submissions from this person in the last hour, for rate limiting. */
export async function recentRunCount(emailHash: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await rest(
    `runs?email_hash=eq.${encodeURIComponent(emailHash)}&created_at=gte.${since}&select=id`,
    { headers: { Prefer: "count=exact", Range: "0-0" } },
  );
  const range = res.headers.get("content-range"); // "0-0/12"
  return Number(range?.split("/")[1] ?? 0);
}

export interface LeaderboardRow {
  /** Never sent to the browser — the endpoint copies out named fields only. */
  email_hash: string;
  display_name: string;
  points: number;
  level_reached: number;
  levels_cleared: number;
  duration_ms: number;
  created_at: string;
}

export async function topRuns(limit: number): Promise<LeaderboardRow[]> {
  const res = await rest(
    `leaderboard?select=email_hash,display_name,points,level_reached,levels_cleared,duration_ms,created_at` +
      `&order=points.desc,duration_ms.asc&limit=${limit}`,
  );
  return (await res.json()) as LeaderboardRow[];
}

/**
 * Where a run stands overall, for someone below the listed cut. Counts what beats
 * it on the board's own ordering. Both values come from the database.
 */
export async function rankOf(row: LeaderboardRow): Promise<number> {
  const beats =
    `or=(points.gt.${row.points},` +
    `and(points.eq.${row.points},duration_ms.lt.${row.duration_ms}))`;
  const res = await rest(`leaderboard?select=email_hash&${beats}`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return Number(res.headers.get("content-range")?.split("/")[1] ?? 0) + 1;
}

/** Best run for one person, so the client can show "your best" alongside the top list. */
export async function personalBest(emailHash: string): Promise<LeaderboardRow | null> {
  const res = await rest(
    `leaderboard?email_hash=eq.${encodeURIComponent(emailHash)}` +
      `&select=email_hash,display_name,points,level_reached,levels_cleared,duration_ms,created_at&limit=1`,
  );
  const [row] = (await res.json()) as LeaderboardRow[];
  return row ?? null;
}
