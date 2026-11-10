// The one way games talk to the leaderboard. It wraps the /api/* functions and
// degrades to this device's localStorage when they are unreachable or failing,
// so a paused database never breaks a game. A refusal from the server (closed,
// rate limited, implausible run) is passed back, never saved locally.

import { gameById } from "./games";
import { cleanName } from "./names";
import { store } from "./storage";

export interface LeaderboardEntry {
  rank: number | null;
  display_name: string;
  points: number;
  duration_ms: number;
  created_at: string;
  /** Golf only; absent for other games and for scores kept on this device. */
  level_reached?: number;
  levels_cleared?: number;
}

export interface Leaderboard {
  top: LeaderboardEntry[];
  mine: LeaderboardEntry | null;
  /** ISO timestamp the contest closes, or null if it runs indefinitely. */
  closesAt: string | null;
  closed: boolean;
  /** True when these are this device's own scores because the server is down. */
  local?: boolean;
}

export interface RunResult {
  displayName: string;
  points: number;
  durationMs: number;
  /** Game-specific stats. The server derives and checks the score from these. */
  details: unknown;
}

export type SubmitResult =
  | { ok: true; points: number; rank?: number; local?: boolean }
  | { ok: false; error: string };

const LOCAL_TOKEN = "local:";

// Named for the golf game that introduced it; kept so returning players keep
// their history.
const PLAYER_KEY = "ryanbday.player";

/** A random id this browser keeps, so a person's runs collapse to their best. */
export function playerId(): string {
  const saved = store.get(PLAYER_KEY, "");
  if (saved) return saved;
  const id = crypto.randomUUID();
  store.set(PLAYER_KEY, id);
  return id;
}

/** Network failure or a server-side fault: worth falling back for. */
class Unavailable extends Error {}

async function call(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new Unavailable(String(err));
  }
  if (res.status >= 500) throw new Unavailable(`${path} -> ${res.status}`);
  return res;
}

/** The server's own message where there is one, ours otherwise. */
async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // no JSON body
  }
  return fallback;
}

const warn = (what: string, err: unknown): void =>
  console.warn(`[scores] ${what} — using this device's scores instead.`, err);

// --- local fallback ---------------------------------------------------------

const localKey = (gameId: string): string => `arcade.scores.${gameId}`;

function readLocal(gameId: string): LeaderboardEntry[] {
  try {
    const rows = JSON.parse(store.get(localKey(gameId), "[]")) as unknown;
    return Array.isArray(rows) ? (rows as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

/** Better score first, then the faster run, in the game's own direction. */
function compare(gameId: string) {
  const dir = gameById(gameId)?.sort === "asc" ? 1 : -1;
  return (a: LeaderboardEntry, b: LeaderboardEntry): number =>
    dir * (a.points - b.points) || a.duration_ms - b.duration_ms;
}

function ranked(gameId: string, rows: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...rows].sort(compare(gameId)).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Keeps the best run per name, since one device may be shared. */
function saveLocal(gameId: string, run: RunResult): number {
  const entry: LeaderboardEntry = {
    rank: null,
    display_name: run.displayName,
    points: run.points,
    duration_ms: Math.round(run.durationMs),
    created_at: new Date().toISOString(),
  };
  const same = (r: LeaderboardEntry) => r.display_name.toLowerCase() === entry.display_name.toLowerCase();
  const rows = readLocal(gameId);
  const prior = rows.find(same);
  const keep = prior && compare(gameId)(prior, entry) <= 0 ? prior : entry;
  const board = ranked(gameId, [...rows.filter((r) => !same(r)), keep]);
  store.set(localKey(gameId), JSON.stringify(board));
  return board.find(same)?.rank ?? 1;
}

function localBoard(gameId: string, limit: number): Leaderboard {
  return {
    top: ranked(gameId, readLocal(gameId)).slice(0, limit),
    mine: null,
    closesAt: null,
    closed: false,
    local: true,
  };
}

// --- the API ----------------------------------------------------------------

/**
 * Ask for a run token as play begins, so the server has its own clock on it.
 * Null means the server refused (contest closed, rate limited): the run is
 * playable but cannot be posted. A `local:` token means it is down and the run
 * will be kept on this device.
 */
export async function startRun(gameId: string): Promise<string | null> {
  try {
    const res = await call("/api/run-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch (err) {
    warn("Could not start a run on the server", err);
    return LOCAL_TOKEN + crypto.randomUUID();
  }
}

export async function submitRun(gameId: string, token: string, run: RunResult): Promise<SubmitResult> {
  const displayName = cleanName(run.displayName);
  if (!displayName) return { ok: false, error: "Enter your name first" };

  const keepLocally = (): SubmitResult => ({
    ok: true,
    points: run.points,
    rank: saveLocal(gameId, { ...run, displayName }),
    local: true,
  });

  if (token.startsWith(LOCAL_TOKEN)) return keepLocally();

  try {
    const res = await call("/api/submit-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId, token, displayName, playerId: playerId(), details: run.details }),
    });
    if (!res.ok) return { ok: false, error: await errorFrom(res, "Could not save that run") };
    const body = (await res.json()) as { points?: number };
    return { ok: true, points: body.points ?? run.points };
  } catch (err) {
    warn("Could not post the run", err);
    return keepLocally();
  }
}

/** Best run per player, plus this player's own standing. */
export async function getLeaderboard(gameId: string, limit = 10): Promise<Leaderboard> {
  const query = new URLSearchParams({ game: gameId, limit: String(limit) });
  const id = store.get(PLAYER_KEY, "");
  if (id) query.set("player", id);

  try {
    const res = await call(`/api/leaderboard?${query}`);
    if (!res.ok) throw new Error(await errorFrom(res, "Could not load the leaderboard"));
    return (await res.json()) as Leaderboard;
  } catch (err) {
    if (!(err instanceof Unavailable)) throw err;
    warn("Could not load the leaderboard", err);
    return localBoard(gameId, limit);
  }
}
