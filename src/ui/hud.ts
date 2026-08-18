import { SCORING } from "../../shared/scoring";
import { MODE, START_LIVES } from "../game/config";
import { game } from "../game/state";
import { levelEl, livesEl, pointsEl, scoreEl } from "./dom";

export const formatPoints = (n: number): string => n.toLocaleString("en-US");

export function updateHud(): void {
  const contest = game.mode === MODE.CONTEST;

  levelEl.hidden = !contest;
  pointsEl.hidden = !contest;
  if (contest) {
    levelEl.textContent = `LVL ${game.level}`;
    // Points already banked, plus what the level in progress is worth so far.
    pointsEl.textContent = `${formatPoints(game.points + game.holes * SCORING.holeBase * game.level)} pts`;
  }

  scoreEl.textContent = `⛳ ${game.holes} / ${game.cfg.holesToClear}`;

  let out = "";
  for (let i = 0; i < START_LIVES; i++) {
    out += i < game.lives ? "❤️" : '<span class="spent">❤️</span>';
  }
  livesEl.innerHTML = out;
}
