import { endLose, endWin } from "../ui/screens";
import { updateHud } from "../ui/hud";
import { sfx } from "./audio";
import {
  FINALE_MS,
  FINALE_SLOW,
  HITBOX_SCALE,
  HOLES_TO_WIN,
  HOLE_RESPAWN_MS,
  INVULN_MS,
  KEY_SPEED,
  RAMP_EVERY_MS,
  RAMP_SPAWN_STEP,
  RAMP_SPEED_STEP,
  SHAKE_MS,
  SHOT_COOLDOWN,
  SPAWN_FLOOR_MS,
  SPAWN_MAX_MS,
  SPAWN_MIN_MS,
  SPEED_CAP,
  SPIN_MS,
  STATE,
} from "./config";
import { clampPlayer, headHalfH, headRadius, holeRX } from "./metrics";
import { rand } from "./rng";
import { confetti, game, hazards, holes, keys, player, shots, sparks } from "./state";
import type { Hole } from "./types";
import { addSparks, burstConfetti, fire, rainConfetti, resetHole, spawnHazard } from "./world";

function updatePlayer(dt: number): void {
  const prevX = player.x;

  if (player.targetX !== null) {
    player.x += (player.targetX - player.x) * Math.min(1, dt * 18);
  }
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (dir !== 0) player.x += dir * KEY_SPEED * dt;
  clampPlayer();

  const vel = (player.x - prevX) / Math.max(dt, 0.0001);
  const targetLean = Math.max(-1, Math.min(1, vel / 700));
  player.lean += (targetLean - player.lean) * Math.min(1, dt * 9);
}

function sinkHole(hole: Hole): void {
  hole.respawn = HOLE_RESPAWN_MS;
  game.score++;
  sfx.sink();
  burstConfetti(26, hole.x, hole.y, 26);
  updateHud();
  clampPlayer();
}

/** Returns true when the winning hole was sunk. */
function updateShots(dt: number): boolean {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    const prevY = s.y;
    s.y += s.vy * dt;
    s.rot += s.spin * dt;

    if (s.y + s.r < -10) {
      shots.splice(i, 1);
      continue;
    }

    // hole: swept check, since a fast shot can pass the cup between frames
    let consumed = false;
    for (const hole of holes) {
      if (hole.respawn > 0) continue;
      if (prevY >= hole.y && s.y <= hole.y && Math.abs(s.x - hole.x) <= holeRX() * 0.8) {
        sinkHole(hole);
        shots.splice(i, 1);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      if (game.score >= HOLES_TO_WIN) return true;
      continue;
    }

    // hazards block shots; test the midpoint too so fast shots can't tunnel through
    for (const h of hazards) {
      const midY = (prevY + s.y) / 2;
      const rr = h.r + s.r;
      const dx = h.x - s.x;
      const hit =
        dx * dx + (h.y - s.y) ** 2 <= rr * rr || dx * dx + (h.y - midY) ** 2 <= rr * rr;
      if (hit) {
        shots.splice(i, 1);
        addSparks(s.x, s.y, h.type === "water" ? "#7fd4ff" : "#8fd18a");
        sfx.block();
        break;
      }
    }
  }
  return false;
}

/** Returns true when the last life was lost. */
function updateHazards(dt: number): boolean {
  const rx = headRadius() * HITBOX_SCALE;
  const ry = headHalfH() * HITBOX_SCALE;

  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.y += h.vy * dt;
    h.x += h.vx * dt;
    h.rot += h.spin * dt;

    if (h.x < h.r) {
      h.x = h.r;
      h.vx *= -1;
    }
    if (h.x > game.W - h.r) {
      h.x = game.W - h.r;
      h.vx *= -1;
    }
    if (h.y - h.r > game.H + 20) {
      hazards.splice(i, 1);
      continue;
    }

    if (game.invuln > 0) continue;

    const nx = (h.x - player.x) / (rx + h.r);
    const ny = (h.y - player.y) / (ry + h.r);
    if (nx * nx + ny * ny <= 1) {
      hazards.splice(i, 1);
      game.lives--;
      game.invuln = INVULN_MS;
      game.shake = SHAKE_MS;
      player.spinT = SPIN_MS;
      player.spinDir = Math.random() < 0.5 ? -1 : 1;
      addSparks(h.x, h.y, h.type === "water" ? "#7fd4ff" : "#8fd18a", 14);
      sfx.hit();
      updateHud();
      if (game.lives <= 0) return true;
    }
  }
  return false;
}

function startFinale(): void {
  game.finale = true;
  game.finaleT = FINALE_MS;
  game.firing = false;
  game.invuln = FINALE_MS + 400;
}

export function update(dt: number): void {
  if (game.finale) {
    game.finaleT -= dt * 1000;
    if (game.finaleT <= 0) {
      game.finale = false;
      endWin();
    } else {
      dt *= FINALE_SLOW;
    }
  }

  if (game.state === STATE.PLAYING) updatePlayer(dt);

  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 1000);
  if (game.invuln > 0) game.invuln = Math.max(0, game.invuln - dt * 1000);
  if (player.spinT > 0) player.spinT = Math.max(0, player.spinT - dt * 1000);

  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.vy += (p.rain ? 55 : 900) * dt;
    p.vx *= 0.995;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > game.H + 60) confetti.splice(i, 1);
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const sp = sparks[i];
    sp.vy += 620 * dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.life -= dt;
    if (sp.life <= 0) sparks.splice(i, 1);
  }

  if (game.state === STATE.WIN) rainConfetti(dt);

  if (game.state !== STATE.PLAYING || game.frozen) return;

  game.elapsed += dt * 1000;

  game.rampTimer += dt * 1000;
  if (game.rampTimer >= RAMP_EVERY_MS) {
    game.rampTimer -= RAMP_EVERY_MS;
    game.speedMult = Math.min(SPEED_CAP, game.speedMult * RAMP_SPEED_STEP);
    game.spawnMult = Math.max(SPAWN_FLOOR_MS / SPAWN_MAX_MS, game.spawnMult * RAMP_SPAWN_STEP);
  }

  game.spawnTimer += dt * 1000;
  if (game.spawnTimer >= game.nextSpawn) {
    game.spawnTimer = 0;
    game.nextSpawn = Math.max(SPAWN_FLOOR_MS, rand(SPAWN_MIN_MS, SPAWN_MAX_MS) * game.spawnMult);
    spawnHazard();
  }

  game.shotTimer -= dt * 1000;
  if (game.firing && game.shotTimer <= 0) {
    fire();
    game.shotTimer = SHOT_COOLDOWN;
  }

  for (const hole of holes) {
    if (hole.respawn > 0) {
      hole.respawn -= dt * 1000;
      if (hole.respawn <= 0) resetHole(hole, hole.index);
      continue;
    }
    hole.x += hole.vx * dt * game.speedMult;
    const rx = holeRX();
    if (hole.x < rx) {
      hole.x = rx;
      hole.vx *= -1;
    }
    if (hole.x > game.W - rx) {
      hole.x = game.W - rx;
      hole.vx *= -1;
    }
  }

  if (updateShots(dt)) {
    startFinale();
    return;
  }
  if (updateHazards(dt)) {
    endLose();
    return;
  }
}
