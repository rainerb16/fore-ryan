// The horizon behind the play area: a silhouette that matches the course name,
// painted procedurally so there are still no image files to ship.
//
// It is rendered once into an offscreen canvas and blitted each frame, because
// the shapes only change when the level or the viewport does. Layout comes from
// a seeded generator rather than Math.random, or the hills would crawl about
// between frames.

import { activeTheme, type Theme } from "./theme";

export type SceneryKind = "range" | "hills" | "water" | "pines" | "stands" | "peaks" | "volcano";

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;

function mulberry32(seed: number): Rnd {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rnd: Rnd, a: number, b: number): number => a + rnd() * (b - a);

/** A run of soft mounds along the bottom edge. */
function ridge(c: Ctx, w: number, h: number, top: number, bumps: number, rnd: Rnd): void {
  c.beginPath();
  c.moveTo(0, h);
  c.lineTo(0, top);
  const step = w / bumps;
  for (let i = 0; i < bumps; i++) {
    const x = i * step;
    c.quadraticCurveTo(x + step * 0.5, top - between(rnd, 0.25, 1) * step * 0.42, x + step, top);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
}

function hills(c: Ctx, w: number, h: number, rnd: Rnd): void {
  for (let layer = 0; layer < 3; layer++) {
    c.globalAlpha = 0.3 - layer * 0.07;
    ridge(c, w, h, h * (0.9 - layer * 0.05), 3 + layer, rnd);
  }
}

/** Driving range: low mounds and a line of distance flags marching away. */
function range(c: Ctx, w: number, h: number, s: number, rnd: Rnd, ink: string): void {
  hills(c, w, h, rnd);

  const count = Math.max(3, Math.round(w / (170 * s)));
  for (let i = 0; i < count; i++) {
    const x = between(rnd, 0.04, 0.96) * w;
    const poleH = between(rnd, 26, 46) * s;
    const y = h * between(rnd, 0.83, 0.9);
    c.globalAlpha = 0.34;
    c.strokeStyle = ink;
    c.lineWidth = Math.max(1, 1.6 * s);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y - poleH);
    c.stroke();

    c.beginPath();
    c.moveTo(x, y - poleH);
    c.lineTo(x + 11 * s, y - poleH + 5 * s);
    c.lineTo(x, y - poleH + 10 * s);
    c.closePath();
    c.fill();
  }
}

/** Water hazard: a still pond with ripple lines across it. */
function water(c: Ctx, w: number, h: number, s: number, rnd: Rnd, ink: string): void {
  c.globalAlpha = 0.32;
  ridge(c, w, h, h * 0.88, 3, rnd);

  const top = h * 0.9;
  c.globalAlpha = 0.22;
  c.fillRect(0, top, w, h - top);

  c.strokeStyle = ink;
  c.lineWidth = Math.max(1, 1.4 * s);
  for (let i = 0; i < 9; i++) {
    const y = top + between(rnd, 0.08, 0.95) * (h - top);
    const len = between(rnd, 30, 120) * s;
    const x = between(rnd, 0, 1) * (w - len);
    c.globalAlpha = between(rnd, 0.12, 0.3);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y);
    c.stroke();
  }
}

/** The woods: a treeline of pines at varying depths. */
function pines(c: Ctx, w: number, h: number, s: number, rnd: Rnd): void {
  for (let layer = 0; layer < 2; layer++) {
    const baseY = h * (0.97 - layer * 0.04);
    const scale = 1 - layer * 0.28;
    c.globalAlpha = 0.34 - layer * 0.12;

    const spacing = 52 * s * scale;
    for (let x = -spacing; x < w + spacing; x += spacing * between(rnd, 0.7, 1.15)) {
      const treeH = between(rnd, 60, 108) * s * scale;
      const halfW = treeH * 0.29;
      c.beginPath();
      // Three stacked tiers make it read as a conifer rather than a cone.
      for (let tier = 0; tier < 3; tier++) {
        const tierTop = baseY - treeH + (treeH / 3) * tier;
        const spread = halfW * (0.55 + tier * 0.28);
        c.moveTo(x, tierTop);
        c.lineTo(x + spread, tierTop + treeH * 0.42);
        c.lineTo(x - spread, tierTop + treeH * 0.42);
        c.closePath();
      }
      c.fill();
    }
  }
}

