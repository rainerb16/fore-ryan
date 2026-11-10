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

/** Glowing tube lettering on a transparent background. */
export function neon(text: string, colour: string): CanvasTexture {
  return paint(1024, 256, (ctx) => {
    ctx.font = `bold 150px ${ARCADE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = colour;
    for (const blur of [60, 30, 12]) {
      ctx.shadowBlur = blur;
      ctx.fillStyle = colour;
      ctx.fillText(text, 512, 132);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff6fd"; // the hot core of the tube
    ctx.fillText(text, 512, 132);
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

export function drawHead(texture: CanvasTexture, head: HTMLImageElement): void {
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
