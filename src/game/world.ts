import { updateHud } from "../ui/hud";
import { canvas, ctx } from "../ui/dom";
import { sfx } from "./audio";
import {
  CONFETTI_COLORS,
  HAZARDS,
  HAZARD_FALL,
  HEAD_R,
  HOLE_SPEED_MAX,
  HOLE_SPEED_MIN,
  SHOT_R,
  SHOT_SPEED,
} from "./config";
import { clampPlayer, headHalfH } from "./metrics";
import { pick, pickWeighted, rand } from "./rng";
import { confetti, game, hazards, holes, player, shots, sparks } from "./state";
import type { Hole } from "./types";

// --- viewport ---------------------------------------------------------------
export function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.W = canvas.clientWidth;
  game.H = canvas.clientHeight;
  canvas.width = Math.round(game.W * dpr);
  canvas.height = Math.round(game.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.scale = Math.max(0.62, Math.min(1.15, Math.min(game.W, game.H) / 620));
  game.baseHeadR = HEAD_R * game.scale;
  clampPlayer();
  layoutHoles();
}

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 120));

// --- holes ------------------------------------------------------------------
function holeY(i: number): number {
  return game.H * 0.17 + i * game.H * 0.11;
}

export function resetHole(hole: Hole, i: number): void {
  hole.y = holeY(i);
  hole.x = rand(game.W * 0.2, game.W * 0.8);
  hole.vx =
    rand(HOLE_SPEED_MIN, HOLE_SPEED_MAX) *
    (Math.random() < 0.5 ? -1 : 1) *
    game.scale *
    game.cfg.holeSpeedMult;
  hole.respawn = 0;
}

export function layoutHoles(): void {
  holes.length = 0;
  for (let i = 0; i < game.cfg.holeCount; i++) {
    const hole = { index: i } as Hole;
    resetHole(hole, i);
    holes.push(hole);
  }
}

// --- spawning ---------------------------------------------------------------
export function spawnHazard(): void {
  const type = pickWeighted(HAZARDS, game.cfg.hazardWeights);
  const size = 44 * game.scale;
  const r = size * 0.38;
  hazards.push({
    type,
    size,
    r,
    x: rand(r + 6, game.W - r - 6),
    y: -size - 10,
    vy:
      HAZARD_FALL *
      (game.H / 720) *
      game.cfg.hazardFallMult *
      game.speedMult *
      rand(0.9, 1.12),
    vx: rand(-18, 18),
    rot: rand(-0.4, 0.4),
    spin: rand(-1.6, 1.6),
  });
}

export function fire(): void {
  shots.push({
    x: player.x,
    y: player.y - headHalfH() * 0.85,
    vy: -SHOT_SPEED * (game.H / 720),
    r: SHOT_R * game.scale,
    rot: 0,
    spin: rand(-8, 8),
  });
  game.levelShots++;
  sfx.shoot();
}

export function addSparks(x: number, y: number, color: string, n = 9): void {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(70, 280) * game.scale;
    sparks.push({
      x,
      y,
      color,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: rand(2, 4.5) * game.scale,
      life: rand(0.25, 0.5),
      maxLife: 0.5,
    });
  }
}

export function burstConfetti(n: number, cx: number, cy: number, spread = 70): void {
  for (let i = 0; i < n; i++) {
    confetti.push({
      x: cx + rand(-spread, spread),
      y: cy + rand(-spread * 0.5, spread * 0.5),
      vx: rand(-320, 320),
      vy: rand(-620, -180),
      w: rand(7, 14) * game.scale,
      h: rand(10, 20) * game.scale,
      rot: rand(0, Math.PI * 2),
      spin: rand(-9, 9),
      color: pick(CONFETTI_COLORS),
      life: rand(2.4, 4.2),
    });
  }
}

export function rainConfetti(dt: number): void {
  game.rainTimer -= dt * 1000;
  if (game.rainTimer > 0 || confetti.length > 280) return;
  game.rainTimer = 55;
  for (let i = 0; i < 3; i++) {
    confetti.push({
      x: rand(0, game.W),
      y: -20,
      vx: rand(-40, 40),
      vy: rand(90, 200),
      w: rand(7, 14) * game.scale,
      h: rand(10, 20) * game.scale,
      rot: rand(0, Math.PI * 2),
      spin: rand(-6, 6),
      color: pick(CONFETTI_COLORS),
      life: 9,
      rain: true,
    });
  }
}

// --- board ------------------------------------------------------------------
/** Clear the board and re-centre the player. Run counters belong to progression.ts. */
export function reset(): void {
  shots.length = 0;
  hazards.length = 0;
  confetti.length = 0;
  sparks.length = 0;
  game.shotTimer = 0;
  game.invuln = 0;
  game.shake = 0;
  game.frozen = false;
  game.firing = false;
  game.dragging = false;
  game.finale = false;
  game.finaleT = 0;
  game.rainTimer = 0;
  player.x = game.W / 2;
  player.targetX = null;
  player.lean = 0;
  player.spinT = 0;
  clampPlayer();
  layoutHoles();
  updateHud();
}
