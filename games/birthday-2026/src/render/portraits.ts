import type { HeadOpts } from "../game/types";
import { drawHead } from "./shapes";

function drawPortrait(id: string, opts: HeadOpts, rFactor: number): void {
  const el = document.getElementById(id) as HTMLCanvasElement | null;
  if (!el) return;
  const c = el.getContext("2d")!;
  c.clearRect(0, 0, el.width, el.height);
  drawHead(c, el.width / 2, el.height * 0.6, el.width * rFactor, opts);
}

export function redrawPortraits(): void {
  drawPortrait("startPortrait", {}, 0.2);
  drawPortrait("winPortrait", { party: true }, 0.24);
  drawPortrait("losePortrait", { dizzy: true }, 0.2);
}
