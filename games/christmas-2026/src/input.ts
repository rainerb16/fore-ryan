// One button, however it is pressed: mouse, touch, pen, or the space bar.
// Each press is kept with the moment it happened, so the simulation can apply
// it at the step it falls in (see clock.ts); `held` is whether it is down now.
// While a pointer is held, dragging it also steers the camera (see `readLook`).

import type { Input } from "../rules";

export interface PressQueue {
  /** A press that happened at `at` ms, on the frame clock. */
  add(at: number): void;
  /** Whether a press not yet taken happened by `endMs`, taking it (several count as one). */
  takeBy(endMs: number): boolean;
  clear(): void;
}

/** Presses waiting for the simulation step they happened in. */
export function createPressQueue(): PressQueue {
  let pending: number[] = [];
  return {
    add: (at) => void pending.push(at),
    takeBy(endMs) {
      if (pending.length === 0) return false;
      const before = pending.length;
      pending = pending.filter((at) => at > endMs);
      return pending.length < before;
    },
    clear: () => void (pending = []),
  };
}

const presses = createPressQueue();
let held = false;
/** The pointers holding the jump down. UI taps aren't in here, so they can't end a hold. */
const pointers = new Set<number>();
/** The pointer that is steering the camera, where it went down, and how far it has moved since. */
let dragId: number | null = null;
const dragStart = { x: 0, y: 0 };
const look = { x: 0, y: 0 };

/** Taps on buttons, links, and overlays are UI, not jump input. */
const isUi = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("button, a, input, .overlay") !== null;

/**
 * When an event happened, on the same clock as animation frames. Its own
 * timestamp is exact; one that is missing or off that clock gives way to now.
 */
function stamp(e: Event): number {
  const now = performance.now();
  return e.timeStamp > 0 && Math.abs(now - e.timeStamp) < 1000 ? e.timeStamp : now;
}

function down(at: number): void {
  if (!held) presses.add(at);
  held = true;
}

function up(): void {
  held = false;
}

export function attachInput(): void {
  window.addEventListener("pointerdown", (e) => {
    if (isUi(e.target)) return;
    pointers.add(e.pointerId);
    down(stamp(e));
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
    if (!pointers.delete(e.pointerId)) return; // a tap on a button: not part of the hold
    if (pointers.size === 0) up();
    if (e.pointerId === dragId) endDrag();
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  window.addEventListener("keydown", (e) => {
    if (e.key !== " " || isUi(e.target)) return;
    e.preventDefault();
    if (!e.repeat) down(stamp(e));
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") up();
  });

  // Losing focus mid-hold would otherwise leave the button stuck down.
  window.addEventListener("blur", () => {
    pointers.clear();
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

/**
 * The input for a simulation step ending at `endMs`: pressed if a press not
 * yet taken happened by then, which takes it.
 */
export function inputUntil(endMs: number): Input {
  return { pressed: presses.takeBy(endMs), held };
}

/** Forget any press made before play started (e.g. the tap on Start). */
export function resetInput(): void {
  presses.clear();
}
