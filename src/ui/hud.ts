import { HOLES_TO_WIN, START_LIVES } from "../game/config";
import { game } from "../game/state";
import { livesEl, scoreEl } from "./dom";

export function updateHud(): void {
  scoreEl.textContent = `⛳ ${game.score} / ${HOLES_TO_WIN}`;
  let out = "";
  for (let i = 0; i < START_LIVES; i++) {
    out += i < game.lives ? "❤️" : '<span class="spent">❤️</span>';
  }
  livesEl.innerHTML = out;
}
