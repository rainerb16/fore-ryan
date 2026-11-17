// The arcade's game registry. The lobby, the build, and the API all read it, so
// adding a game here is what makes it exist everywhere.

export interface GameEntry {
  /** Occasion and year, never the mechanic: `christmas-2026`, `easter-2027`. */
  id: string;
  title: string;
  occasion: "Birthday" | "Christmas" | "Easter";
  year: number;
  /** When it was gifted (YYYY-MM-DD). Orders the lobby, newest first. */
  released: string;
  /** Whether a higher or a lower score wins. */
  sort: "desc" | "asc";
  /** What a score is: plain points, or centimetres shown as metres (the ski jump). */
  unit: "points" | "cm";
  /** Page path, with a trailing slash. */
  path: string;
}

export const GAMES: readonly GameEntry[] = [
  {
    id: "christmas-2026",
    title: "Ryan Ski Jump",
    occasion: "Christmas",
    year: 2026,
    released: "2026-12-24",
    sort: "desc",
    unit: "cm",
    path: "/games/christmas-2026/",
  },
  {
    id: "birthday-2026",
    title: "Fore Ryan!",
    occasion: "Birthday",
    year: 2026,
    released: "2026-08-17",
    sort: "desc",
    unit: "points",
    path: "/games/birthday-2026/",
  },
];

/** A score as people read it: "214,700" for golf, "118.4 m" for the ski jump. */
export const formatScore = (game: GameEntry, points: number): string =>
  game.unit === "cm" ? `${(points / 100).toFixed(1)} m` : points.toLocaleString("en-US");

export const gameById = (id: unknown): GameEntry | undefined =>
  GAMES.find((g) => g.id === id);

export const byNewest = (games: readonly GameEntry[] = GAMES): GameEntry[] =>
  [...games].sort((a, b) => b.released.localeCompare(a.released));
