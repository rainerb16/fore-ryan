/** Config the functions need. Missing values fail loudly at call time, not at import. */
export function env(name: string): string {
  // HASH_SALT was EMAIL_HASH_SALT when the board still asked for a work email.
  // Accepting the old name means the rename can happen whenever, not on deploy.
  const value = process.env[name] ?? (name === "HASH_SALT" ? process.env.EMAIL_HASH_SALT : undefined);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** How long a run token stays valid. A run left open past this cannot be submitted. */
export const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

/** A run claiming 90s of play must have started at least this fraction of 90s ago. */
export const WALL_CLOCK_SLACK = 0.85;

/** Submissions per email hash per hour. */
export const RATE_LIMIT_PER_HOUR = 20;

/** Run tokens per IP per hour. Far above anything reachable by playing. */
export const TOKENS_PER_HOUR = 60;

/** CONTEST_ENDS_AT, or null to run indefinitely. Standings stay readable either way. */
export function contestEndsAt(): Date | null {
  const raw = process.env.CONTEST_ENDS_AT;
  if (!raw) return null;
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) {
    console.warn(`Ignoring unparseable CONTEST_ENDS_AT: ${raw}`);
    return null;
  }
  return when;
}

export function contestIsClosed(): boolean {
  const ends = contestEndsAt();
  return ends !== null && Date.now() > ends.getTime();
}

export const MAX_NAME_LENGTH = 40;
export const LEADERBOARD_LIMIT = 25;
