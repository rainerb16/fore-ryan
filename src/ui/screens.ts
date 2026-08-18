import { levelConfig } from "../../shared/rules";
import { scoreLevel } from "../../shared/scoring";
import { initAudio, sfx } from "../game/audio";
import { MODE, STATE, type GameMode } from "../game/config";
import { bankLevel, runSummary, startRun } from "../game/progression";
import { game } from "../game/state";
import { store } from "../game/storage";
import { burstConfetti, reset } from "../game/world";
import { hideBanner, showBanner } from "./banner";
import {
  hud,
  loseScreen,
  loseStats,
  runBreakdown,
  runHeadline,
  runScreen,
  runStats,
  startScreen,
  winScreen,
  winStats,
} from "./dom";
import { formatPoints, updateHud } from "./hud";

function hideOverlays(): void {
  startScreen.hidden = true;
  winScreen.hidden = true;
  loseScreen.hidden = true;
  runScreen.hidden = true;
}

export function startGame(mode: GameMode): void {
  initAudio();
  hideOverlays();
  hideBanner();
  hud.classList.remove("pregame");
  reset();
  startRun(mode);
  game.state = STATE.PLAYING;
  if (mode === MODE.CONTEST) showBanner("Level 1", game.cfg.name);
}

/** Return to the start screen without playing a round. */
export function showStart(): void {
  hideOverlays();
  hideBanner();
  hud.classList.add("pregame");
  game.state = STATE.START;
  game.mode = MODE.BIRTHDAY;
  reset();
  updateHud();
  startScreen.hidden = false;
}

function bumpRounds(): number {
  const n = (parseInt(store.get("ryanbday.rounds", "0"), 10) || 0) + 1;
  store.set("ryanbday.rounds", String(n));
  return n;
}

// --- birthday round ---------------------------------------------------------

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
  loseStats.textContent = `Holes sunk: ${game.holes} / ${game.cfg.holesToClear} · Round #${rounds}`;
  setTimeout(() => {
    if (game.state === STATE.LOSE) loseScreen.hidden = false;
  }, 350);
}

// --- contest run ------------------------------------------------------------

/** Ends a contest run: bank the level in progress, then show the scorecard. */
export function endRun(): void {
  game.state = STATE.LOSE;
  game.frozen = true;
  game.firing = false;
  hud.classList.add("pregame");
  hideBanner();
  sfx.lose();

  bankLevel();
  const summary = runSummary();
  const best = parseInt(store.get("ryanbday.bestPoints", "0"), 10) || 0;
  const isBest = summary.points > best;
  if (isBest) store.set("ryanbday.bestPoints", String(summary.points));
  bumpRounds();

  runHeadline.textContent = `${formatPoints(summary.points)} points`;
  runStats.textContent =
    `Reached ${levelConfig(summary.levelReached).name} (level ${summary.levelReached})` +
    ` · ${summary.holesSunk} holes · ${(summary.durationMs / 1000).toFixed(0)}s` +
    (isBest ? " · new personal best! 🏆" : ` · Best: ${formatPoints(best)}`);

  runBreakdown.innerHTML = summary.levels
    .map((s) => {
      const cfg = levelConfig(s.level);
      const sc = scoreLevel(s);
      const cleared = s.holes >= cfg.holesToClear;
      const tags = [
        cleared ? "cleared" : `${s.holes}/${cfg.holesToClear}`,
        sc.flawless > 0 ? "flawless" : "",
        sc.speed > 0 ? `under par` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<li><span class="lvl">${cfg.name}</span><span class="tags">${tags}</span><span class="pts">${formatPoints(sc.total)}</span></li>`;
    })
    .join("");

  setTimeout(() => {
    if (game.state === STATE.LOSE) runScreen.hidden = false;
  }, 350);
}
