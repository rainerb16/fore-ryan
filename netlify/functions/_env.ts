/** Config the functions need. Missing values fail loudly at call time, not at import. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** How long a run token stays valid. A run left open past this cannot be submitted. */
export const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Wall-clock floor. A run claiming 90s of play must have started at least this
 * fraction of 90s ago — you cannot submit a long run seconds after asking for a
 * token. Slack covers the round trip and a paused tab drifting the other way.
 */
export const WALL_CLOCK_SLACK = 0.85;

/** Submissions per email hash per hour. */
export const RATE_LIMIT_PER_HOUR = 20;

export const MAX_NAME_LENGTH = 40;
export const LEADERBOARD_LIMIT = 25;
