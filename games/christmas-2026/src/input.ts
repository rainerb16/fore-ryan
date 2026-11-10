// One button, however it is pressed: mouse, touch, pen, or the space bar.
// The simulation reads `pressed` (went down since last read) and `held`.

import type { Input } from "../rules";

let pressed = false;
let held = false;
let pointers = 0;

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
  });
  const release = (): void => {
    pointers = Math.max(0, pointers - 1);
    if (pointers === 0) up();
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
  });
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
