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
  /** Page path, with a trailing slash. */
  path: string;
}

export const GAMES: readonly GameEntry[] = [
  {
    id: "birthday-2026",
    title: "Fore Ryan!",
    occasion: "Birthday",
    year: 2026,
    released: "2026-08-17",
    sort: "desc",
    path: "/games/birthday-2026/",
  },
];

export const gameById = (id: unknown): GameEntry | undefined =>
  GAMES.find((g) => g.id === id);

export const byNewest = (games: readonly GameEntry[] = GAMES): GameEntry[] =>
  [...games].sort((a, b) => b.released.localeCompare(a.released));
