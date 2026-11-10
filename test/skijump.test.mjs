// The Christmas ski jump's simulation and the rules the server judges it by.
// esbuild compiles the TypeScript to a temp bundle so Node can import it.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "skijump-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, "rules.mjs");
await build({
  entryPoints: ["games/christmas-2026/rules/index.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "warning",
});
const R = await import("file://" + outfile);

/** Hold through the flight until `releaseBefore` seconds before a held jump would land. */
function jump(tapBefore, releaseBefore) {
  if (releaseBefore === null) return R.simulate(tapBefore, () => false);
  const landsAt = R.simulate(tapBefore, () => true).landedTime;
  return R.simulate(tapBefore, (j) => j.time < landsAt - releaseBefore);
}

/** Wall-clock length of a run, slow motion included. */
function realSeconds(tapBefore, releaseBefore) {
  const landsAt = R.simulate(tapBefore, () => true).landedTime;
  const j = R.newJump();
  const dt = 1 / 120;
  R.step(j, { pressed: true, held: true }, dt);
  let wall = 0;
  let tapped = false;
  while (j.phase !== "done") {
    let pressed = false;
    if (j.phase === "inrun" && !tapped && (R.INRUN_LENGTH - j.s) / Math.max(j.speed, 0.01) <= tapBefore) {
      pressed = tapped = true;
    }
    wall += dt / R.timeScale(j);
    R.step(j, { pressed, held: j.phase === "flight" && j.time < landsAt - releaseBefore }, dt);
  }
  return wall;
}

// --- take-off ---------------------------------------------------------------

test("tapping right at the lip is a perfect take-off", () => {
  assert.equal(jump(0.02, 0.3).quality, "perfect");
});

test("tapping a little early is a good take-off", () => {
  assert.equal(jump(0.25, 0.3).quality, "good");
});

test("never tapping is a late take-off", () => {
  assert.equal(jump(null, 0.3).quality, "late");
});

test("a tap long before the lip is ignored, not counted as a take-off", () => {
  assert.equal(jump(2, 0.3).quality, "late");
});

test("better timing goes farther", () => {
  const perfect = jump(0.02, 0.3).distance;
  const good = jump(0.25, 0.3).distance;
  const late = jump(null, 0.3).distance;
  assert.ok(perfect > good && good > late, `${perfect} > ${good} > ${late}`);
});

// --- flight and landing -----------------------------------------------------

test("holding through touchdown is a crash", () => {
  const j = R.simulate(0.02, () => true);
  assert.equal(j.crashed, true);
});

test("letting go before touchdown lands cleanly", () => {
  assert.equal(jump(0.02, 0.2).crashed, false);
});

test("gliding goes farther than never leaning forward", () => {
  assert.ok(jump(0.02, 0.3).distance > jump(0.02, null).distance + 20);
});

test("every jump lands between 0 and 250 m", () => {
  for (const tap of [null, 0.02, 0.1, 0.3]) {
    for (const release of [null, 0, 0.3, 1, 3]) {
      const d = jump(tap, release).distance;
      assert.ok(d >= 0 && d <= R.MAX_DISTANCE_M, `tap ${tap}, release ${release}: ${d} m`);
    }
  }
});

test("a great jump lands in a believable range", () => {
  const d = jump(0.02, 0.3).distance;
  assert.ok(d > 120 && d < 170, `${d} m`);
});

test("the same inputs always give the same jump", () => {
  assert.equal(jump(0.05, 0.4).distance, jump(0.05, 0.4).distance);
});

test("a run takes 18 to 30 seconds from push-off to the result", () => {
  for (const [tap, release] of [[0.02, 0.3], [null, 0.3], [0.2, 1.5]]) {
    const s = realSeconds(tap ?? -1, release);
    assert.ok(s >= 18 && s <= 30, `tap ${tap}, release ${release}: ${s.toFixed(1)} s`);
  }
});

// --- what the server accepts ------------------------------------------------

const honest = () => R.detailsOf(jump(0.02, 0.3));

test("an honest jump is accepted, unflagged, at its distance in centimetres", () => {
  const details = honest();
  const v = R.judgeJump(details);
  assert.equal(v.ok, true);
  assert.equal(v.flagged, false, v.reasons?.join("; "));
  assert.equal(v.points, Math.round(details.distance_m * 100));
});

test("a crashed jump is refused", () => {
  assert.equal(R.judgeJump({ ...honest(), crashed: true }).ok, false);
});

test("malformed details are refused", () => {
  for (const bad of [null, {}, { ...honest(), distance_m: "far" }, { ...honest(), takeoff_quality: "epic" }]) {
    assert.equal(R.judgeJump(bad).ok, false, JSON.stringify(bad));
  }
});

test("a jump past what its take-off allows is kept but flagged", () => {
  const v = R.judgeJump({ ...honest(), takeoff_quality: "late", distance_m: 160 });
  assert.equal(v.ok, true);
  assert.equal(v.flagged, true);
});

test("a distance outside 0–250 m is flagged and capped", () => {
  const v = R.judgeJump({ ...honest(), distance_m: 900 });
  assert.equal(v.flagged, true);
  assert.equal(v.points, 25000);
});

test("a run quicker than the hill allows is flagged", () => {
  assert.equal(R.judgeJump({ ...honest(), duration_ms: 3000 }).flagged, true);
});
