import { levelConfig } from "../../shared/rules";
import { scoreLevel } from "../../shared/scoring";
import { initAudio, sfx } from "../game/audio";
import { BIRTHDAY_LIVES, MODE, STATE, type GameMode } from "../game/config";
import { bankLevel, runSummary, startRun } from "../game/progression";
import { game } from "../game/state";
import { store } from "../game/storage";
import { burstConfetti, reset } from "../game/world";
import { requestRunToken } from "../net/api";
import { applyTheme } from "../render/theme";
import { hideBanner, showBanner } from "./banner";
import {
  boardScreen,
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
import { row } from "./elements";
import { formatDuration, formatPoints } from "./format";
import { updateHud } from "./hud";
import { armSubmission, loadBoard } from "./leaderboard";

function hideOverlays(): void {
  startScreen.hidden = true;
  winScreen.hidden = true;
  loseScreen.hidden = true;
  runScreen.hidden = true;
  boardScreen.hidden = true;
}

export function startGame(mode: GameMode): void {
  initAudio();
  hideOverlays();
  hideBanner();
  hud.classList.remove("pregame");
  reset();
  startRun(mode);
  game.state = STATE.PLAYING;

  if (mode === MODE.CONTEST) {
    showBanner("Level 1", game.cfg.name);
    // Asked for as play begins, so the server has its own clock on the run.
    game.runToken = null;
    void requestRunToken().then((token) => {
      game.runToken = token;
    });
  }
}

/** Return to the start screen without playing a round. */
export function showStart(): void {
  hideOverlays();
  hideBanner();
  hud.classList.add("pregame");
  game.state = STATE.START;
  game.mode = MODE.BIRTHDAY;
  game.maxLives = BIRTHDAY_LIVES;
  game.lives = BIRTHDAY_LIVES;
  applyTheme(1);
  reset();
  updateHud();
  startScreen.hidden = false;
}

/** Open the standings. */
export function showBoard(): void {
  hideOverlays();
  boardScreen.hidden = false;
  void loadBoard();
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

const COLUMNS = ["no", "course", "holes", "bonus", "pts"];

/** A golf scorecard: one labelled line per level, then the total. */
function renderScorecard(summary: ReturnType<typeof runSummary>): void {
  const rows = summary.levels.map((s) => {
    const cfg = levelConfig(s.level);
    const score = scoreLevel(s);
    const cleared = s.holes >= cfg.holesToClear;
    // Spelled out, since the points only make sense if you see what earned them.
    const bonus = [score.flawless > 0 && "no hits", score.speed > 0 && "fast"].filter(Boolean);

    return row(cleared ? "row" : "row unfinished", COLUMNS, [
      String(s.level),
      cfg.name,
      `${s.holes}/${cfg.holesToClear}`,
      bonus.length ? bonus.join(" + ") : cleared ? "—" : "ran out of lives",
      formatPoints(score.total),
    ]);
  });

  runBreakdown.replaceChildren(
    row("head", COLUMNS, ["", "Course", "Holes", "Bonus", "Points"]),
    ...rows,
    row("total", COLUMNS, ["", "Total", "", "", formatPoints(summary.points)]),
  );
}

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
    ` · ${summary.holesSunk} holes · ${formatDuration(summary.durationMs)}` +
    (isBest ? " · new personal best! 🏆" : ` · Best: ${formatPoints(best)}`);

  renderScorecard(summary);

  armSubmission(summary, game.runToken);

  setTimeout(() => {
    if (game.state === STATE.LOSE) runScreen.hidden = false;
  }, 350);
}
