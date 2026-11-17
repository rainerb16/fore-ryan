import { EMOJI_FONT } from "../game/config";
import { headImg, partyImg, srcRect } from "../game/images";
import { holeRX } from "../game/metrics";
import { game } from "../game/state";
import type { HeadOpts, Hole } from "../game/types";

type C = CanvasRenderingContext2D;

export function drawGolfBall(c: C, cx: number, cy: number, r: number, rot: number): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(rot || 0);

  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.65, "#eef1f5");
  g.addColorStop(1, "#b9c2cf");
  c.fillStyle = g;
  c.shadowColor = "rgba(255,255,255,.4)";
  c.shadowBlur = r * 0.8;
  c.fill();
  c.shadowBlur = 0;

  c.fillStyle = "rgba(140,152,170,.45)";
  const dimples = [[-0.42, -0.1], [-0.1, -0.44], [0.26, -0.28], [0.44, 0.1], [0.12, 0.42], [-0.26, 0.34]];
  for (const [dx, dy] of dimples) {
    c.beginPath();
    c.arc(dx * r, dy * r, r * 0.11, 0, Math.PI * 2);
    c.fill();
  }

  c.restore();
}

export function drawHole(c: C, hole: Hole): void {
  if (hole.respawn > 0) return;

  const rx = holeRX();
  const ry = 15 * game.scale;

  c.save();
  c.translate(hole.x, hole.y);

  // putting green
  c.beginPath();
  c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  const g = c.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, "#4bbd7a");
  g.addColorStop(1, "#217a4c");
  c.fillStyle = g;
  c.shadowColor = "rgba(75,189,122,.55)";
  c.shadowBlur = 16 * game.scale;
  c.fill();
  c.shadowBlur = 0;

  // cup
  c.beginPath();
  c.ellipse(0, -ry * 0.05, rx * 0.34, ry * 0.42, 0, 0, Math.PI * 2);
  c.fillStyle = "#10221a";
  c.fill();

  // pin and flag
  const pinH = 50 * game.scale;
  c.fillStyle = "#e8ecf2";
  c.fillRect(-1.4 * game.scale, -pinH, 2.8 * game.scale, pinH);

  c.beginPath();
  c.moveTo(1.4 * game.scale, -pinH);
  c.lineTo(24 * game.scale, -pinH + 9 * game.scale);
  c.lineTo(1.4 * game.scale, -pinH + 18 * game.scale);
  c.closePath();
  c.fillStyle = "#ff6fa3";
  c.fill();

  c.restore();
}

function drawClub(c: C, r: number, lean: number | undefined): void {
  c.save();
  c.rotate(0.52 + (lean || 0) * 0.22);

  const shaftW = r * 0.115;
  const top = -r * 2.05;
  const bottom = r * 1.55;

  const g = c.createLinearGradient(-shaftW, 0, shaftW, 0);
  g.addColorStop(0, "#8a94a6");
  g.addColorStop(0.45, "#e9edf3");
  g.addColorStop(1, "#78829a");
  c.fillStyle = g;
  c.fillRect(-shaftW / 2, top, shaftW, bottom - top);

  c.fillStyle = "#241a33";
  c.fillRect(-shaftW * 0.78, top, shaftW * 1.56, r * 0.78);

  c.save();
  c.translate(0, bottom);
  c.beginPath();
  c.moveTo(-r * 0.1, -r * 0.1);
  c.lineTo(-r * 0.78, r * 0.16);
  c.lineTo(-r * 0.74, r * 0.42);
  c.lineTo(r * 0.14, r * 0.3);
  c.closePath();
  const cg = c.createLinearGradient(-r * 0.78, 0, r * 0.14, r * 0.4);
  cg.addColorStop(0, "#dfe5ee");
  cg.addColorStop(1, "#9aa4b6");
  c.fillStyle = cg;
  c.fill();
  c.strokeStyle = "rgba(30,20,50,.45)";
  c.lineWidth = Math.max(1, r * 0.035);
  c.stroke();
  c.restore();

  c.restore();
}

function drawPartyHat(c: C, r: number, topY: number): void {
  const baseY = topY + r * 0.3;
  const halfW = r * 0.6;
  const tipY = baseY - r * 1.15;

  c.save();
  c.rotate(-0.16);

  c.beginPath();
  c.moveTo(-halfW, baseY);
  c.lineTo(halfW, baseY);
  c.lineTo(0, tipY);
  c.closePath();
  const g = c.createLinearGradient(-halfW, baseY, halfW, tipY);
  g.addColorStop(0, "#ff6fa3");
  g.addColorStop(1, "#a78bfa");
  c.fillStyle = g;
  c.fill();

  c.save();
  c.clip();
  c.strokeStyle = "rgba(255,209,102,.95)";
  c.lineWidth = r * 0.1;
  for (let i = 0; i < 4; i++) {
    const y = baseY - i * r * 0.29;
    c.beginPath();
    c.moveTo(-halfW * 1.4, y);
    c.lineTo(halfW * 1.4, y - r * 0.3);
    c.stroke();
  }
  c.restore();

  c.beginPath();
  c.ellipse(0, baseY, halfW * 1.03, r * 0.13, 0, 0, Math.PI * 2);
  c.fillStyle = "#ffd166";
  c.fill();

  c.beginPath();
  c.arc(0, tipY, r * 0.16, 0, Math.PI * 2);
  c.fillStyle = "#fff";
  c.fill();

  c.restore();
}

export function drawHead(c: C, cx: number, cy: number, r: number, opts: HeadOpts = {}): void {
  const img = opts.party && partyImg ? partyImg : headImg;

  c.save();
  c.translate(cx, cy);
  if (opts.rotate) c.rotate(opts.rotate);
  if (opts.club !== false) drawClub(c, r, opts.lean);

  let topY = -r;

  if (img) {
    const s = srcRect(img, img === headImg);
    const dw = r * 2;
    const dh = dw * (s.sh / s.sw);
    topY = -dh / 2;

    c.save();
    c.shadowColor = "rgba(178,152,255,.85)";
    c.shadowBlur = r * 0.42;
    c.drawImage(img, s.sx, s.sy, s.sw, s.sh, -dw / 2, topY, dw, dh);
    c.restore();
  } else {
    c.save();
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.shadowColor = "rgba(167,139,250,.55)";
    c.shadowBlur = r * 0.55;
    c.fillStyle = "#fff";
    c.fill();
    c.clip();
    c.shadowBlur = 0;
    const g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#ffd8a8");
    g.addColorStop(1, "#ffb877");
    c.fillStyle = g;
    c.fillRect(-r, -r, r * 2, r * 2);
    c.font = `${r * 1.15}px ${EMOJI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("🙂", 0, r * 0.06);
    c.restore();
  }

  if (opts.party && !partyImg) drawPartyHat(c, r, topY);

  if (opts.dizzy) {
    c.font = `${r * 0.5}px ${EMOJI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("💫", -r * 0.95, topY + r * 0.42);
    c.fillText("💫", r * 0.95, topY + r * 0.58);
  }

  c.restore();
}
