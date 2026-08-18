// --- assets -----------------------------------------------------------------
// To use a different photo: point HEAD_IMAGE_SRC at it and set HEAD_TRIM to null.
export const HEAD_IMAGE_SRC = "assets/ryan-head-floating.png";
export const HEAD_PARTY_IMAGE_SRC = "";

// Bounds of the head inside the PNG's transparent margins, as fractions.
export const HEAD_TRIM: { x: number; y: number; w: number; h: number } | null =
  { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };

// --- tuning -----------------------------------------------------------------
export const HOLES_TO_WIN = 5;
export const START_LIVES = 3;

export const HEAD_R = 62;          // half-width at full scale
export const HEAD_GROW = 0.06;     // head gets this much bigger per hole sunk
export const HITBOX_SCALE = 0.78;
export const KEY_SPEED = 620;

export const SHOT_SPEED = 780;     // px/sec at a 720px-tall canvas
export const SHOT_COOLDOWN = 320;
export const SHOT_R = 11;

export const HOLE_COUNT = 2;
export const HOLE_SPEED_MIN = 95;
export const HOLE_SPEED_MAX = 160;
export const HOLE_RESPAWN_MS = 600;

export const SPAWN_MIN_MS = 560;
export const SPAWN_MAX_MS = 900;
export const SPAWN_FLOOR_MS = 380;
export const HAZARD_FALL = 305;    // px/sec at a 720px-tall canvas

export const SPEED_CAP = 1.8;
export const RAMP_EVERY_MS = 12000;
export const RAMP_SPEED_STEP = 1.08;
export const RAMP_SPAWN_STEP = 0.94;

export const INVULN_MS = 750;
export const SHAKE_MS = 200;
export const SPIN_MS = 700;
export const FINALE_MS = 750;      // slow-motion beat on the winning shot
export const FINALE_SLOW = 0.25;

export const HAZARDS = ["water", "tree"] as const;
export const HAZARD_EMOJI: Record<HazardType, string> = { water: "💧", tree: "🌳" };
export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
export const CONFETTI_COLORS = ["#ff6fa3", "#a78bfa", "#ffd166", "#4ecdc4", "#ff9f68", "#ffffff"];

export const STATE = { START: 0, PLAYING: 1, WIN: 2, LOSE: 3 } as const;

export type HazardType = (typeof HAZARDS)[number];
export type GameState = (typeof STATE)[keyof typeof STATE];
