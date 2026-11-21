// Images the pages download: no bigger than they are ever drawn, twice over
// for sharp screens, so phones aren't fetching pixels nobody sees.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** Width and height of a WebP (lossy with alpha, or lossless). */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4), "RIFF");
  assert.equal(b.toString("ascii", 8, 12), "WEBP");
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`unknown WebP chunk ${chunk}`);
}

// The largest each is drawn, in device pixels: the logo on the ski jump's lip
// (248 tall) and the podium greeting (84 CSS px on a 3x phone); the Guy on the
// lobby poster (470 tall).
const POSTER = [
  { file: "public/assets/af/af-logo.webp", drawnHeight: 252 },
  { file: "public/assets/af/af-guy-thumbs-up.webp", drawnHeight: 470 },
];

for (const { file, drawnHeight } of POSTER) {
  test(`${file} is no larger than twice its drawn size`, () => {
    assert.ok(existsSync(file), `${file} is missing`);
    const { h } = webpSize(file);
    assert.ok(h <= drawnHeight * 2, `${h}px tall, drawn at most ${drawnHeight}`);
    assert.ok(h >= drawnHeight, `${h}px tall would blur at ${drawnHeight}`);
    assert.ok(statSync(file).size < 80_000, `${statSync(file).size} bytes`);
  });
}

/** Every source file the site is built from. */
function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(ts|html|css|mjs|md)$/.test(entry.name)) yield path;
  }
}

test("nothing still points at the old full-size PNGs", () => {
  const files = ["index.html", "README.md", ...["src", "games", "shared", "scripts"].flatMap((d) => [...sources(d)])];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /af-(logo|guy-thumbs-up)\.png/, file);
  }
});
