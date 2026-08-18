import { canvas } from "../ui/dom";
import { startGame } from "../ui/screens";
import { STATE } from "./config";
import { game, keys, player } from "./state";

window.addEventListener("keydown", (e) => {
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
    if (game.state === STATE.PLAYING) game.firing = true;
    else startGame();
  }
});

window.addEventListener("keyup", (e) => {
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
