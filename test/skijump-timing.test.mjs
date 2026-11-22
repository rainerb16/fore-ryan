// Take-off timing is graded to ±70 ms, so a tap must count at the moment it
// happened, not at whatever frame the phone draws next. These play the real
// simulation through the game's step clock at different frame rates.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "skijump-timing-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, "skijump.mjs");
await build({ entryPoints: ["test/skijump-entry.ts"], outfile, bundle: true, format: "esm", platform: "neutral", logLevel: "warning" });
const R = await import("file://" + outfile);

const STEP = 1 / 120;

/**
 * Plays a jump on a screen refreshing at `fps`, its first frame `offsetMs` in.
 * `taps` are real times in ms (push off, then take-off). Returns the jump and
 * the real time the jumper left the lip.
 */
function play(fps, offsetMs, taps, { holdFrom = Infinity, holdUntil = -Infinity } = {}) {
  const clock = R.createStepClock(STEP);
  const j = R.newJump();
  const presses = R.createPressQueue();
  for (const at of taps) presses.add(at);
  let lipAt = null;
  let now = offsetMs;
  const frame = () => {
    clock.advance(
      now,
      (endMs) => {
        const pressed = presses.takeBy(endMs);
        const was = j.phase;
        R.step(j, { pressed, held: endMs >= holdFrom && endMs < holdUntil }, STEP);
        if (was === "inrun" && j.phase === "flight") lipAt = endMs;
      },
      () => R.timeScale(j),
    );
  };
  frame();
  while (j.phase !== "done" && now < 120_000) {
    now += 1000 / fps;
    frame();
  }
  return { j, lipAt };
}

// When the jumper reaches the lip, pushing off as the first frame is drawn.
const lipAt = play(120, 0, [0]).lipAt;
/** The same, for a run whose frames start `offsetMs` in (it pushes off then). */
const lipFrom = (offsetMs) => play(120, offsetMs, [offsetMs]).lipAt;

test("the lip is reached at the same moment at any frame rate", () => {
  for (const fps of [30, 60, 120]) {
    assert.ok(Math.abs(play(fps, 0, [0]).lipAt - lipAt) <= STEP * 1000 + 1e-6, `${fps} fps`);
  }
});

test("a tap 50 ms before the lip counts 50 ms before it, on any phone", () => {
  for (const fps of [30, 45, 60, 90, 120]) {
    for (const offsetMs of [0, 3, 7, 11, 19, 27]) {
      const { j } = play(fps, offsetMs, [offsetMs, lipFrom(offsetMs) - 50]);
      const error = Math.abs(j.tapAt - -0.05);
      assert.ok(error <= STEP + 1e-6, `${fps} fps, frames ${offsetMs} ms in: tapped ${(j.tapAt * 1000).toFixed(1)} ms`);
      assert.equal(j.quality, "perfect", `${fps} fps, frames ${offsetMs} ms in`);
    }
  }
});

test("a tap just after the lip is late on every phone", () => {
  for (const fps of [30, 60, 120]) {
    // Frames at every offset, so some fall between the lip and the tap.
    for (let offsetMs = 0; offsetMs < 34; offsetMs += 3) {
      const { j } = play(fps, offsetMs, [offsetMs, lipFrom(offsetMs) + 20]);
      assert.equal(j.quality, "late", `${fps} fps, frames ${offsetMs} ms in`);
      assert.ok(j.tapAt > 0, `${fps} fps, frames ${offsetMs} ms in: tapped ${(j.tapAt * 1000).toFixed(1)} ms`);
    }
  }
});

test("a press is taken by the first step ending at or after it, once", () => {
  const presses = R.createPressQueue();
  presses.add(100);
  assert.equal(presses.takeBy(99.9), false);
  assert.equal(presses.takeBy(100), true);
  assert.equal(presses.takeBy(200), false, "already taken");
  presses.add(300);
  presses.add(305);
  assert.equal(presses.takeBy(310), true, "two presses in one step are one press");
  assert.equal(presses.takeBy(400), false);
  presses.add(500);
  presses.clear();
  assert.equal(presses.takeBy(600), false);
});

test("slow motion and gliding still play out the same at any frame rate", () => {
  const held = { holdFrom: lipAt + 100, holdUntil: lipAt + 3000 };
  const reference = play(120, 0, [0, lipAt - 40], held).j;
  for (const fps of [30, 60]) {
    const { j } = play(fps, 0, [0, lipAt - 40], held);
    assert.ok(Math.abs(j.distance - reference.distance) < 0.5, `${fps} fps: ${j.distance} vs ${reference.distance} m`);
  }
});

test("a hidden tab catches up at most a tenth of a second, as before", () => {
  const clock = R.createStepClock(STEP);
  let steps = 0;
  clock.advance(1000, () => steps++, () => 1);
  clock.advance(6000, () => steps++, () => 1);
  assert.equal(steps, 12, "0.1 s of steps, not 5 s");
});

test("between steps, the blend says how far along the next one is", () => {
  const clock = R.createStepClock(STEP);
  clock.advance(1000, () => {}, () => 1);
  clock.advance(1000 + (STEP * 1000) / 2, () => {}, () => 1);
  assert.ok(Math.abs(clock.blend - 0.5) < 1e-6, String(clock.blend));
});
