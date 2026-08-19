// Single entry point so esbuild can bundle shared/ for the Node test runner.
export { AUTHORED_LEVELS, BIRTHDAY_LIVES, CONTEST_LIVES, levelConfig, SHOT_COOLDOWN } from "../shared/rules";
export { SCORING, minLevelMs, runTotal, scoreLevel, validateRun } from "../shared/scoring";
