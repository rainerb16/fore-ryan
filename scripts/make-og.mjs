// Generates public/og.png — the card that appears when the link is pasted into
// Slack, Teams, or an email. Run it when the art or the wording changes:
//
//   npm i --no-save @resvg/resvg-js
//   node scripts/make-og.mjs
//
// The rasteriser is not a saved dependency: the PNG is committed, so a normal
// install and a Netlify build never need it.
//
// The card is the arcade at Christmas: the neon title, what's new, and Ryan in a
// Santa hat. Redo it each season the arcade gets a new game.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const W = 1200;
const H = 630;

// The cutout sits inside transparent margins. These are the same fractions the
// game crops with, and they match the image's real opaque bounds.
const TRIM = { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };

const head = readFileSync("public/assets/ryan/ryan-head-floating.png").toString("base64");

// Where the visible head lands on the card. It is deliberately run off the
// bottom edge: the cutout ends in a straight line across the shoulders, which
// reads as a photo crop if you leave it showing.
const contentH = 450;
const contentW = contentH * (TRIM.w / TRIM.h);
const contentX = 762;
const contentY = 200;

// Back out the placement of the whole image so its opaque part lands there.
const fullW = contentW / TRIM.w;
const fullH = contentH / TRIM.h;
const fullX = contentX - TRIM.x * fullW;
const fullY = contentY - TRIM.y * fullH;

// Christmas lights strung along the top, sagging between hooks.
const bulbColours = ["#ff3b3b", "#3bff7a", "#ffd23b", "#3bb4ff", "#ff7af0"];
const lights = [];
let wire = "M -10 18";
for (let hook = 0; hook < 6; hook++) {
  const x0 = -10 + hook * 210;
  wire += ` Q ${x0 + 105} 70 ${x0 + 210} 18`;
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    const x = x0 + 210 * t;
    const y = 18 + 52 * 4 * t * (1 - t) * 0.5 + 10;
    const c = bulbColours[(hook * 5 + k) % bulbColours.length];
    lights.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="8" ry="11" fill="${c}" filter="url(#bulb)"/>`);
  }
}

// A few snowflakes, placed by hand so they stay clear of the text.
const flakes = [[540, 120], [660, 470], [470, 560], [1130, 520], [700, 190], [600, 300], [1160, 300]]
  .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${3 + (i % 3)}" fill="#ffffff" opacity="0.55"/>`)
  .join("");

// A Santa hat on his head, flopping off to the right.
const hat = `<g transform="translate(14 48)">
  <path d="M 752 236 C 790 120, 900 70, 1010 98 C 1090 118, 1140 170, 1160 228 L 1112 250 C 1060 190, 1000 170, 980 200 L 1100 246 Z"
        fill="#d42a35"/>
  <path d="M 744 232 C 840 200, 1000 196, 1106 232 L 1100 272 C 1000 240, 840 242, 750 276 Z"
        fill="#f4f1ea"/>
  <circle cx="1160" cy="236" r="30" fill="#f4f1ea"/></g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="night" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#0d0620"/>
      <stop offset="55%" stop-color="#170a33"/>
      <stop offset="100%" stop-color="#07040f"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.18" cy="0.32" r="0.6">
      <stop offset="0%" stop-color="#ff3fd0" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ff3fd0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.86" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#36e2ff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#36e2ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="neon" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="bulb" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#night)"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  ${flakes}

  <image href="data:image/png;base64,${head}"
         x="${fullX}" y="${fullY}" width="${fullW}" height="${fullH}"/>
  ${hat}

  <path d="${wire}" fill="none" stroke="#1d1a26" stroke-width="3"/>
  ${lights.join("\n  ")}

  <text x="78" y="230" font-family="DejaVu Sans" font-size="104" font-weight="bold" font-style="italic"
        fill="#ffd6f5" stroke="#ff3fd0" stroke-width="2" filter="url(#neon)">Ryan</text>
  <text x="80" y="330" font-family="DejaVu Sans" font-size="96" font-weight="bold" letter-spacing="6"
        fill="#d8fbff" stroke="#36e2ff" stroke-width="2" filter="url(#neon)">ARCADE</text>
  <text x="84" y="410" font-family="DejaVu Sans" font-size="31" font-weight="bold"
        fill="#ffd166">New for Christmas: Ryan Ski Jump</text>
  <text x="84" y="462" font-family="DejaVu Sans" font-size="26"
        fill="#c9bde6">Plus Fore Ryan!, and a few machines</text>
  <text x="84" y="498" font-family="DejaVu Sans" font-size="26"
        fill="#c9bde6">that are mysteriously out of order.</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontDirs: ["/usr/share/fonts"], defaultFontFamily: "DejaVu Sans", loadSystemFonts: true },
}).render();

writeFileSync("public/og.png", png.asPng());
console.log(`wrote public/og.png (${W}x${H})`);
