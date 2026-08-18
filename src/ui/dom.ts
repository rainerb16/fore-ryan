const need = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export const canvas = need<HTMLCanvasElement>("game");
export const ctx = canvas.getContext("2d")!;

export const hud = need("hud");
export const levelEl = need("level");
export const scoreEl = need("score");
export const pointsEl = need("points");
export const livesEl = need("lives");
export const muteBtn = need<HTMLButtonElement>("muteBtn");

export const bannerEl = need("banner");
export const bannerTitle = need("bannerTitle");
export const bannerSub = need("bannerSub");

export const startScreen = need("startScreen");
export const winScreen = need("winScreen");
export const loseScreen = need("loseScreen");
export const runScreen = need("runScreen");

export const winStats = need("winStats");
export const loseStats = need("loseStats");
export const runStats = need("runStats");
export const runHeadline = need("runHeadline");
export const runBreakdown = need("runBreakdown");

export const startHint = need("startHint");
export const startBtn = need<HTMLButtonElement>("startBtn");
export const contestBtn = need<HTMLButtonElement>("contestBtn");
export const winBtn = need<HTMLButtonElement>("winBtn");
export const loseBtn = need<HTMLButtonElement>("loseBtn");
export const runAgainBtn = need<HTMLButtonElement>("runAgainBtn");
export const runHomeBtn = need<HTMLButtonElement>("runHomeBtn");
