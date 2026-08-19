// Generates the favicons from the head cutout. Run it if the photo changes:
//
//   npm i --no-save @resvg/resvg-js
//   node scripts/make-icons.mjs
//
// Like the link-preview card, the rasteriser is not a saved dependency — the
// files are committed, so a normal install and a Netlify build never need it.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const head = readFileSync("public/assets/ryan-head-floating.png").toString("base64");

// A square crop of the source, hair to chin. The trim the game uses is portrait
// and includes the shoulders, which at 32 pixels turns the face into a speck.
//
// Measured, not guessed: the widest row of the face is y 159, spanning x 67-247,
// so the head centres on x 157. Hair starts at y 25 and the chin is at about
// y 230, which is why this reaches further down than it looks like it should.
const SRC = { x: 38, y: 7, size: 250, full: 300 };

/** Dark rounded tile so the face reads against any tab colour, light or dark. */
function iconSvg(size) {
  const k = size / SRC.size;
  const r = size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#2a1450"/>
      <stop offset="100%" stop-color="#140b33"/>
    </linearGradient>
    <clipPath id="tile"><rect width="${size}" height="${size}" rx="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <image href="data:image/png;base64,${head}"
           x="${-SRC.x * k}" y="${-SRC.y * k}"
           width="${SRC.full * k}" height="${SRC.full * k}"/>
  </g>
</svg>`;
}

const render = (size) =>
  Buffer.from(
    new Resvg(iconSvg(size), { fitTo: { mode: "width", value: size } }).render().asPng(),
  );

/**
 * Wrap a PNG in an ICO container. Browsers have accepted PNG favicons for years,
 * but /favicon.ico is still requested unprompted, and serving a real one costs
 * nothing and avoids a 404 in the logs of every visit.
 */
function ico(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width, 0 means 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12); // offset to the data

  return Buffer.concat([header, entry, png]);
}

const outputs = [
  ["public/favicon.png", render(64)],
  ["public/apple-touch-icon.png", render(180)],
  ["public/favicon.ico", ico(render(32), 32)],
];

for (const [path, data] of outputs) {
  writeFileSync(path, data);
  console.log(`wrote ${path} (${data.length} bytes)`);
}
