// The shared bloom setup, run against a stand-in renderer: building the passes
// and sizing their buffers needs no GPU, only drawing does.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const realPerformance = globalThis.performance;
after(() => Object.defineProperty(globalThis, "performance", { value: realPerformance, configurable: true }));
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "arcade-three-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, "three.mjs");
await build({ entryPoints: ["test/three-entry.ts"], outfile, bundle: true, format: "esm", platform: "neutral", logLevel: "warning" });
const { createBloom, runLoop, CONTEXT, unlessContextLost, EffectComposer, UnrealBloomPass, PerspectiveCamera, Scene } = await import(`file://${outfile}`);

// Watch what the bloom pass is sized to, and which composer the passes go into.
let bloomSize;
const setSize = UnrealBloomPass.prototype.setSize;
UnrealBloomPass.prototype.setSize = function (w, h) {
  bloomSize = { w, h };
  return setSize.call(this, w, h);
};
let composer;
const addPass = EffectComposer.prototype.addPass;
EffectComposer.prototype.addPass = function (pass) {
  composer = this;
  return addPass.call(this, pass);
};

/** Just enough of a WebGLRenderer for the composer: a size and a pixel ratio. */
const renderer = (pixelRatio) => ({
  getPixelRatio: () => pixelRatio,
  getSize: (v) => v.set(800, 600),
});

function bloomOn({ lowPower, pixelRatio = 1.5 }) {
  bloomSize = undefined;
  const r = renderer(pixelRatio);
  const bloom = createBloom(r, new Scene(), new PerspectiveCamera(), { strength: 1, radius: 0.5, threshold: 1, lowPower });
  bloom.resize(800, 600);
  return composer;
}

test("phones compute the glow at half size", () => {
  bloomOn({ lowPower: true, pixelRatio: 1.5 });
  // The pass halves what it is given again for its first blur level.
  assert.deepEqual(bloomSize, { w: 600, h: 450 });
});

test("desktops compute the glow at full size", () => {
  bloomOn({ lowPower: false, pixelRatio: 1.5 });
  assert.deepEqual(bloomSize, { w: 1200, h: 900 });
});

test("the screen itself asks for no edge smoothing: the scene is drawn off-screen first", () => {
  assert.equal(CONTEXT.antialias, false);
});

test("desktops smooth edges where the scene is drawn; phones skip it", () => {
  assert.equal(bloomOn({ lowPower: false }).renderTarget1.samples, 4);
  assert.equal(bloomOn({ lowPower: true }).renderTarget1.samples, 0);
});

// --- the frame loop -------------------------------------------------------------

/** A display refreshing at `hz`, driven by hand: `run(seconds)` plays that many frames. */
function display(hz) {
  let now = 1000;
  let queue = [];
  let nextId = 1;
  Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => (queue = queue.filter((q) => q.id !== id));
  return {
    run(seconds) {
      for (let i = 0; i < Math.round(seconds * hz); i++) {
        now += 1000 / hz;
        const due = queue;
        queue = [];
        for (const { cb } of due) cb(now);
      }
    },
    wait(seconds) {
      now += seconds * 1000;
    },
    /** Frames that land up to `ms` late or early, as Safari's do. */
    runJittery(seconds, ms) {
      const frames = Math.round(seconds * hz);
      for (let i = 0; i < frames; i++) {
        const due = queue;
        queue = [];
        const at = 1000 + ((i + 1) * 1000) / hz + [-ms, -ms, ms, ms][i % 4];
        now = at;
        for (const { cb } of due) cb(at);
      }
    },
    /** A frame stamped before `performance.now()`, as when start() runs late in a frame. */
    frameAt(msBeforeNow) {
      const due = queue;
      queue = [];
      for (const { cb } of due) cb(now - msBeforeNow);
    },
  };
}

function counting() {
  const drawn = { frames: 0, time: 0, dts: [] };
  const frame = (_time, dt) => {
    drawn.frames++;
    drawn.time += dt;
    drawn.dts.push(dt);
  };
  return { drawn, frame };
}

