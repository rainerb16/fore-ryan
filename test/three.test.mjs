// The shared bloom setup, run against a stand-in renderer: building the passes
// and sizing their buffers needs no GPU, only drawing does.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "arcade-three-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, "three.mjs");
await build({ entryPoints: ["test/three-entry.ts"], outfile, bundle: true, format: "esm", platform: "neutral", logLevel: "warning" });
const { createBloom, CONTEXT, EffectComposer, UnrealBloomPass, PerspectiveCamera, Scene } = await import(`file://${outfile}`);

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
