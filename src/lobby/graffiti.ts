// Ryan, sprayed on the wall above the broken machines: a three-tone stencil of
// his photo with paint drips, "Ryan woz ere" tagged beside him, "I REGRET
// NOTHING" in a speech bubble, and an arrow at the machines saying he did it.
//
// It's dressed for the season, like the room: see SEASON_DRESS.

import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene, SRGBColorSpace } from "three";
import type { Season } from "./season";

/** The piece's size on the wall, in metres, and the canvas it's painted on. */
const WIDTH = 2.4;
const HEIGHT = 1.2;
const CW = 2048;
const CH = 1024;

/** Where the head goes on the canvas, and the photo's trim (the head inside the 300x300 PNG). */
const TRIM = { x: 67, y: 21, w: 189, h: 259 };
const HEAD = { x: 640, y: 260, h: 560 };
const SCALE = HEAD.h / TRIM.h;
/** Photo pixels to canvas pixels. */
const at = (px: number, py: number): [number, number] => [HEAD.x + (px - TRIM.x) * SCALE, HEAD.y + (py - TRIM.y) * SCALE];
// Landmarks in the photo (the same ones the ski jump's head uses).
const MOUTH = at(150, 228);
const CHIN = at(150, 272);
const CHEEKS = [at(84, 205), at(228, 205)];
const CROWN = at(160, 30);

const STENCIL = { dark: "#1c2748", mid: "#c8323c", light: "#efdcb4" };
const SPRAY_FONT = `"Mr Dafoe", "Brush Script MT", cursive`;
const BLOCK_FONT = `700 76px "Oswald", Impact, sans-serif`;

type Ctx = CanvasRenderingContext2D;

/** A line sprayed on: soft-edged, with overspray round it. */
function spray(ctx: Ctx, points: Array<[number, number]>, colour: string, width: number): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = colour;
  ctx.shadowBlur = width * 0.8;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

/** A filled shape sprayed on. */
function sprayFill(ctx: Ctx, draw: (ctx: Ctx) => void, colour: string, blur = 10): void {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  draw(ctx);
  ctx.fill();
  ctx.restore();
}

/** Paint running down from a point. */
function drip(ctx: Ctx, x: number, y: number, length: number, colour: string, width = 7): void {
  spray(ctx, [[x, y], [x + 1, y + length]], colour, width);
  sprayFill(ctx, (c) => c.arc(x + 1, y + length, width * 0.75, 0, Math.PI * 2), colour, 2);
}

/** Repeatable randomness, so the piece looks the same every visit. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** His photo as a three-tone street-art stencil, with drips running off the bottom. */
function stencil(head: HTMLImageElement): HTMLCanvasElement {
  const w = Math.round(TRIM.w * SCALE);
  const h = Math.round(TRIM.h * SCALE);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h + 120; // room for the drips
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  ctx.drawImage(head, TRIM.x, TRIM.y, TRIM.w, TRIM.h, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  // Cut the tones where this photo's own light and shade fall, not at fixed levels.
  const lum = new Float32Array(w * h);
  const seen: number[] = [];
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];
    if (px[i * 4 + 3] > 128) seen.push(lum[i]);
  }
  seen.sort((a, b) => a - b);
  const darkBelow = seen[Math.floor(seen.length * 0.3)] ?? 80;
  const midBelow = seen[Math.floor(seen.length * 0.68)] ?? 160;
  const tone = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const [dark, mid, light] = [tone(STENCIL.dark), tone(STENCIL.mid), tone(STENCIL.light)];
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3];
    const [r, g, b] = lum[i] < darkBelow ? dark : lum[i] < midBelow ? mid : light;
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a > 128 ? 255 : 0; // a stencil's edge is hard
  }
  ctx.putImageData(image, 0, 0);

  // Drips from the lowest painted point of a few columns.
  const rand = seeded(7);
  for (let k = 0; k < 9; k++) {
    const x = Math.round(w * (0.18 + 0.64 * rand()));
    let y = h - 1;
    while (y > 0 && px[(y * w + x) * 4 + 3] === 0) y--;
    if (y <= 0) continue;
    const [r, g, b] = [px[(y * w + x) * 4], px[(y * w + x) * 4 + 1], px[(y * w + x) * 4 + 2]];
    drip(ctx, x, y - 4, 25 + rand() * 90, `rgb(${r},${g},${b})`, 6 + rand() * 4);
  }
  return out;
}

