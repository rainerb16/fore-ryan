import { createHash } from "node:crypto";
import { env, MAX_NAME_LENGTH } from "./_env";

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const fail = (status: number, error: string): Response => json({ error }, status);

/** Netlify's real client IP, ahead of the CDN hop. */
export const clientIp = (req: Request): string | null =>
  req.headers.get("x-nf-client-connection-ip") ??
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  null;

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * Salted hash of the work email — identifies a person across runs without the
 * address being stored, so the board cannot leak a company directory.
 */
export const hashEmail = (email: string): string =>
  sha256(`${email.trim().toLowerCase()}|${env("EMAIL_HASH_SALT")}`);

export const hashIp = (ip: string | null): string | null =>
  ip ? sha256(`${ip}|${env("EMAIL_HASH_SALT")}`) : null;

/** Collapse whitespace, drop control characters, and cap the length. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

/** Deliberately loose — this checks for a typo, not for a valid mailbox. */
export const looksLikeEmail = (raw: unknown): raw is string =>
  typeof raw === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim()) && raw.length <= 254;
