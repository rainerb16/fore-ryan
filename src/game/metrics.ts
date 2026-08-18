import { HEAD_GROW } from "./config";
import { headAspect } from "./images";
import { game, player } from "./state";

// Head grows as holes are sunk.
export const headRadius = (): number => game.baseHeadR * (1 + HEAD_GROW * game.score);
export const headHalfH = (): number => headRadius() * headAspect;
export const groundY = (): number => game.H - headHalfH() - 26;

export const holeRX = (): number => 42 * game.scale;

export function clampPlayer(): void {
  const r = headRadius();
  player.x = Math.max(r, Math.min(game.W - r, player.x));
  player.y = groundY();
}
