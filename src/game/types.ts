import type { HazardType } from "./config";

export interface Player {
  x: number;
  y: number;
  targetX: number | null;
  lean: number;
  spinT: number;
  spinDir: number;
}

export interface Shot {
  x: number;
  y: number;
  vy: number;
  r: number;
  rot: number;
  spin: number;
}

export interface Hazard {
  type: HazardType;
  size: number;
  r: number;
  x: number;
  y: number;
  vy: number;
  vx: number;
  rot: number;
  spin: number;
}

export interface Hole {
  index: number;
  x: number;
  y: number;
  vx: number;
  respawn: number;
}

export interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  spin: number;
  color: string;
  life: number;
  rain?: boolean;
}

export interface Spark {
  x: number;
  y: number;
  color: string;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
}

export interface HeadOpts {
  party?: boolean;
  dizzy?: boolean;
  lean?: number;
  rotate?: number;
  club?: boolean;
}

export interface SrcRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