test("with nothing moving, a 120 Hz screen is drawn 30 times a second, keeping real time", () => {
  const screen = display(120);
  const { drawn, frame } = counting();
  runLoop(frame, { idleFps: 30, busy: () => false });
  screen.run(1);
  assert.ok(Math.abs(drawn.frames - 30) <= 1, `${drawn.frames} frames`);
  assert.ok(Math.abs(drawn.time - 1) < 0.05, `${drawn.time}s of animation in 1s`);
});

test("on a 60 Hz screen the quiet rate is every other frame", () => {
  const screen = display(60);
  const { drawn, frame } = counting();
  runLoop(frame, { idleFps: 30, busy: () => false });
  screen.run(1);
  assert.ok(Math.abs(drawn.frames - 30) <= 1, `${drawn.frames} frames`);
});

test("while something moves, every frame is drawn", () => {
  const screen = display(120);
  const { drawn, frame } = counting();
  runLoop(frame, { idleFps: 30, busy: () => true });
  screen.run(1);
  assert.equal(drawn.frames, 120);
});

test("without a quiet rate (desktop), every frame is drawn", () => {
  const screen = display(120);
  const { drawn, frame } = counting();
  runLoop(frame);
  screen.run(1);
  assert.equal(drawn.frames, 120);
});

test("a stopped loop draws nothing, and restarts without jumping ahead", () => {
  const screen = display(60);
  const { drawn, frame } = counting();
  const loop = runLoop(frame);
  screen.run(0.5);
  loop.stop();
  const before = drawn.frames;
  screen.run(1);
  assert.equal(drawn.frames, before);

  screen.wait(5);
  loop.start();
  screen.run(0.1);
  assert.ok(drawn.frames > before);
  assert.ok(drawn.dts[before] < 0.02, `first frame after restart stepped ${drawn.dts[before]}s`);
});

test("a frame can stop the loop it is running in", () => {
  const screen = display(60);
  let frames = 0;
  const loop = runLoop(() => {
    frames++;
    if (frames === 3) loop.stop();
  });
  screen.run(1);
  assert.equal(frames, 3);
});

test("frames a few milliseconds off time still hold the quiet rate", () => {
  const screen = display(60);
  const { drawn, frame } = counting();
  runLoop(frame, { idleFps: 30, busy: () => false });
  screen.runJittery(2, 3);
  assert.ok(drawn.frames >= 55, `${drawn.frames} frames in 2s`);
});

test("as soon as something moves, the next frame is drawn", () => {
  const screen = display(120);
  const { drawn, frame } = counting();
  let moving = false;
  runLoop(frame, { idleFps: 30, busy: () => moving });
  screen.run(0.5);
  const before = drawn.frames;
  moving = true;
  screen.run(1 / 120);
  assert.equal(drawn.frames, before + 1);
});

test("a frame stamped before the loop started steps no time backwards", () => {
  const screen = display(60);
  const { drawn, frame } = counting();
  runLoop(frame);
  screen.frameAt(3);
  assert.equal(drawn.frames, 1);
  assert.ok(drawn.dts[0] >= 0, `stepped ${drawn.dts[0]}s`);
});

test("a frame that throws stops the loop rather than failing every frame", () => {
  const screen = display(60);
  let frames = 0;
  runLoop(() => {
    frames++;
    throw new Error("broken frame");
  });
  assert.throws(() => screen.run(1 / 60));
  screen.run(1);
  assert.equal(frames, 1);
});

// --- losing the GPU mid-load ------------------------------------------------------

test("work in progress when the GPU context is lost fails instead of waiting forever", async () => {
  const canvas = new EventTarget();
  const never = new Promise(() => {});
  const waiting = unlessContextLost(canvas, never);
  canvas.dispatchEvent(new Event("webglcontextlost"));
  await assert.rejects(waiting, /lost/);
});

test("work that finishes first is unaffected by a later context loss", async () => {
  const canvas = new EventTarget();
  assert.equal(await unlessContextLost(canvas, Promise.resolve("done")), "done");
  canvas.dispatchEvent(new Event("webglcontextlost")); // nothing left listening, nothing thrown
});
