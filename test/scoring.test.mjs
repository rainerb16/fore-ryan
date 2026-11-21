// Tests the shared/ rules — the formula the leaderboard ranks on and the gate the
// server will run submissions through. esbuild compiles the TypeScript to a temp
// bundle so Node can import it directly.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "fore-ryan-"));
const outfile = join(dir, "shared.mjs");
await build({
  entryPoints: ["test/shared-entry.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "warning",
});
const { SCORING, levelConfig, scoreLevel, runTotal, validateRun, implausible, AUTHORED_LEVELS } = await import(
  `file://${outfile}`
);

after(() => rmSync(dir, { recursive: true, force: true }));

const clearedL1 = { level: 1, holes: 5, shots: 20, durationMs: 20000, livesLost: 0 };
const clearedL2 = { level: 2, holes: 6, shots: 26, durationMs: 30000, livesLost: 1 };
const diedL3 = { level: 3, holes: 3, shots: 18, durationMs: 22000, livesLost: 2 };

test("a flawless, under-par level pays every bonus", () => {
  const s = scoreLevel(clearedL1);
  assert.equal(s.holes, 5 * SCORING.holeBase * 1);
  assert.equal(s.clear, SCORING.levelClear * 1);
  assert.equal(s.flawless, SCORING.flawlessBonus * 1);
  assert.equal(s.speed, 10 * SCORING.speedPerSecond * 1); // 10s under a 30s par
  assert.equal(s.total, 1500);
});

test("losing a life forfeits only the flawless bonus", () => {
  const s = scoreLevel(clearedL2);
  assert.equal(s.flawless, 0);
  assert.ok(s.clear > 0 && s.speed > 0);
});

test("clearing a deep level is worth far more than clearing a shallow one", () => {
  const shallow = scoreLevel(clearedL1);
  // Level 5 needs 9 holes, not 5 — a 5-hole level 5 would not be a clear at all.
  const deep = scoreLevel({ level: 5, holes: 9, shots: 30, durationMs: 20000, livesLost: 0 });
  assert.ok(deep.total > shallow.total * 4, ` vs `);
});

test("a level you died on still pays for progress, but no bonuses", () => {
  const s = scoreLevel(diedL3);
  assert.equal(s.holes, 3 * SCORING.holeBase * 3);
  assert.equal(s.clear, 0);
  assert.equal(s.flawless, 0);
  assert.equal(s.speed, 0);
});

test("clearing exactly at par earns no speed bonus", () => {
  const cfg = levelConfig(1);
  const s = scoreLevel({ ...clearedL1, durationMs: cfg.parMs });
  assert.equal(s.speed, 0);
});

test("runTotal is the sum of its levels", () => {
  const levels = [clearedL1, clearedL2, diedL3];
  assert.equal(runTotal(levels), levels.reduce((n, s) => n + scoreLevel(s).total, 0));
});

// --- the endless tail -------------------------------------------------------

test("levels past the authored set are generated and stay coherent", () => {
  const last = AUTHORED_LEVELS[AUTHORED_LEVELS.length - 1];
  for (const n of [6, 12, 40, 500]) {
    const cfg = levelConfig(n);
    assert.equal(cfg.level, n);
    assert.ok(cfg.holesToClear >= last.holesToClear && cfg.holesToClear <= 12);
    assert.ok(cfg.hazardSpawnMinMs < cfg.hazardSpawnMaxMs, "the spawn window stays open");
    assert.ok(cfg.hazardSpawnMinMs > 0 && cfg.parMs > 0);
    // Safety rails, not difficulty caps: past these a hazard could fall further
    // than the player's own height between frames and pass through unnoticed.
    assert.ok(cfg.holeSpeedMult <= 8);
    assert.ok(cfg.hazardFallMult <= 6);
  }
});

test("difficulty never eases going deeper", () => {
  for (let n = 5; n < 200; n++) {
    const a = levelConfig(n);
    const b = levelConfig(n + 1);
    assert.ok(b.holeSpeedMult >= a.holeSpeedMult, `level ${n + 1} hole speed`);
    assert.ok(b.hazardSpawnMaxMs <= a.hazardSpawnMaxMs, `level ${n + 1} spawn gap`);
    assert.ok(b.hazardFallMult >= a.hazardFallMult, `level ${n + 1} fall speed`);
  }
});

test("difficulty keeps climbing past the old plateau, so a run always ends", () => {
  // The tail used to flatten out around level 15, which made a contest run an
  // endurance test. Every axis must still be tightening well beyond that.
  const at15 = levelConfig(15);
  const at30 = levelConfig(30);
  assert.ok(at30.holeSpeedMult > at15.holeSpeedMult * 1.4, "holes keep getting faster");
  assert.ok(at30.hazardSpawnMaxMs < at15.hazardSpawnMaxMs * 0.7, "hazards keep getting denser");
  assert.ok(at30.hazardFallMult > at15.hazardFallMult * 1.3, "hazards keep falling faster");
});

// --- validation -------------------------------------------------------------

const summaryOf = (levels, over = {}) => ({
  levelReached: levels[levels.length - 1].level,
  levelsCleared: levels.filter((s) => s.holes >= levelConfig(s.level).holesToClear).length,
  points: runTotal(levels),
  durationMs: levels.reduce((n, s) => n + s.durationMs, 0),
  shotsFired: levels.reduce((n, s) => n + s.shots, 0),
  holesSunk: levels.reduce((n, s) => n + s.holes, 0),
  levels,
  ...over,
});

test("an honest run validates", () => {
  const res = validateRun(summaryOf([clearedL1, clearedL2, diedL3]));
  assert.deepEqual(res.reasons, []);
  assert.ok(res.ok);
});

test("the claimed score is ignored — the server recomputes it", () => {
  const honest = summaryOf([clearedL1, clearedL2, diedL3]);
  const inflated = { ...honest, points: 99999999 };
  const res = validateRun(inflated);
  assert.ok(res.ok, "inflating the score alone is not itself a validation failure");
  assert.equal(res.computedPoints, honest.points);
  assert.notEqual(res.computedPoints, inflated.points);
});

test("a level you died on moments after it started is not impossible", () => {
  // Dying seconds into a level is the normal way a contest run ends, and it gets
  // more common the deeper you go. The speed floor only applies to holes that
  // were actually sunk.
  const levels = [
    clearedL1,
    clearedL2,
    { level: 3, holes: 0, shots: 2, durationMs: 700, livesLost: 3 },
  ];
  const res = validateRun(summaryOf(levels));
  assert.deepEqual(res.reasons, [], "an ordinary quick death must validate");
});

test("rejects a level cleared faster than the fire rate allows", () => {
  const res = validateRun(summaryOf([{ ...clearedL1, durationMs: 500, shots: 5 }]));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /faster than possible/);
});

