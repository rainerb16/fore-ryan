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

const eq = (value: string): string => `eq.${encodeURIComponent(value)}`;

/** Total from a `Prefer: count=exact` response's content-range, e.g. "0-0/12". */
const countOf = (res: Response): number => Number(res.headers.get("content-range")?.split("/")[1] ?? 0);

export interface RunToken {
  token: string;
  game_id: string;
  issued_at: string;
  used_at: string | null;
}

export async function issueToken(gameId: string, ipHash: string | null): Promise<RunToken> {
  const res = await rest("run_tokens", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ game_id: gameId, ip_hash: ipHash }),
  });
  const [row] = (await res.json()) as RunToken[];
  return row;
}

export async function findToken(token: string): Promise<RunToken | null> {
  const res = await rest(`run_tokens?token=${eq(token)}&select=*&limit=1`);
  const [row] = (await res.json()) as RunToken[];
  return row ?? null;
}

/**
 * Mark a token used, only if still unused. PostgREST returns the rows it changed,
 * so an empty result means someone else got there first. That is the replay check.
 */
export async function consumeToken(token: string): Promise<boolean> {
  const res = await rest(`run_tokens?token=${eq(token)}&used_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ used_at: new Date().toISOString() }),
  });
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

/** Tokens issued to this address in the last hour, for rate limiting run starts. */
export async function recentTokenCount(ipHash: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await rest(`run_tokens?ip_hash=${eq(ipHash)}&issued_at=gte.${since}&select=token`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return countOf(res);
}

/** Golf's own columns. Other games leave them null and use `details`. */
export interface RunColumns {
  level_reached?: number;
  levels_cleared?: number;
  shots_fired?: number;
  holes_sunk?: number;
  levels?: unknown;
  details?: unknown;
}

export interface RunRow extends RunColumns {
  game_id: string;
  display_name: string;
  player_id: string;
  points: number;
  duration_ms: number;
  run_token: string;
  flagged: boolean;
  client_meta: unknown;
}

export async function insertRun(row: RunRow): Promise<void> {
  await rest("runs", { method: "POST", body: JSON.stringify(row) });
}

/** Submissions from this player in the last hour, across all games, for rate limiting. */
export async function recentRunCount(playerId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await rest(`runs?player_id=${eq(playerId)}&created_at=gte.${since}&select=id`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return countOf(res);
}

export interface LeaderboardRow {
  /** Never sent to the browser — the endpoint copies out named fields only. */
  player_id: string;
  display_name: string;
  points: number;
  level_reached: number | null;
  levels_cleared: number | null;
  duration_ms: number;
  created_at: string;
}

const BOARD_COLUMNS = "player_id,display_name,points,level_reached,levels_cleared,duration_ms,created_at";

/** Higher or lower points first, per the game, then the faster run. */
export async function topRuns(gameId: string, sort: "asc" | "desc", limit: number): Promise<LeaderboardRow[]> {
  const res = await rest(
    `leaderboard?game_id=${eq(gameId)}&select=${BOARD_COLUMNS}` +
      `&order=points.${sort},duration_ms.asc&limit=${limit}`,
  );
  return (await res.json()) as LeaderboardRow[];
}

/**
 * Where a run stands in its game, for someone below the listed cut. Counts what
 * beats it on the board's own ordering. Both values come from the database.
 */
export async function rankOf(gameId: string, sort: "asc" | "desc", row: LeaderboardRow): Promise<number> {
  const better = sort === "desc" ? "gt" : "lt";
  const beats =
    `or=(points.${better}.${row.points},` +
    `and(points.eq.${row.points},duration_ms.lt.${row.duration_ms}))`;
  const res = await rest(`leaderboard?game_id=${eq(gameId)}&select=player_id&${beats}`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return countOf(res) + 1;
}

/** One person's best run in a game, so the client can show "your best" alongside the top list. */
export async function personalBest(gameId: string, playerId: string): Promise<LeaderboardRow | null> {
  const res = await rest(
    `leaderboard?game_id=${eq(gameId)}&player_id=${eq(playerId)}&select=${BOARD_COLUMNS}&limit=1`,
  );
  const [row] = (await res.json()) as LeaderboardRow[];
  return row ?? null;
}
