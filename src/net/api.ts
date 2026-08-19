// Talks to the Netlify Functions. Every call degrades quietly: the game is
// playable with the backend down, you just cannot submit while it is.

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
  closesAt?: string | null;
  closed?: boolean;
}

export type SubmitResult =
  | { ok: true; points: number }
  | { ok: false; error: string };

/** Pull the server's message out of an error response, falling back to our own. */
async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // no JSON body — use the fallback
  }
  return fallback;
}

/**
 * Asked for as a contest run begins, so the server knows when play started.
 * Returns null if the backend is unreachable — the run is then unsubmittable
 * but still perfectly playable.
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
    const body = (await res.json()) as { points?: number };
    return { ok: true, points: body.points ?? 0 };
  } catch {
    return { ok: false, error: "No connection — your score was not saved" };
  }
}

export async function fetchLeaderboard(email?: string | null): Promise<LeaderboardData> {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";

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
