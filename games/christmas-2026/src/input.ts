// One button, however it is pressed: mouse, touch, pen, or the space bar.
// The simulation reads `pressed` (went down since last read) and `held`.
// While a pointer is held, dragging it also steers the camera (see `readLook`).

import type { Input } from "../rules";

let pressed = false;
let held = false;
let pointers = 0;
/** The pointer that is steering the camera, where it went down, and how far it has moved since. */
let dragId: number | null = null;
const dragStart = { x: 0, y: 0 };
const look = { x: 0, y: 0 };

/** Taps on buttons, links, and overlays are UI, not jump input. */
const isUi = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("button, a, input, .overlay") !== null;

function down(): void {
  if (!held) pressed = true;
  held = true;
}

function up(): void {
  held = false;
}

export function attachInput(): void {
  window.addEventListener("pointerdown", (e) => {
    if (isUi(e.target)) return;
    pointers++;
    down();
    if (dragId === null) {
      dragId = e.pointerId;
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerId !== dragId) return;
    // As a share of the screen, so a drag means the same on a phone and a monitor.
    look.x = (e.clientX - dragStart.x) / window.innerWidth;
    look.y = (e.clientY - dragStart.y) / window.innerHeight;
  });
  const release = (e: PointerEvent): void => {
    pointers = Math.max(0, pointers - 1);
    if (pointers === 0) up();
    if (e.pointerId === dragId) endDrag();
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  window.addEventListener("keydown", (e) => {
    if (e.key !== " " || isUi(e.target)) return;
    e.preventDefault();
    if (!e.repeat) down();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") up();
  });

  // Losing focus mid-hold would otherwise leave the button stuck down.
  window.addEventListener("blur", () => {
    pointers = 0;
    up();
    endDrag();
  });
}

function endDrag(): void {
  dragId = null;
  look.x = 0;
  look.y = 0;
}

/**
 * How far the held pointer has been dragged since it went down, as a share of
 * the screen (right and down positive); zero when nothing is held.
 */
export function readLook(): Readonly<{ x: number; y: number }> {
  return look;
}

/** The current input, clearing the one-shot press. */
export function readInput(): Input {
  const now = { pressed, held };
  pressed = false;
  return now;
}

/** Forget any press made before play started (e.g. the tap on Start). */
export function resetInput(): void {
  pressed = false;
}
