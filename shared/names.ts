// Player names, cleaned the same way in the browser and on the server.

export const MAX_NAME_LENGTH = 20;

/**
 * Drop control characters, collapse whitespace, trim, and cap the length in
 * code points, so an emoji counts as one character. Null when nothing is left.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(collapsed).slice(0, MAX_NAME_LENGTH).join("").trim() || null;
}
