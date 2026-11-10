// A cabinet's CRT in attract mode, cycling like a real machine left idle:
// title, then the high scores, then INSERT COIN. Repainted only when what it
// shows changes, not every frame.

import type { CanvasTexture } from "three";
import type { GameEntry } from "../../shared/games";
import type { LeaderboardEntry } from "../../shared/scores";
import { paint, type Palette } from "./textures";

const W = 320;
const H = 240;
/** Drawn in a 320x240 space, rendered at twice that so the thumbnail stays sharp. */
const RES = 2;
const PIXEL_FONT = `"Courier New", ui-monospace, monospace`;

/** Seconds each page of the cycle stays up. */
const PAGES = [
  { page: "title", secs: 5 },
  { page: "scores", secs: 4 },
  { page: "coin", secs: 3 },
] as const;
const CYCLE = PAGES.reduce((sum, p) => sum + p.secs, 0);

type Page = (typeof PAGES)[number]["page"];

export type Scores =
  | { state: "loading" }
  | { state: "ready"; top: LeaderboardEntry[] }
  | { state: "error" };

const ORDINALS = ["1ST", "2ND", "3RD"];

export class AttractScreen {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D | null;
  private scores: Scores = { state: "loading" };
  private shown = "";
  private thumbnail: HTMLImageElement | null = null;

  constructor(
    private readonly game: GameEntry,
    private readonly palette: Palette,
    /** Staggers cabinets so they do not all flip pages in unison. */
    private readonly offset: number,
  ) {
    this.texture = paint(W * RES, H * RES, () => {});
    this.ctx = (this.texture.image as HTMLCanvasElement).getContext("2d");
  }

  setThumbnail(image: HTMLImageElement): void {
    this.thumbnail = image;
    this.shown = "";
  }

  setScores(scores: Scores): void {
    this.scores = scores;
    this.shown = ""; // force a repaint
  }

  update(time: number): void {
    let t = (time + this.offset) % CYCLE;
    let page: Page = "title";
    for (const p of PAGES) {
      if (t < p.secs) {
        page = p.page;
        break;
      }
      t -= p.secs;
    }
    const blink = Math.floor(time * 2) % 2 === 0;
    const key = `${page}:${blink}`;
    if (key === this.shown) return;
    this.shown = key;
    this.draw(page, blink);
    this.texture.needsUpdate = true;
  }

  private draw(page: Page, blink: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.fillStyle = "#05030d";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (page === "title") this.title(ctx, blink);
    else if (page === "scores") this.highScores(ctx);
    else this.insertCoin(ctx, blink);

    this.crt(ctx);
  }

  private text(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, colour: string, x = W / 2): void {
    ctx.font = `bold ${size}px ${PIXEL_FONT}`;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y, W - 24);
    ctx.shadowBlur = 0;
  }

  private title(ctx: CanvasRenderingContext2D, blink: boolean): void {
    const shot = this.thumbnail;
    if (!shot) {
      this.text(ctx, this.game.title.toUpperCase(), 92, 34, this.palette.secondary);
      this.text(ctx, `${this.game.occasion.toUpperCase()} ${this.game.year}`, 132, 18, this.palette.primary);
      if (blink) this.text(ctx, "PRESS START", 196, 18, "#ffffff");
      return;
    }
    // Gameplay, cropped to fill the tube, with the title over it like a demo loop.
    const scale = Math.max(W / shot.naturalWidth, H / shot.naturalHeight);
    const w = shot.naturalWidth * scale;
    const h = shot.naturalHeight * scale;
    ctx.drawImage(shot, (W - w) / 2, (H - h) / 2, w, h);
    const band = ctx.createLinearGradient(0, 0, 0, 64);
    band.addColorStop(0, "rgba(5,3,13,0.85)");
    band.addColorStop(1, "rgba(5,3,13,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 64);
    this.text(ctx, this.game.title.toUpperCase(), 26, 24, this.palette.secondary);
    if (blink) {
      ctx.fillStyle = "rgba(5,3,13,0.6)";
      ctx.fillRect(W / 2 - 80, 198, 160, 26);
      this.text(ctx, "PRESS START", 211, 16, "#ffffff");
    }
  }

  private highScores(ctx: CanvasRenderingContext2D): void {
    this.text(ctx, "HIGH SCORES", 40, 24, this.palette.secondary);
    const s = this.scores;
    if (s.state !== "ready") {
      this.text(ctx, s.state === "loading" ? "LOADING..." : "SCORES OFFLINE", 128, 18, "#9a90b8");
      return;
    }
    if (s.top.length === 0) {
      this.text(ctx, "NO SCORES YET", 120, 18, "#ffffff");
      this.text(ctx, "BE THE FIRST!", 150, 16, this.palette.primary);
      return;
    }
    s.top.slice(0, 3).forEach((entry, i) => {
      const y = 92 + i * 44;
      const colour = i === 0 ? this.palette.secondary : "#ffffff";
      ctx.textAlign = "left";
      this.text(ctx, ORDINALS[i], y, 18, this.palette.primary, 20);
      this.text(ctx, entry.display_name.slice(0, 10).toUpperCase(), y, 18, colour, 74);
      ctx.textAlign = "right";
      this.text(ctx, entry.points.toLocaleString("en-US"), y, 18, colour, W - 20);
      ctx.textAlign = "center";
    });
  }

  private insertCoin(ctx: CanvasRenderingContext2D, blink: boolean): void {
    if (blink) this.text(ctx, "INSERT COIN", 110, 30, this.palette.secondary);
    this.text(ctx, "1 CREDIT = 1 GAME", 170, 14, "#9a90b8");
  }

  /** Scanlines and a dark vignette, so it reads as glass rather than a flat panel. */
  private crt(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}
