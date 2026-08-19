// Talks to the Netlify Functions. Every call degrades quietly: the game stays
// playable with the backend down, you just cannot post a score.

import type { RunSummary } from "../../shared/types";

export interface LeaderboardEntry {
  rank: number | null;
  display_name: string;
  points: number;
  level_reached: number;
  levels_cleared: number;
  duration_ms: number;
  created_at: string;
}

export interface LeaderboardData {
  top: LeaderboardEntry[];
  mine: LeaderboardEntry | null;
  /** ISO timestamp the contest closes, or null if it runs indefinitely. */
  closesAt: string | null;
  closed: boolean;
}

export type SubmitResult =
  | { ok: true; points: number; handle: string | null }
  | { ok: false; error: string };

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

/**
 * Asked for as a contest run begins, so the server has its own clock on it.
 * Null means the backend is unreachable: the run is unsubmittable but playable.
 */
export async function requestRunToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/run-start", { method: "POST" });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

export async function submitRun(args: {
  token: string;
  displayName: string;
  email: string;
  summary: RunSummary;
}): Promise<SubmitResult> {
  try {
    const res = await fetch("/api/submit-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      return { ok: false, error: await errorFrom(res, "Could not save that run") };
    }
    const body = (await res.json()) as { points?: number; handle?: string };
    return { ok: true, points: body.points ?? 0, handle: body.handle ?? null };
  } catch {
    return { ok: false, error: "No connection — your score was not saved" };
  }
}

/**
 * `handle` is the opaque id submit-run returns. Deliberately not the email: this
 * is a GET, and query strings end up in access logs.
 */
export async function fetchLeaderboard(handle?: string | null): Promise<LeaderboardData> {
  const query = handle ? `?handle=${encodeURIComponent(handle)}` : "";

  let res: Response;
  try {
    res = await fetch(`/api/leaderboard${query}`);
  } catch {
    // Never surface the raw network error — it means nothing to a player.
    throw new Error("No connection — could not load the leaderboard");
  }

  if (!res.ok) throw new Error(await errorFrom(res, "Could not load the leaderboard"));
  return (await res.json()) as LeaderboardData;
}
