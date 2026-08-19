// Generates public/og.png — the card that appears when the link is pasted into
// Slack, Teams, or an email. Run it when the art or the wording changes:
//
//   npm i --no-save @resvg/resvg-js
//   node scripts/make-og.mjs
//
// The rasteriser is not a saved dependency: the PNG is committed, so a normal
// install and a Netlify build never need it.
//
// The club is the same shape src/render/shapes.ts draws in game, translated from
// canvas calls into an SVG path, so the card matches what people actually see.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const W = 1200;
const H = 630;

// The cutout sits inside transparent margins. These are the same fractions the
// game crops with, and they match the image's real opaque bounds.
const TRIM = { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };

const head = readFileSync("public/assets/ryan-head-floating.png").toString("base64");

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

// Club, in the proportions drawClub() uses. Shouldered behind the head, with the
// face out in the open to the left where it is actually legible.
const r = 120;
const shaftW = r * 0.115;
const top = -r * 2.05;
const bottom = r * 1.55;

const clubFace = [
  `M ${-r * 0.1} ${bottom - r * 0.1}`,
  `L ${-r * 0.78} ${bottom + r * 0.16}`,
  `L ${-r * 0.74} ${bottom + r * 0.42}`,
  `L ${r * 0.14} ${bottom + r * 0.3}`,
  "Z",
].join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#140b33"/>
      <stop offset="42%" stop-color="#1d1046"/>
      <stop offset="72%" stop-color="#2a1450"/>
      <stop offset="100%" stop-color="#14092c"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.16" cy="0.06" r="0.62">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.88" cy="0.14" r="0.55">
      <stop offset="0%" stop-color="#ff6fa3" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#ff6fa3" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fairway" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2e8e60" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2e8e60" stop-opacity="0.38"/>
    </linearGradient>
    <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8a94a6"/>
      <stop offset="45%" stop-color="#e9edf3"/>
      <stop offset="100%" stop-color="#78829a"/>
    </linearGradient>
    <linearGradient id="clubhead" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#dfe5ee"/>
      <stop offset="100%" stop-color="#9aa4b6"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <rect x="0" y="${H - 170}" width="${W}" height="170" fill="url(#fairway)"/>

  <!-- Drawn before the head, so the shaft passes behind it. -->
  <g transform="translate(806 296) rotate(26)">
    <rect x="${-shaftW / 2}" y="${top}" width="${shaftW}" height="${bottom - top}" fill="url(#shaft)"/>
    <rect x="${-shaftW * 0.78}" y="${top}" width="${shaftW * 1.56}" height="${r * 0.78}" fill="#241a33"/>
    <path d="${clubFace}" fill="url(#clubhead)" stroke="rgba(20,12,38,.5)" stroke-width="${r * 0.04}"/>
  </g>

  <image href="data:image/png;base64,${head}"
         x="${fullX}" y="${fullY}" width="${fullW}" height="${fullH}"/>

  <!-- A ball waiting at the clubface. Kept clear of both the club and the text. -->
  <circle cx="628" cy="512" r="16" fill="#ffffff"/>
  <circle cx="622" cy="506" r="2.8" fill="#d7dce8"/>
  <circle cx="632" cy="515" r="2.8" fill="#d7dce8"/>
  <circle cx="624" cy="519" r="2.8" fill="#d7dce8"/>

  <text x="82" y="252" font-family="DejaVu Sans" font-size="100" font-weight="bold"
        fill="#ffd166">Fore Ryan!</text>
  <text x="86" y="326" font-family="DejaVu Sans" font-size="40" font-weight="bold"
        fill="#f2ecff">A birthday golf game</text>
  <text x="86" y="392" font-family="DejaVu Sans" font-size="27"
        fill="#b9a9d6">Sink the holes, dodge the hazards,</text>
  <text x="86" y="430" font-family="DejaVu Sans" font-size="27"
        fill="#b9a9d6">then take the leaderboard.</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontDirs: ["/usr/share/fonts"], defaultFontFamily: "DejaVu Sans", loadSystemFonts: true },
}).render();

writeFileSync("public/og.png", png.asPng());
console.log(`wrote public/og.png (${W}x${H})`);
