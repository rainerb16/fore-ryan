// Everything in the arcade that is painted rather than modelled: carpet, neon,
// marquees and side art are 2D canvases mapped onto simple geometry.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { GameEntry } from "../../shared/games";

export interface Palette {
  primary: string;
  secondary: string;
  /** Marquee backdrop, top to bottom. */
  backdrop: [string, string];
  props: [string, string, string];
}

export const PALETTES: Record<GameEntry["occasion"], Palette> = {
  Birthday: { primary: "#ff6fa3", secondary: "#ffd166", backdrop: ["#3b0f4f", "#14092c"], props: ["🎂", "🎈", "⛳"] },
  Christmas: { primary: "#ff4d5e", secondary: "#5ee6a8", backdrop: ["#0f3b2a", "#071a14"], props: ["🎄", "🎅", "⛷️"] },
  Easter: { primary: "#c4a1ff", secondary: "#ffe38a", backdrop: ["#2b2350", "#141029"], props: ["🐣", "🌷", "🥚"] },
};

export const ARCADE_FONT = `"Trebuchet MS", "Segoe UI", system-ui, sans-serif`;

export function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Fixed seed, so the carpet is the same pattern on every visit. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The classic cosmic arcade carpet: neon squiggles, rings and stars on navy. */
export function carpet(): CanvasTexture {
  const texture = paint(512, 512, (ctx) => {
    const rand = seeded(1990);
    const colours = ["#ff4fd8", "#36e2ff", "#ffe14d", "#8a5cff", "#4dff9a"];
    ctx.fillStyle = "#100828";
    ctx.fillRect(0, 0, 512, 512);
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      const x = rand() * 512;
      const y = rand() * 512;
      const colour = colours[Math.floor(rand() * colours.length)];
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      const kind = rand();
      if (kind < 0.35) {
        ctx.beginPath(); // squiggle
        ctx.moveTo(x, y);
        for (let s = 1; s <= 4; s++) ctx.lineTo(x + s * 12, y + (s % 2 ? -10 : 10));
        ctx.stroke();
      } else if (kind < 0.6) {
        ctx.beginPath(); // ring
        ctx.arc(x, y, 8 + rand() * 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind < 0.8) {
        ctx.beginPath(); // triangle
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x + 12, y + 10);
        ctx.lineTo(x - 12, y + 10);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, 4, 4); // star
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** 80s sign faces: a brush script over outlined tube capitals. Loaded in index.html. */
export const SCRIPT_FONT = `"Mr Dafoe", "Brush Script MT", cursive`;
export const TUBE_FONT = `"Monoton", ${ARCADE_FONT}`;

/** One line of neon: a coloured halo, the tube, and a pale (not white) core. */
function tube(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, core: string): void {
  ctx.shadowColor = colour;
  ctx.fillStyle = colour;
  for (const blur of [28, 10]) {
    ctx.shadowBlur = blur;
    ctx.fillText(text, x, y);
  }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = core;
  ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);
}

/** The synthwave wall sign: "Ryan" in pink script slung across cyan "ARCADE". */
export function neonSign(): CanvasTexture {
  return paint(1024, 384, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `120px ${TUBE_FONT}`;
    tube(ctx, "ARCADE", 512, 262, "#36e2ff", "#c9f6ff");
    ctx.save();
    ctx.translate(430, 128);
    ctx.rotate(-0.12);
    ctx.font = `190px ${SCRIPT_FONT}`;
    tube(ctx, "Ryan", 0, 0, "#ff3fd0", "#ffc4ef");
    ctx.restore();
  });
}

/** The backlit sign on top of a cabinet. */
export function marquee(title: string, palette: Palette, lit: boolean): CanvasTexture {
  return paint(512, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, lit ? palette.backdrop[0] : "#1a1a22");
    g.addColorStop(1, lit ? palette.backdrop[1] : "#0c0c10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = `bold ${title.length > 14 ? 46 : 58}px ${ARCADE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (lit) {
      ctx.shadowColor = palette.primary;
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = lit ? palette.secondary : "#4a4a55";
    ctx.fillText(title.toUpperCase(), 256, 66, 480);
  });
}

/** Cabinet side art: the occasion's colours, its props, and Ryan's head once it loads. */
export function sideArt(palette: Palette, head: HTMLImageElement | null): CanvasTexture {
  const texture = paint(256, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, palette.backdrop[0]);
    g.addColorStop(1, palette.backdrop[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 10;
    for (let y = 300; y < 520; y += 40) {
      ctx.beginPath(); // racing stripes
      ctx.moveTo(0, y);
      ctx.lineTo(256, y - 120);
      ctx.stroke();
    }
    ctx.font = `64px ${ARCADE_FONT}`;
    ctx.textAlign = "center";
    palette.props.forEach((prop, i) => ctx.fillText(prop, 50 + i * 78, 470));
  });
  if (head) drawHead(texture, head);
  return texture;
}

function drawHead(texture: CanvasTexture, head: HTMLImageElement): void {
  const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
  if (!ctx) return;
  ctx.drawImage(head, 8, 40, 240, 240);
  texture.needsUpdate = true;
}

/** A soft white disc, laid on the floor under each ceiling spot instead of a real light. */
export function lightPool(): CanvasTexture {
  return paint(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,240,220,0.55)");
    g.addColorStop(0.5, "rgba(255,220,200,0.18)");
    g.addColorStop(1, "rgba(255,220,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

/** A soft dark footprint that sits a cabinet on the carpet. */
export function contactShadow(): CanvasTexture {
  return paint(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.75)");
    g.addColorStop(0.6, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Dark painted wall panels with seams and a little grime. */
export function wallPanels(): CanvasTexture {
  const texture = paint(512, 512, (ctx) => {
    const rand = seeded(42);
    ctx.fillStyle = "#1b1030";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "90,70,140"},${rand() * 0.07})`;
      ctx.fillRect(rand() * 512, rand() * 512, 2 + rand() * 6, 2 + rand() * 6);
    }
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (const x of [0, 256]) ctx.fillRect(x, 0, 3, 512); // panel seams
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (const x of [3, 259]) ctx.fillRect(x, 0, 2, 512);
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}
