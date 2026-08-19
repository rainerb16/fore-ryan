import { SCORING } from "../../shared/scoring";
import { MODE } from "../game/config";
import { game } from "../game/state";
import { levelEl, livesEl, pointsEl, scoreEl } from "./dom";
import { formatPoints } from "./format";

export function updateHud(): void {
  const contest = game.mode === MODE.CONTEST;

  levelEl.hidden = !contest;
  pointsEl.hidden = !contest;
  if (contest) {
    levelEl.textContent = `LVL ${game.level}`;
    // Banked, plus what the level in progress is worth so far.
    const inProgress = game.holes * SCORING.holeBase * game.level;
    pointsEl.textContent = `${formatPoints(game.points + inProgress)} pts`;
  }

  scoreEl.textContent = `⛳ ${game.holes} / ${game.cfg.holesToClear}`;

  let hearts = "";
  for (let i = 0; i < game.maxLives; i++) {
    hearts += i < game.lives ? "❤️" : '<span class="spent">❤️</span>';
  }
  livesEl.innerHTML = hearts;
}