// --- the season's dressing ---------------------------------------------------------

/** A spray-painted Santa hat, flopping off to one side. */
function santaHat(ctx: Ctx): void {
  const [cx, cy] = CROWN;
  const red = "#d42a35";
  const fur = "#e9e4da";
  sprayFill(ctx, (c) => {
    c.moveTo(cx - 230, cy + 40);
    c.quadraticCurveTo(cx - 120, cy - 230, cx + 60, cy - 200);
    c.quadraticCurveTo(cx + 210, cy - 170, cx + 270, cy - 40);
    c.lineTo(cx + 230, cy + 40);
    c.closePath();
  }, red, 14);
  // The brim, lumpy like a fur band done in three passes.
  for (let i = 0; i < 3; i++) spray(ctx, [[cx - 245, cy + 50 - i * 6], [cx, cy + 34 - i * 6], [cx + 245, cy + 48 - i * 6]], fur, 46);
  sprayFill(ctx, (c) => c.arc(cx + 285, cy - 30, 46, 0, Math.PI * 2), fur, 14); // the bobble
}

/** A spray-painted Santa beard round the jaw, leaving the mouth clear. */
function santaBeard(ctx: Ctx): void {
  const fur = "#e9e4da";
  const [[lx, ly], [rx, ry]] = CHEEKS;
  const [mx, my] = MOUTH;
  const [, chinY] = CHIN;
  ctx.save();
  // Everything but an oval round the mouth.
  ctx.beginPath();
  ctx.rect(0, 0, CW, CH);
  ctx.ellipse(mx, my + 4, 78, 30, 0, 0, Math.PI * 2);
  ctx.clip("evenodd");
  sprayFill(ctx, (c) => {
    c.moveTo(lx - 10, ly - 30);
    c.bezierCurveTo(lx - 30, chinY + 40, mx - 60, chinY + 150, mx, chinY + 170);
    c.bezierCurveTo(mx + 60, chinY + 150, rx + 30, chinY + 40, rx + 10, ry - 30);
    c.bezierCurveTo(rx - 40, my - 20, lx + 40, my - 20, lx - 10, ly - 30);
  }, fur, 18);
  // Curly scribbles, so it reads as beard rather than a blob.
  const rand = seeded(11);
  for (let i = 0; i < 26; i++) {
    const x = lx + (rx - lx) * rand();
    const y = my + 30 + (chinY + 120 - my) * rand();
    spray(ctx, [[x - 14, y], [x - 4, y + 12], [x + 8, y - 2], [x + 16, y + 10]], "#c9c2b5", 5);
  }
  ctx.restore();
  // A moustache over the top lip.
  spray(ctx, [[mx - 80, my - 4], [mx - 40, my - 26], [mx, my - 14], [mx + 40, my - 26], [mx + 80, my - 4]], fur, 26);
}

/** Out of season: a gold crown scrawled on his head. */
function crown(ctx: Ctx): void {
  const [cx, cy] = CROWN;
  spray(ctx, [[cx - 150, cy + 10], [cx - 160, cy - 110], [cx - 75, cy - 40], [cx, cy - 140], [cx + 75, cy - 40], [cx + 160, cy - 110], [cx + 150, cy + 10], [cx - 150, cy + 10]], "#f2c230", 16);
  for (const [x, y] of [[cx - 160, cy - 128], [cx, cy - 160], [cx + 160, cy - 128]]) sprayFill(ctx, (c) => c.arc(x, y, 14, 0, Math.PI * 2), "#f2c230", 6);
}

/**
 * What he wears for each season. A new season in season.ts must add its own
 * here (Easter: bunny ears), or this won't compile. Out of season, a crown.
 */
const SEASON_DRESS: Record<NonNullable<Season>, (ctx: Ctx) => void> = {
  christmas: (ctx) => {
    santaBeard(ctx);
    santaHat(ctx);
  },
};

// --- the rest of the piece -----------------------------------------------------

