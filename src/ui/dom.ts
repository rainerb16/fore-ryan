const need = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export const canvas = need<HTMLCanvasElement>("game");
export const ctx = canvas.getContext("2d")!;
export const hud = need("hud");
export const scoreEl = need("score");
export const livesEl = need("lives");
export const muteBtn = need<HTMLButtonElement>("muteBtn");
export const startScreen = need("startScreen");
export const winScreen = need("winScreen");
export const loseScreen = need("loseScreen");
export const winStats = need("winStats");
export const loseStats = need("loseStats");
export const startHint = need("startHint");
export const startBtn = need<HTMLButtonElement>("startBtn");
export const winBtn = need<HTMLButtonElement>("winBtn");
export const loseBtn = need<HTMLButtonElement>("loseBtn");
