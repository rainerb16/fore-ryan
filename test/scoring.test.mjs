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
const { SCORING, levelConfig, scoreLevel, runTotal, validateRun, AUTHORED_LEVELS } = await import(
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
