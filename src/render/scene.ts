import { EMOJI_FONT, FINALE_MS, SHAKE_MS, SPIN_MS, STATE } from "../game/config";
import { headRadius } from "../game/metrics";
import { rand } from "../game/rng";
import { confetti, game, hazards, holes, player, shots, sparks } from "../game/state";
import { ctx } from "../ui/dom";
import { drawGolfBall, drawHead, drawHole } from "./shapes";
import { activeTheme, hazardGlyph } from "./theme";

function drawFairway(): void {
  const bandH = Math.min(game.H * 0.28, 190 * game.scale);
  const g = ctx.createLinearGradient(0, game.H - bandH, 0, game.H);
  g.addColorStop(0, activeTheme.fairwayTop);
  g.addColorStop(1, activeTheme.fairwayBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, game.H - bandH, game.W, bandH);
}

export function draw(): void {
  ctx.clearRect(0, 0, game.W, game.H);
  drawFairway();

  ctx.save();
  if (game.shake > 0) {
    const k = game.shake / SHAKE_MS;
    ctx.translate(rand(-9, 9) * k, rand(-7, 7) * k);
  }

  for (const hole of holes) drawHole(ctx, hole);

  for (const s of shots) {
    const len = 34 * game.scale;
    const g = ctx.createLinearGradient(0, s.y, 0, s.y + len);
    g.addColorStop(0, "rgba(255,255,255,.42)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(s.x - s.r * 0.5, s.y, s.r, len);
    drawGolfBall(ctx, s.x, s.y, s.r, s.rot);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const h of hazards) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.font = `${h.size}px ${EMOJI_FONT}`;
    ctx.fillText(hazardGlyph(h.type), 0, 0);
    ctx.restore();
  }

  if (game.state !== STATE.START) {
    const blink = game.invuln > 0 && Math.floor(game.invuln / 80) % 2 === 0;
    ctx.globalAlpha = blink ? 0.42 : 1;

    let spinRot = 0;
    if (player.spinT > 0) {
      const t = 1 - player.spinT / SPIN_MS;
      spinRot = player.spinDir * Math.PI * 2 * (1 - Math.pow(1 - t, 3));
    }

    drawHead(ctx, player.x, player.y, headRadius(), {
      party: game.state === STATE.WIN,
      lean: player.lean,
      rotate: spinRot,
    });
    ctx.globalAlpha = 1;
  }

  for (const sp of sparks) {
    ctx.globalAlpha = Math.max(0, sp.life / sp.maxLife);
    ctx.fillStyle = sp.color;
    ctx.fillRect(sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size);
  }
  ctx.globalAlpha = 1;

  for (const p of confetti) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (game.finale) {
    ctx.globalAlpha = 0.85 * (game.finaleT / FINALE_MS);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, game.W, game.H);
    ctx.globalAlpha = 1;
  }
}
