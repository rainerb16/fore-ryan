// Each level gets its own sky and its own hazards. The canvas itself is
// transparent — the backdrop is a stack of gradients on #stage driven by custom
// properties — so a theme is a set of colours, the four bits of corner scenery,
// and the glyphs the two hazard slots are drawn as.
//
// Reskinning a hazard changes nothing about how it behaves: the type still
// drives spawn weighting and collision, and the server never sees any of this.

import { AUTHORED_LEVELS, type HazardType } from "../../shared/rules";
import { decorEls, stage } from "../ui/dom";

interface HazardLook {
  /** What gets drawn. Keep it chunky — players have to dodge it. */
  glyph: string;
  /** Colour of the sparks thrown when it blocks a shot or lands a hit. */
  spark: string;
}

export interface Theme {
  /** Top-left and top-right glows. */
  glowA: string;
  glowB: string;
  /** The wash rising from below the horizon. */
  ground: string;
  skyTop: string;
  skyMid: string;
  skyDeep: string;
  skyBase: string;
  /** Canvas fairway band, transparent at the top. */
  fairwayTop: string;
  fairwayBottom: string;
  decor: readonly [string, string, string, string];
  hazards: Record<HazardType, HazardLook>;
}

/** Level 1 is the birthday round, so its look is the original one, untouched. */
const DRIVING_RANGE: Theme = {
  glowA: "rgba(167,139,250,.22)",
  glowB: "rgba(255,111,163,.18)",
  ground: "rgba(34,120,80,.34)",
  skyTop: "#140b33",
  skyMid: "#1d1046",
  skyDeep: "#2a1450",
  skyBase: "#14092c",
  fairwayTop: "rgba(38,120,84,0)",
  fairwayBottom: "rgba(46,142,96,.26)",
  decor: ["⛳", "🎈", "🏌️", "🎈"],
  hazards: {
    water: { glyph: "💧", spark: "#7fd4ff" },
    tree: { glyph: "🌳", spark: "#8fd18a" },
  },
};

const FRONT_NINE: Theme = {
  glowA: "rgba(255,196,120,.26)",
  glowB: "rgba(255,140,160,.20)",
  ground: "rgba(60,150,90,.34)",
  skyTop: "#2a1638",
  skyMid: "#3d1f45",
  skyDeep: "#4a2740",
  skyBase: "#1b0f2b",
  fairwayTop: "rgba(60,150,96,0)",
  fairwayBottom: "rgba(86,176,110,.28)",
  decor: ["⛳", "🌅", "🏌️", "🎈"],
  hazards: {
    // Deliberately not the level 1 droplet — the first level change should be
    // unmistakable, and 💦 next to 💧 is not.
    water: { glyph: "🌧️", spark: "#9fd8ff" },
    tree: { glyph: "🌾", spark: "#d9c86a" },
  },
};

const WATER_HAZARD: Theme = {
  glowA: "rgba(80,190,235,.26)",
  glowB: "rgba(120,150,255,.20)",
  ground: "rgba(30,120,150,.38)",
  skyTop: "#06213a",
  skyMid: "#0a2f4e",
  skyDeep: "#0d3a56",
  skyBase: "#04182c",
  fairwayTop: "rgba(40,150,170,0)",
  fairwayBottom: "rgba(60,180,200,.28)",
  decor: ["💧", "🌊", "⛳", "🐟"],
  hazards: {
    water: { glyph: "🌊", spark: "#7fd4ff" },
    tree: { glyph: "🦆", spark: "#e0b070" },
  },
};

const THE_WOODS: Theme = {
  glowA: "rgba(120,200,120,.20)",
  glowB: "rgba(90,160,110,.18)",
  ground: "rgba(24,90,50,.44)",
  skyTop: "#0c2015",
  skyMid: "#102c1c",
  skyDeep: "#143521",
  skyBase: "#071409",
  fairwayTop: "rgba(30,110,60,0)",
  fairwayBottom: "rgba(48,140,80,.30)",
  decor: ["🌲", "🌳", "⛳", "🦌"],
  hazards: {
    water: { glyph: "🍂", spark: "#e09a5a" },
    tree: { glyph: "🌲", spark: "#6fbf7f" },
  },
};

