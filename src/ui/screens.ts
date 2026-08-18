import { initAudio, sfx } from "../game/audio";
import { HOLES_TO_WIN, STATE } from "../game/config";
import { game } from "../game/state";
import { store } from "../game/storage";
import { burstConfetti, reset } from "../game/world";
import { hud, loseScreen, loseStats, startScreen, winScreen, winStats } from "./dom";

export function startGame(): void {
  initAudio();
  startScreen.hidden = true;
  winScreen.hidden = true;
  loseScreen.hidden = true;
  hud.classList.remove("pregame");
  reset();
  game.state = STATE.PLAYING;
}

function bumpRounds(): number {
  const n = (parseInt(store.get("ryanbday.rounds", "0"), 10) || 0) + 1;
  store.set("ryanbday.rounds", String(n));
  return n;
}

export function endWin(): void {
  game.state = STATE.WIN;
  game.frozen = true;
  game.firing = false;
  hud.classList.add("pregame");
  sfx.win();
  burstConfetti(170, game.W / 2, game.H * 0.42);

  const secs = game.elapsed / 1000;
  const rounds = bumpRounds();
  const best = parseFloat(store.get("ryanbday.best", "0")) || 0;
  const isBest = !best || secs < best;
  if (isBest) store.set("ryanbday.best", secs.toFixed(2));

  winStats.textContent =
    `Time: ${secs.toFixed(1)}s` +
    (isBest ? " — new course record! 🏆" : ` · Best: ${best.toFixed(1)}s`) +
    ` · Round #${rounds}`;

  setTimeout(() => {
    if (game.state === STATE.WIN) winScreen.hidden = false;
  }, 450);
}

export function endLose(): void {
  game.state = STATE.LOSE;
  game.frozen = true;
  game.firing = false;
  hud.classList.add("pregame");
  sfx.lose();
  const rounds = bumpRounds();
  loseStats.textContent = `Holes sunk: ${game.score} / ${HOLES_TO_WIN} · Round #${rounds}`;
  setTimeout(() => {
    if (game.state === STATE.LOSE) loseScreen.hidden = false;
  }, 350);
}