test("rejects more holes than shots", () => {
  const res = validateRun(summaryOf([{ ...clearedL1, shots: 2 }]));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /more holes than shots/);
});

test("rejects an impossible fire rate", () => {
  const res = validateRun(summaryOf([{ ...clearedL1, shots: 5000 }]));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /fire rate exceeded/);
});

test("rejects advancing past a level that was never cleared", () => {
  const res = validateRun(summaryOf([{ ...clearedL1, holes: 2 }, clearedL2]));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /advanced without clearing/);
});

test("rejects more holes than the level contains", () => {
  const res = validateRun(summaryOf([{ ...clearedL1, holes: 40, shots: 60 }]));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /hole count out of range/);
});

test("rejects surviving more life losses than the run allows", () => {
  const levels = [
    { ...clearedL1, livesLost: 3 },
    { ...clearedL2, livesLost: 3 },
  ];
  const res = validateRun(summaryOf(levels));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /more lives than the run allows/);
});

test("spending every life but no more is allowed", () => {
  // A contest run has five, and dying on the last one is the normal ending.
  const levels = [
    { ...clearedL1, livesLost: 2 },
    { ...clearedL2, livesLost: 3 },
  ];
  const res = validateRun(summaryOf(levels));
  assert.deepEqual(res.reasons, []);
  assert.ok(res.ok);
});

test("rejects totals that disagree with the per-level stats", () => {
  const res = validateRun(summaryOf([clearedL1], { holesSunk: 500 }));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /hole total does not match/);
});

test("rejects an empty run", () => {
  const res = validateRun(summaryOf([clearedL1], { levels: [] }));
  assert.ok(!res.ok);
  assert.match(res.reasons.join(" "), /no levels recorded/);
});

// --- plausibility ---------------------------------------------------------------
// Runs that add up but no real player makes are kept, flagged, off the board.
// The honest shapes below are modelled on the live board's top ten (Nov 2026).

/**
 * A run clearing `cleared` levels and dying `partial` holes into the next, at
 * `secPerHole` and `shotsPerHole`, with lives lost early on.
 */
function runOf(cleared, { secPerHole, shotsPerHole, partial = 2 }) {
  const levels = [];
  for (let n = 1; n <= cleared + 1; n++) {
    const holes = n <= cleared ? levelConfig(n).holesToClear : partial;
    levels.push({
      level: n,
      holes,
      shots: Math.ceil(holes * shotsPerHole),
      durationMs: Math.round(holes * secPerHole * 1000) + 1000,
      livesLost: n === 2 || n === 4 || n === 6 || n === 8 || n === cleared + 1 ? 1 : 0,
    });
  }
  return summaryOf(levels);
}

