import { draw } from "../render/scene";
import { update } from "./update";

let last = 0;

function frame(ts: number): void {
  if (!last) last = ts;
  const dt = Math.min(0.033, (ts - last) / 1000);
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

export function startLoop(): void {
  requestAnimationFrame(frame);
}
