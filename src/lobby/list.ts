// The cabinets as a plain list of links. With WebGL it is visually hidden and
// serves keyboard and screen-reader users; without it, it is the lobby.

import type { GameEntry } from "../../shared/games";
import type { LeaderboardEntry } from "../../shared/scores";

const listEl = document.getElementById("cabinetList") as HTMLUListElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** One entry per game; returns a setter for each game's scores. */
export function renderList(games: GameEntry[]): Map<string, (top: LeaderboardEntry[] | null) => void> {
  const setters = new Map<string, (top: LeaderboardEntry[] | null) => void>();

  for (const game of games) {
    const item = el("li", "cabinet");
    item.dataset.game = game.id;

    const link = el("a", "play");
    link.href = game.path;
    link.append(el("strong", "", game.title), el("span", "occasion", `${game.occasion} ${game.year}`));

    const scores = el("ol", "top3");
    scores.setAttribute("aria-label", `${game.title} top scores`);
    scores.append(el("li", "note", "Loading scores…"));

    item.append(link, scores);
    listEl.append(item);

    setters.set(game.id, (top) => {
      if (!top) {
        scores.replaceChildren(el("li", "note", "Scores unavailable"));
      } else if (top.length === 0) {
        scores.replaceChildren(el("li", "note", "No scores yet — be the first"));
      } else {
        scores.replaceChildren(
          ...top.slice(0, 3).map((entry) => {
            const row = el("li");
            row.append(
              el("span", "who", entry.display_name),
              el("span", "pts", entry.points.toLocaleString("en-US")),
            );
            return row;
          }),
        );
      }
    });
  }
  return setters;
}
