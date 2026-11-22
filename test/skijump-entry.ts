// Single entry so the jump's rules and the game's step clock come from one bundle.
export * from "../games/christmas-2026/rules";
export { createStepClock } from "../games/christmas-2026/src/clock";
export { createPressQueue } from "../games/christmas-2026/src/input";
