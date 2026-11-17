// The ski jump, as a deterministic side-on simulation with no rendering in it.
// The game steps it every frame; the tests and the server run it on their own.
//
//   ready  → tap to push off
//   inrun  → speed builds; tap near the lip to jump (timing sets the pop)
//   flight → hold to lean forward and glide, let go to drop
//   outrun → landed (or crashed, if still holding at touchdown), sliding out
//   done

import { distanceAt, hillY, INRUN, INRUN_LENGTH, inrunAngle, LANDING } from "./hill";

export type Phase = "ready" | "inrun" | "flight" | "outrun" | "done";
export type TakeoffQuality = "perfect" | "good" | "late";

export const PHYSICS = {
  gravity: 9.81,
  /** Inrun: air drag and ski friction. */
  inrunDrag: 0.0028,
  inrunFriction: 0.025,
  /** A tap this long before the lip counts; earlier taps are ignored. */
  earlyWindow: 0.35,
  /** Within this of the lip is a perfect take-off. */
  perfectWindow: 0.07,
  /** No tap by the lip: a press this soon after still gives a feeble pop. */
  lateWindow: 0.2,
  /** Upward kick at take-off, in m/s, by timing. */
  pop: { perfect: 3.4, good: 2.4, late: 1.0 },
  /** Flight lift and drag, leaning forward (holding) and not. */
  lift: { held: 0.0019, free: 0.0009 },
  drag: { held: 0.0014, free: 0.0026 },
  /** Slow motion for this long after take-off (simulation seconds). */
  slowmoFor: 1.4,
  slowmoScale: 0.3,
  /** Sliding out after landing, before the result. */
  outrunFor: 5,
  outrunDecel: 4,
} as const;

export interface Input {
  /** Pressed down since the last step. */
  pressed: boolean;
  /** Currently held. */
  held: boolean;
}

export interface Jump {
  phase: Phase;
  /** Simulation seconds since pushing off. */
  time: number;
  /** Inrun: distance from the start gate, and speed along the track. */
  s: number;
  speed: number;
  /** Flight and after: position relative to the lip, and velocity. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds before (negative) the lip that take-off was tapped, if it was. */
  tapAt: number | null;
  quality: TakeoffQuality | null;
  takeoffTime: number;
  holding: boolean;
  glide: number;
  bestGlide: number;
  crashed: boolean;
  /** Metres along the hill from the lip, once landed. */
  distance: number | null;
  landedTime: number;
}

export const newJump = (): Jump => ({
  phase: "ready",
  time: 0,
  s: 0,
  speed: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  tapAt: null,
  quality: null,
  takeoffTime: 0,
  holding: false,
  glide: 0,
  bestGlide: 0,
  crashed: false,
  distance: null,
  landedTime: 0,
});

/** How fast real time should run: slow motion just after take-off. */
export const timeScale = (j: Jump): number =>
  j.phase === "flight" && j.time - j.takeoffTime < PHYSICS.slowmoFor ? PHYSICS.slowmoScale : 1;

function gradeTap(tapAt: number): TakeoffQuality {
  return Math.abs(tapAt) <= PHYSICS.perfectWindow ? "perfect" : "good";
}

function takeOff(j: Jump): void {
  const a = (INRUN.tableDeg * Math.PI) / 180;
  j.phase = "flight";
  j.takeoffTime = j.time;
  j.x = 0;
  j.y = 0;
  j.vx = Math.cos(a) * j.speed;
  j.vy = -Math.sin(a) * j.speed;
  if (j.tapAt !== null) {
    j.quality = gradeTap(j.tapAt);
    pop(j, PHYSICS.pop[j.quality]);
  } else {
    j.quality = "late"; // a press in the next moment can still add a little
  }
}

/** A kick perpendicular to the take-off table. */
function pop(j: Jump, strength: number): void {
  const a = (INRUN.tableDeg * Math.PI) / 180;
  j.vx += Math.sin(a) * strength;
  j.vy += Math.cos(a) * strength;
}

function stepInrun(j: Jump, input: Input, dt: number): void {
  const { gravity, inrunDrag, inrunFriction, earlyWindow } = PHYSICS;
  const a = inrunAngle(j.s);
  const accel = gravity * Math.sin(a) - inrunFriction * gravity * Math.cos(a) - inrunDrag * j.speed * j.speed;
  j.speed = Math.max(0, j.speed + accel * dt);
  j.s += j.speed * dt;

  const toLip = j.speed > 0 ? (INRUN_LENGTH - j.s) / j.speed : Infinity;
  // The last tap inside the window counts; earlier ones are ignored.
  if (input.pressed && toLip <= earlyWindow) j.tapAt = -Math.max(0, toLip);
  if (j.s >= INRUN_LENGTH) takeOff(j);
}

function stepFlight(j: Jump, input: Input, dt: number): void {
  const { gravity, lift, drag, lateWindow } = PHYSICS;
  if (j.tapAt === null && input.pressed && j.time - j.takeoffTime <= lateWindow) {
    j.tapAt = j.time - j.takeoffTime;
    pop(j, PHYSICS.pop.late);
  }

  j.holding = input.held;
  j.glide = j.holding ? j.glide + dt : 0;
  j.bestGlide = Math.max(j.bestGlide, j.glide);

  const u = Math.hypot(j.vx, j.vy);
  const cl = j.holding ? lift.held : lift.free;
  const cd = j.holding ? drag.held : drag.free;
  // Lift acts at right angles to the direction of travel, drag against it.
  j.vx += (-cd * u * j.vx + cl * u * -j.vy) * dt;
  j.vy += (-cd * u * j.vy + cl * u * j.vx - gravity) * dt;
  j.x += j.vx * dt;
  j.y += j.vy * dt;

  if (j.y <= hillY(j.x) || j.x >= LANDING.end) land(j);
}

function land(j: Jump): void {
  j.x = Math.min(j.x, LANDING.end);
  j.y = hillY(j.x);
  j.distance = distanceAt(j.x);
  // Still leaning forward at touchdown is a crash.
  j.crashed = j.holding;
  j.holding = false;
  j.phase = "outrun";
  j.landedTime = j.time;
  j.speed = Math.hypot(j.vx, j.vy);
}

function stepOutrun(j: Jump, dt: number): void {
  const decel = PHYSICS.outrunDecel * (j.crashed ? 2 : 1);
  j.speed = Math.max(0, j.speed - decel * dt);
  j.x = Math.min(j.x + j.speed * dt, LANDING.end);
  j.y = hillY(j.x);
  if (j.time - j.landedTime >= PHYSICS.outrunFor) j.phase = "done";
}

/** Advances the jump by dt simulation seconds. */
export function step(j: Jump, input: Input, dt: number): void {
  if (j.phase === "done") return;
  if (j.phase === "ready") {
    if (input.pressed) j.phase = "inrun";
    return;
  }
  j.time += dt;
  if (j.phase === "inrun") stepInrun(j, input, dt);
  else if (j.phase === "flight") stepFlight(j, input, dt);
  else stepOutrun(j, dt);
}

/** Position on the inrun, relative to the lip, for drawing the jumper there. */
export function inrunPosition(s: number): { x: number; y: number; angle: number } {
  // Walk from the lip back up by the remaining distance.
  let x = 0;
  let y = 0;
  const step = 0.5;
  for (let d = INRUN_LENGTH; d > s; d -= step) {
    const a = inrunAngle(Math.max(s, d - step / 2));
    const len = Math.min(step, d - s);
    x -= Math.cos(a) * len;
    y += Math.sin(a) * len;
  }
  return { x, y, angle: inrunAngle(s) };
}