function tag(ctx: Ctx): void {
  // "Ryan woz ere", big and slanted, in two passes: a dark outline, then the fill.
  ctx.save();
  ctx.translate(330, 560);
  ctx.rotate(-0.12);
  ctx.textAlign = "center";
  ctx.font = `170px ${SPRAY_FONT}`;
  ctx.lineWidth = 16;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#140a24";
  ctx.strokeText("Ryan", 0, -40);
  ctx.strokeText("woz ere", 20, 130);
  ctx.shadowColor = "#ff3fd0";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ff4fd6";
  ctx.fillText("Ryan", 0, -40);
  ctx.fillStyle = "#3fe0ff";
  ctx.shadowColor = "#3fe0ff";
  ctx.fillText("woz ere", 20, 130);
  ctx.restore();
  drip(ctx, 250, 548, 70, "#ff4fd6");
  drip(ctx, 372, 700, 50, "#3fe0ff");
  drip(ctx, 160, 715, 95, "#3fe0ff");
}

function bubble(ctx: Ctx): void {
  const [mx, my] = MOUTH;
  ctx.save();
  ctx.translate(1430, 170);
  ctx.rotate(0.05);
  // The bubble and its tail pointing back at his mouth.
  sprayFill(ctx, (c) => {
    c.ellipse(0, 0, 330, 110, 0, 0, Math.PI * 2);
  }, "#efe9dc", 8);
  ctx.restore();
  sprayFill(ctx, (c) => {
    c.moveTo(1240, 240);
    c.lineTo(mx + 130, my - 60);
    c.lineTo(1330, 262);
    c.closePath();
  }, "#efe9dc", 6);
  ctx.save();
  ctx.translate(1430, 170);
  ctx.rotate(0.05);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#14102a";
  ctx.font = BLOCK_FONT;
  ctx.fillText("I REGRET NOTHING", 0, 6, 580);
  ctx.restore();
}

/** "HE DID THIS", and an arrow dropping straight down onto the broken machine below. */
function blame(ctx: Ctx, arrowAtX: number): void {
  ctx.save();
  ctx.translate(arrowAtX + 130, 540);
  ctx.rotate(0.06);
  ctx.textAlign = "center";
  ctx.font = BLOCK_FONT.replace("76px", "70px");
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#140a24";
  ctx.strokeText("HE DID THIS", 0, 0);
  ctx.fillStyle = "#f2c230";
  ctx.shadowColor = "#f2c230";
  ctx.shadowBlur = 10;
  ctx.fillText("HE DID THIS", 0, 0);
  ctx.restore();
  const end: [number, number] = [arrowAtX, 990];
  // A slight wobble, as if sprayed in one go.
  spray(ctx, [[arrowAtX + 110, 590], [arrowAtX + 20, 700], [arrowAtX + 8, 860], end], "#f2c230", 18);
  spray(ctx, [[end[0] - 55, end[1] - 75], end, [end[0] + 55, end[1] - 75]], "#f2c230", 18);
}

export interface GraffitiOptions {
  head: HTMLImageElement | null;
  season: Season;
  /** Centre of the piece on the wall. */
  x: number;
  y: number;
  z: number;
  /** World x the arrow points down at (a broken machine). */
  blameX: number;
}

export function sprayGraffiti(scene: Scene, o: GraffitiOptions): void {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const face = o.head ? stencil(o.head) : null;
  const toCanvasX = (worldX: number): number => ((worldX - o.x) / WIDTH + 0.5) * CW;

  if (ctx) {
    tag(ctx);
    blame(ctx, Math.min(CW - 200, Math.max(1180, toCanvasX(o.blameX))));
    if (face) {
      // Overspray first, then the crisp stencil.
      ctx.save();
      ctx.shadowColor = "rgba(28, 39, 72, 0.9)";
      ctx.shadowBlur = 18;
      ctx.drawImage(face, HEAD.x, HEAD.y);
      ctx.restore();
      ctx.drawImage(face, HEAD.x, HEAD.y);
    }
    if (o.season) SEASON_DRESS[o.season](ctx);
    else crown(ctx);
    bubble(ctx);
    texture.needsUpdate = true;
  }

  // Paint on a dark wall: lit by the room, with a little of its own so it reads.
  const wall = new Mesh(
    new PlaneGeometry(WIDTH, HEIGHT),
    new MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: "#ffffff",
      emissiveIntensity: 0.28,
      roughness: 0.95,
      transparent: true,
      depthWrite: false,
    }),
  );
  wall.position.set(o.x, o.y, o.z);
  scene.add(wall);
}
