// Boot check: play both modes in the built bundle and confirm nothing throws.
//
// No fetch stub is installed, so this also covers the offline path: the game must
// stay playable, and say so plainly, with the leaderboard unreachable.
import { bootGame } from "./harness.mjs";

const g = bootGame();

const fail = (msg) => {
  console.error("SMOKE FAIL:", msg);
  if (g.errors[0]) console.error(g.errors[0]);
  process.exit(1);
};

if (g.errors.length) fail("threw during bootstrap");
if (!g.text("startHint")) fail("startHint never populated — bootstrap did not finish");
console.log("boot ok            :", g.text("startHint"));

// --- birthday round ---------------------------------------------------------
g.click("startBtn");
g.holdFire();
await g.tick(240);
if (g.el("level").hidden !== true) fail("birthday round should not show the level pill");
console.log("birthday · 4s      :", g.text("score"), "·", g.text("lives"));

// --- contest mode -----------------------------------------------------------
g.click("contestBtn");
if (g.el("level").hidden) fail("contest mode should show the level pill");
if (g.text("level") !== "LVL 1") fail(`contest should start on level 1, got ${g.text("level")}`);
g.holdFire();
await g.tick(1800); // ~30s, comfortably past level 1's par

const level = Number(g.text("level").replace(/\D/g, ""));
const points = Number(g.text("points").replace(/\D/g, ""));
if (level < 2) fail(`never cleared level 1 in 30s (level ${level}, ${points} pts)`);
if (points <= 0) fail("cleared a level but banked no points");
console.log("contest · 30s      :", g.text("level"), "·", g.text("score"), "·", g.text("points"));

// --- play the run out -------------------------------------------------------
for (let i = 0; i < 60 && !g.roundOver(); i++) {
  g.holdFire();
  await g.tick(300);
}
if (!g.roundOver()) fail("contest run never ended in ~5 minutes of play");

await g.settle(600); // let the overlay's reveal timer fire
if (g.el("runScreen").hidden) fail("run ended but the scorecard never appeared");

const rows = g.el("runBreakdown").querySelectorAll("li.row").length;
if (rows < 1) fail("run ended but the scorecard has no levels on it");
if (!g.el("runBreakdown").querySelector("li.head")) fail("the scorecard lost its column headings");
if (!g.el("runBreakdown").querySelector("li.total")) fail("the scorecard lost its total");
console.log("run over           :", g.text("runHeadline"), `· ${rows} levels on the card`);
console.log("                    ", g.text("runStats"));

// --- offline degradation ----------------------------------------------------
// With no fetch, run-start could never have answered. The run must be reported
// as unpostable rather than offering a form that cannot work.
if (!g.el("submitForm").hidden) fail("offline run should not offer the submission form");
if (!/offline/i.test(g.text("submitStatus"))) {
  fail(`expected an offline message, got: ${g.text("submitStatus")}`);
}
console.log("offline path       :", g.text("submitStatus"));

g.click("runBoardBtn");
await g.settle(50);
if (g.el("boardScreen").hidden) fail("the standings screen did not open");
const boardMsg = g.text("boardStatus");
if (!boardMsg) fail("the standings screen showed no status with the API down");
if (/fetch|undefined|TypeError/i.test(boardMsg)) {
  fail(`a raw error leaked to the player: ${boardMsg}`);
}
console.log("standings offline  :", boardMsg);

g.click("boardBackBtn");
if (g.el("startScreen").hidden) fail("Back did not return to the start screen");

console.log("SMOKE PASS");