/** Championship: grandstands with pennants along the top. */
function stands(c: Ctx, w: number, h: number, s: number, rnd: Rnd, ink: string): void {
  c.globalAlpha = 0.26;
  ridge(c, w, h, h * 0.92, 3, rnd);

  const blockW = 96 * s;
  for (let x = 0; x < w; x += blockW * between(rnd, 1.05, 1.4)) {
    const bh = between(rnd, 40, 74) * s;
    const bw = blockW * between(rnd, 0.6, 0.95);
    const top = h * 0.93 - bh;
    c.globalAlpha = 0.3;
    c.fillRect(x, top, bw, bh);

    // Pennants along the roofline.
    c.globalAlpha = 0.4;
    c.strokeStyle = ink;
    c.lineWidth = Math.max(1, 1.2 * s);
    for (let f = 0; f < 3; f++) {
      const fx = x + (bw / 3) * (f + 0.5);
      c.beginPath();
      c.moveTo(fx, top);
      c.lineTo(fx, top - 14 * s);
      c.stroke();
      c.beginPath();
      c.moveTo(fx, top - 14 * s);
      c.lineTo(fx + 8 * s, top - 10 * s);
      c.lineTo(fx, top - 6 * s);
      c.closePath();
      c.fill();
    }
  }
}

/** Jagged peaks. `glow` lights the tallest one, for the volcano. */
function peaks(c: Ctx, w: number, h: number, s: number, rnd: Rnd, glow: string | null): void {
  for (let layer = 0; layer < 2; layer++) {
    const baseY = h * (0.98 - layer * 0.03);
    c.globalAlpha = 0.34 - layer * 0.12;
    const span = 150 * s * (1 - layer * 0.25);

    let tallest = { x: 0, y: baseY };
    c.beginPath();
    c.moveTo(0, h);
    for (let x = -span; x < w + span; x += span) {
      const peakY = baseY - between(rnd, 60, 150) * s * (1 - layer * 0.3);
      if (peakY < tallest.y) tallest = { x: x + span / 2, y: peakY };
      c.lineTo(x + span / 2, peakY);
      c.lineTo(x + span, baseY);
    }
    c.lineTo(w, h);
    c.closePath();
    c.fill();

    if (glow && layer === 0) {
      const g = c.createRadialGradient(tallest.x, tallest.y, 0, tallest.x, tallest.y, 70 * s);
      g.addColorStop(0, glow);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.globalAlpha = 0.6;
      c.fillStyle = g;
      c.beginPath();
      c.arc(tallest.x, tallest.y, 70 * s, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/** A scatter of stars across the upper sky, for the night levels. */
function stars(c: Ctx, w: number, h: number, s: number, rnd: Rnd): void {
  c.fillStyle = "#ffffff";
  for (let i = 0; i < 46; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.55;
    c.globalAlpha = between(rnd, 0.15, 0.6);
    c.fillRect(x, y, Math.max(1, 1.6 * s), Math.max(1, 1.6 * s));
  }
}

function paint(c: Ctx, w: number, h: number, s: number, theme: Theme): void {
  // Seeded from the kind so a level's horizon is the same every time you see it.
  const rnd = mulberry32(theme.scenery.length * 9176 + theme.sceneryInk.charCodeAt(3) * 131);
  c.fillStyle = theme.sceneryInk;
  c.strokeStyle = theme.sceneryInk;

  switch (theme.scenery) {
    case "range":
      range(c, w, h, s, rnd, theme.sceneryInk);
      break;
    case "hills":
      hills(c, w, h, rnd);
      break;
    case "water":
      water(c, w, h, s, rnd, theme.sceneryInk);
      break;
    case "pines":
      pines(c, w, h, s, rnd);
      break;
    case "stands":
      stands(c, w, h, s, rnd, theme.sceneryInk);
      break;
    case "peaks":
      stars(c, w, h, s, rnd);
      c.fillStyle = theme.sceneryInk;
      peaks(c, w, h, s, rnd, null);
      break;
    case "volcano":
      peaks(c, w, h, s, rnd, "rgba(255,140,60,.75)");
      break;
  }
  c.globalAlpha = 1;
}

let cache: HTMLCanvasElement | null = null;
let cacheKey = "";

/** Force a repaint — called when the level or the viewport changes. */
export function invalidateScenery(): void {
  cacheKey = "";
}

export function drawScenery(ctx: Ctx, w: number, h: number, s: number, dpr: number): void {
  if (w <= 0 || h <= 0) return;
  const theme = activeTheme;
  const key = `${theme.scenery}|${Math.round(w)}x${Math.round(h)}|${dpr}`;

  if (cacheKey !== key) {
    const buffer = (cache ??= document.createElement("canvas"));
    buffer.width = Math.max(1, Math.round(w * dpr));
    buffer.height = Math.max(1, Math.round(h * dpr));
    const c = buffer.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    paint(c, w, h, s, theme);
    cacheKey = key;
  }
  if (!cache) return;

  ctx.drawImage(cache, 0, 0, w, h);
}