const CHAMPIONSHIP: Theme = {
  glowA: "rgba(255,209,102,.24)",
  glowB: "rgba(167,139,250,.22)",
  ground: "rgba(70,60,140,.36)",
  skyTop: "#1a0f2e",
  skyMid: "#2b1550",
  skyDeep: "#3a1a5c",
  skyBase: "#120829",
  fairwayTop: "rgba(90,80,160,0)",
  fairwayBottom: "rgba(120,105,190,.26)",
  decor: ["🏆", "⛳", "🎖️", "🎉"],
  hazards: {
    // Errant golfers and marker flags, on a course that has stopped being polite.
    water: { glyph: "🏌️", spark: "#ffd166" },
    tree: { glyph: "🚩", spark: "#ff8080" },
  },
};

// Past the authored levels the tail alternates between these two, matching the
// way its hazard mix alternates, so consecutive Sudden Death levels still read
// as different places.
const SUDDEN_DEATH_NIGHT: Theme = {
  glowA: "rgba(120,140,255,.22)",
  glowB: "rgba(180,120,255,.20)",
  ground: "rgba(30,40,90,.40)",
  skyTop: "#05060f",
  skyMid: "#0a0d1f",
  skyDeep: "#0e1230",
  skyBase: "#03040a",
  fairwayTop: "rgba(60,70,140,0)",
  fairwayBottom: "rgba(80,95,170,.26)",
  decor: ["🌙", "⛳", "⭐", "🌙"],
  hazards: {
    water: { glyph: "❄️", spark: "#bfe6ff" },
    tree: { glyph: "⭐", spark: "#ffe9a3" },
  },
};

const SUDDEN_DEATH_FIRE: Theme = {
  glowA: "rgba(255,90,90,.26)",
  glowB: "rgba(255,150,60,.20)",
  ground: "rgba(120,30,40,.42)",
  skyTop: "#2a0810",
  skyMid: "#3c0d16",
  skyDeep: "#4a1018",
  skyBase: "#170408",
  fairwayTop: "rgba(150,50,60,0)",
  fairwayBottom: "rgba(190,70,80,.26)",
  decor: ["🔥", "⛳", "💀", "🔥"],
  hazards: {
    water: { glyph: "☄️", spark: "#ffcf7a" },
    tree: { glyph: "🌋", spark: "#ff7a4d" },
  },
};

const AUTHORED_THEMES: readonly Theme[] = [
  DRIVING_RANGE,
  FRONT_NINE,
  WATER_HAZARD,
  THE_WOODS,
  CHAMPIONSHIP,
];

export function themeFor(level: number): Theme {
  const authored = AUTHORED_THEMES[level - 1];
  if (authored) return authored;
  const t = level - AUTHORED_LEVELS.length;
  return t % 2 === 1 ? SUDDEN_DEATH_NIGHT : SUDDEN_DEATH_FIRE;
}

/** Read by the renderer and the collision code. Reassigned by applyTheme. */
export let activeTheme: Theme = DRIVING_RANGE;

export const hazardGlyph = (type: HazardType): string => activeTheme.hazards[type].glyph;
export const hazardSpark = (type: HazardType): string => activeTheme.hazards[type].spark;

export function applyTheme(level: number): void {
  const theme = themeFor(level);
  activeTheme = theme;

  stage.style.setProperty("--glow-a", theme.glowA);
  stage.style.setProperty("--glow-b", theme.glowB);
  stage.style.setProperty("--ground", theme.ground);
  stage.style.setProperty("--sky-top", theme.skyTop);
  stage.style.setProperty("--sky-mid", theme.skyMid);
  stage.style.setProperty("--sky-deep", theme.skyDeep);
  stage.style.setProperty("--sky-base", theme.skyBase);

  decorEls.forEach((el, i) => {
    el.textContent = theme.decor[i] ?? "";
  });
}
