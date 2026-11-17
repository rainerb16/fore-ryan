import { boardScreen, canvas } from "../ui/dom";
import { startGame } from "../ui/screens";
import { MODE, STATE } from "./config";
import { game, keys, player } from "./state";

/**
 * The movement and fire keys are plain letters and space, so while someone is
 * filling in the leaderboard form these handlers must keep their hands off —
 * otherwise preventDefault swallows the characters they are typing.
 */
const isTyping = (e: KeyboardEvent): boolean => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/**
 * A contest run ends on its scorecard, which has a score to post and a form to
 * post it with. Nothing may skip past that; the birthday round keeps its
 * press-a-key-to-go-again.
 */
const awaitingScorecard = (): boolean =>
  game.mode === MODE.CONTEST && game.state === STATE.LOSE;

window.addEventListener("keydown", (e) => {
  if (isTyping(e)) return;
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") {
    keys.left = true;
    player.targetX = null;
    e.preventDefault();
  }
  if (k === "arrowright" || k === "d") {
    keys.right = true;
    player.targetX = null;
    e.preventDefault();
  }
  if (k === " " || k === "enter") {
    e.preventDefault();
    if (game.state === STATE.PLAYING) {
      // Repeats are welcome here: holding fire through a restart keeps firing.
      game.firing = true;
    } else if (!e.repeat && boardScreen.hidden && !awaitingScorecard()) {
      // A held key repeats, and fire is held while playing — so the repeat that
      // lands the instant you die must not read as "press a key to restart".
      // Enter on the standings would likewise start a run behind the overlay.
      startGame(game.mode);
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (isTyping(e)) return;
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") keys.left = false;
  if (k === "arrowright" || k === "d") keys.right = false;
  if (k === " " || k === "enter") game.firing = false;
});

function pointerX(e: MouseEvent | TouchEvent): number {
  const rect = canvas.getBoundingClientRect();
  const touches = (e as TouchEvent).touches;
  const cx = touches && touches.length ? touches[0].clientX : (e as MouseEvent).clientX;
  return cx - rect.left;
}

function onDown(e: MouseEvent | TouchEvent): void {
  if (game.state !== STATE.PLAYING) return;
  game.dragging = true;
  game.firing = true;
  player.targetX = pointerX(e);
  if (e.cancelable) e.preventDefault();
}

function onMove(e: MouseEvent | TouchEvent): void {
  if (!game.dragging || game.state !== STATE.PLAYING) return;
  player.targetX = pointerX(e);
  if (e.cancelable) e.preventDefault();
}

function onUp(): void {
  game.dragging = false;
  game.firing = false;
}

canvas.addEventListener("touchstart", onDown, { passive: false });
canvas.addEventListener("touchmove", onMove, { passive: false });
canvas.addEventListener("touchend", onUp);
canvas.addEventListener("touchcancel", onUp);
canvas.addEventListener("mousedown", onDown);
window.addEventListener("mousemove", onMove);
window.addEventListener("mouseup", onUp);