test("the board's best real run (level 13 in 4m38s) is not flagged", () => {
  const run = runOf(12, { secPerHole: 2.3, shotsPerHole: 3 });
  assert.ok(validateRun(run).ok, validateRun(run).reasons.join("; "));
  assert.deepEqual(implausible(run), []);
});

test("a fast real run (6 levels in 83s) is not flagged", () => {
  const run = runOf(6, { secPerHole: 1.6, shotsPerHole: 2.5 });
  assert.ok(validateRun(run).ok);
  assert.deepEqual(implausible(run), []);
});

test("a quick death on the first level is not flagged", () => {
  assert.deepEqual(implausible(summaryOf([{ level: 1, holes: 1, shots: 1, durationMs: 900, livesLost: 5 }])), []);
});

test("50 flawless levels at the fastest the rules allow is flagged", () => {
  const levels = [];
  for (let n = 1; n <= 50; n++) {
    const holes = levelConfig(n).holesToClear;
    levels.push({ level: n, holes, shots: holes, durationMs: holes * 320 + 400, livesLost: 0 });
  }
  const run = summaryOf(levels);
  assert.ok(validateRun(run).ok, "it adds up, which is the problem");
  assert.ok(implausible(run).length >= 3, implausible(run).join("; "));
});

test("reaching past level 20 is flagged", () => {
  const run = runOf(20, { secPerHole: 2.3, shotsPerHole: 3 });
  assert.match(implausible(run).join("; "), /level 21/);
});

test("clearing a level at under 0.4s a hole is flagged", () => {
  // Level 5: 9 holes in 3.42s. The rules allow it (the fire rate alone would
  // allow 3.28s); with 3 holes moving and 0.6s respawns, no one sinks them that fast.
  const run = runOf(6, { secPerHole: 2, shotsPerHole: 3 });
  run.levels[4] = { ...run.levels[4], durationMs: run.levels[4].holes * 380, shots: run.levels[4].holes };
  Object.assign(run, summaryOf(run.levels));
  assert.ok(validateRun(run).ok, validateRun(run).reasons.join("; "));
  assert.match(implausible(run).join("; "), /level 5: cleared too fast/);
});

test("one blistering level in an otherwise normal run is not flagged", () => {
  // Level 3 in 3.15s: near-perfect, but within reach with 3 holes on screen.
  const run = runOf(6, { secPerHole: 2, shotsPerHole: 3 });
  run.levels[2] = { ...run.levels[2], durationMs: run.levels[2].holes * 450, shots: run.levels[2].holes + 1 };
  Object.assign(run, summaryOf(run.levels));
  assert.ok(validateRun(run).ok);
  assert.deepEqual(implausible(run), []);
});

test("a strong, accurate player (0.8s a hole, 85% of shots) is not flagged", () => {
  const run = runOf(10, { secPerHole: 0.8, shotsPerHole: 1 / 0.85 });
  assert.ok(validateRun(run).ok, validateRun(run).reasons.join("; "));
  assert.deepEqual(implausible(run), []);
});

test("a whole run averaging under 0.6s a hole is flagged", () => {
  // Every level on its own is within reach; all of them in a row, about 0.52s a hole, are not.
  const run = runOf(8, { secPerHole: 0.4, shotsPerHole: 1.3 });
  assert.ok(validateRun(run).ok, validateRun(run).reasons.join("; "));
  assert.match(implausible(run).join("; "), /averaged/);
});

test("a claimed level that disagrees with the levels played is flagged", () => {
  // 30 levels played at a believable pace, but claiming to have reached level 13.
  const run = runOf(29, { secPerHole: 2, shotsPerHole: 3 });
  run.levelReached = 13;
  assert.ok(validateRun(run).ok, "it adds up, so only the flag can catch it");
  const reasons = implausible(run).join("; ");
  assert.match(reasons, /level 30/);
  assert.match(reasons, /claims level 13/);
});

test("sinking 95% of shots across 37 holes is flagged", () => {
  // One shot a hole, plus two misses: 37 holes in 39 shots.
  const run = runOf(5, { secPerHole: 2, shotsPerHole: 1 });
  run.levels[0] = { ...run.levels[0], shots: run.levels[0].shots + 2 };
  Object.assign(run, summaryOf(run.levels));
  assert.ok(run.holesSunk >= 30 && run.holesSunk / run.shotsFired >= 0.94);
  assert.ok(validateRun(run).ok);
  assert.match(implausible(run).join("; "), /accuracy 95%/);
});

test("a short run can be accurate without being flagged", () => {
  // Five holes in five shots happens; it takes 20 holes for it to mean anything.
  assert.deepEqual(implausible(summaryOf([{ ...clearedL1, shots: 5 }])), []);
});
