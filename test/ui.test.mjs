// The leaderboard UI against a fake API. Covers the paths the smoke test cannot,
// since it deliberately runs with no network at all.
import assert from "node:assert/strict";
import test from "node:test";
import { bootGame } from "./harness.mjs";

const ENTRIES = [
  { rank: 1, display_name: "Dana", points: 18400, level_reached: 7, levels_cleared: 6, duration_ms: 240000, created_at: "2026-08-18T10:00:00Z" },
  { rank: 2, display_name: "Ryan B", points: 12050, level_reached: 5, levels_cleared: 4, duration_ms: 190000, created_at: "2026-08-18T11:00:00Z" },
  { rank: 3, display_name: "Sam", points: 9100, level_reached: 4, levels_cleared: 3, duration_ms: 150000, created_at: "2026-08-18T12:00:00Z" },
];

/** A fake backend. `routes` overrides any endpoint per test. */
function fakeApi(routes = {}) {
  const calls = [];
  const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

  const fetch = async (url, init = {}) => {
    const path = String(url).split("?")[0];
    calls.push({ path, method: init.method || "GET", body: init.body });

    if (routes[path]) return routes[path](url, init);
    if (path === "/api/run-start") return ok({ token: "11111111-2222-3333-4444-555555555555" });
    if (path === "/api/leaderboard") return ok({ top: ENTRIES, mine: null });
    if (path === "/api/submit-run") return ok({ points: 12050 });
    throw new Error(`unexpected request: ${path}`);
  };

  return { fetch, calls };
}

const rowText = (li) =>
  Array.from(li.children)
    .map((c) => c.textContent)
    .join(" | ");

// --- standings --------------------------------------------------------------

test("the standings screen lists the top runs", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });

  g.click("boardBtn");
  await g.settle(20);

  assert.equal(g.el("boardScreen").hidden, false);
  const rows = Array.from(g.el("boardList").children);
  assert.equal(rows.length, 3);
  assert.match(rowText(rows[0]), /Dana/);
  assert.match(rowText(rows[0]), /18,400/);
  assert.match(rowText(rows[0]), /LVL 7/);
  assert.equal(rows[0].querySelector(".rank").textContent, "🥇", "first place gets a medal");
  assert.equal(rows[2].querySelector(".rank").textContent, "🥉");
});

test("a name containing markup is shown as text, never parsed as HTML", async () => {
  const hostile = { ...ENTRIES[0], display_name: "<img src=x onerror=alert(1)>" };
  const api = fakeApi({
    "/api/leaderboard": () =>
      new Response(JSON.stringify({ top: [hostile], mine: null }), { status: 200 }),
  });
  const g = bootGame({ fetch: api.fetch });

  g.click("boardBtn");
  await g.settle(20);

  const row = g.el("boardList").children[0];
  assert.equal(row.querySelector("img"), null, "no element may be created from a display name");
  assert.equal(row.querySelector(".who").textContent, hostile.display_name);
});

test("your own row is highlighted when you are on the board", async () => {
  const mine = { ...ENTRIES[1], rank: 2 };
  const api = fakeApi({
    "/api/leaderboard": () =>
      new Response(JSON.stringify({ top: ENTRIES, mine }), { status: 200 }),
  });
  const g = bootGame({ fetch: api.fetch });

  g.click("boardBtn");
  await g.settle(20);

  const rows = Array.from(g.el("boardList").children);
  assert.equal(rows.filter((r) => r.className === "mine").length, 1);
  assert.match(rowText(rows.find((r) => r.className === "mine")), /Ryan B/);
});

test("a rank below the cut is pinned under the list", async () => {
  const mine = { ...ENTRIES[2], display_name: "Late Joiner", rank: 41, points: 300 };
  const api = fakeApi({
    "/api/leaderboard": () =>
      new Response(JSON.stringify({ top: ENTRIES, mine }), { status: 200 }),
  });
  const g = bootGame({ fetch: api.fetch });

  g.click("boardBtn");
  await g.settle(20);

  const rows = Array.from(g.el("boardList").children);
  assert.equal(rows.length, 5, "three listed, a gap marker, then your row");
  assert.equal(rows[3].className, "gap");
  assert.match(rowText(rows[4]), /Late Joiner/);
  assert.equal(rows[4].className, "mine");
});

test("an empty board invites the first run", async () => {
  const api = fakeApi({
    "/api/leaderboard": () =>
      new Response(JSON.stringify({ top: [], mine: null }), { status: 200 }),
  });
  const g = bootGame({ fetch: api.fetch });

  g.click("boardBtn");
  await g.settle(20);

  assert.equal(g.el("boardList").children.length, 0);
  assert.match(g.text("boardStatus"), /first/i);
});

test("a failing board request shows the server's message, not a stack trace", async () => {
  const api = fakeApi({
    "/api/leaderboard": () =>
      new Response(JSON.stringify({ error: "Could not load the leaderboard" }), { status: 500 }),
  });
  const g = bootGame({ fetch: api.fetch });

  g.click("boardBtn");
  await g.settle(20);

  assert.equal(g.text("boardStatus"), "Could not load the leaderboard");
});

// --- submission -------------------------------------------------------------

/** Play a contest run to its end so the submission form is armed. */
async function playContestRun(g) {
  g.click("contestBtn");
  await g.settle(20); // let run-start resolve
  for (let i = 0; i < 60 && !g.roundOver(); i++) {
    g.holdFire();
    await g.tick(300);
  }
  assert.ok(g.roundOver(), "the contest run should have ended");
  await g.settle(600);
  assert.equal(g.el("runScreen").hidden, false);
}

// --- per-level theming ------------------------------------------------------

test("the backdrop changes when you reach a new level", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });
  const stage = g.el("stage");
  const sky = () => stage.style.getPropertyValue("--sky-top");
  const decor = () => g.doc.querySelector(".decor").textContent;

  g.click("contestBtn");
  const levelOneSky = sky();
  const levelOneDecor = decor();
  assert.ok(levelOneSky, "level 1 should have applied a theme");

  g.holdFire();
  await g.tick(1800);
  assert.ok(Number(g.text("level").replace(/\D/g, "")) >= 2, "should have advanced a level");

  assert.notEqual(sky(), levelOneSky, "a new level should repaint the sky");
  assert.notEqual(decor(), levelOneDecor, "a new level should change the scenery");
});

test("hazards are reskinned per level", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });

  const levelNow = () => Number(g.text("level").replace(/\D/g, ""));

  g.click("contestBtn");
  g.holdFire();
  await g.tick(300); // a few seconds of level 1

  const levelOne = new Set(g.drawnText);
  assert.ok(levelOne.has("💧") || levelOne.has("🌳"), "level 1 keeps the original hazards");

  // Clear only once the level has actually turned over, or the recording still
  // holds glyphs drawn during the tail of level 1.
  for (let i = 0; i < 12 && levelNow() < 2; i++) await g.tick(120);
  assert.ok(levelNow() >= 2, "should have advanced a level");

  g.drawnText.length = 0;
  await g.tick(90);

  const drawn = new Set(g.drawnText);
  assert.ok(drawn.size > 0, "hazards should still be drawing");
  assert.ok(!drawn.has("💧"), `level ${levelNow()} still drew the level 1 droplet`);
  assert.ok(!drawn.has("🌳"), `level ${levelNow()} still drew the level 1 tree`);
});

test("the birthday round always uses the level 1 look", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });
  const stage = g.el("stage");

  g.click("contestBtn");
  const levelOneSky = stage.style.getPropertyValue("--sky-top");
  g.holdFire();
  await g.tick(1800); // move to a later level, and its theme

  g.click("runHomeBtn"); // back to the start screen
  assert.equal(stage.style.getPropertyValue("--sky-top"), levelOneSky);

  g.click("startBtn");
  assert.equal(stage.style.getPropertyValue("--sky-top"), levelOneSky);
});

test("contest runs get five lives, the birthday round keeps three", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });
  const hearts = () => g.el("lives").textContent.match(/❤️/gu)?.length ?? 0;

  g.click("startBtn");
  assert.equal(hearts(), 3, "the gift round is unchanged");

  g.click("contestBtn");
  assert.equal(hearts(), 5, "a contest run is longer");

  g.click("runHomeBtn");
  assert.equal(hearts(), 3, "returning home goes back to the birthday round");
});

test("a contest run asks for a token as play begins", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });

  g.click("contestBtn");
  await g.settle(20);

  const started = api.calls.filter((c) => c.path === "/api/run-start");
  assert.equal(started.length, 1);
  assert.equal(started[0].method, "POST");
});

test("the birthday round never touches the leaderboard", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });

  g.click("startBtn");
  g.holdFire();
  await g.tick(240);

  assert.deepEqual(api.calls, [], "the gift round should make no network calls at all");
});

test("a finished run posts the score and reports the rank", async () => {
  const api = fakeApi({
    "/api/leaderboard": () =>
      new Response(
        JSON.stringify({ top: ENTRIES, mine: { ...ENTRIES[1], rank: 2 } }),
        { status: 200 },
      ),
  });
  const g = bootGame({ fetch: api.fetch });
  await playContestRun(g);

  assert.equal(g.el("submitForm").hidden, false, "an online run should offer the form");

  g.type("nameInput", "Ryan B");
  g.type("emailInput", "ryan@example.com");
  g.submit("submitForm");
  await g.settle(50);

  const posted = api.calls.find((c) => c.path === "/api/submit-run");
  assert.ok(posted, "the run should have been posted");

  const body = JSON.parse(posted.body);
  assert.equal(body.displayName, "Ryan B");
  assert.equal(body.email, "ryan@example.com");
  assert.equal(body.token, "11111111-2222-3333-4444-555555555555");
  assert.ok(body.summary.levels.length > 0, "the per-level stats must be included");

  assert.match(g.text("submitStatus"), /Posted/);
  assert.match(g.text("submitStatus"), /#2/, "the rank is the payoff");
  assert.equal(g.el("submitForm").hidden, true, "the form closes once the run is in");
});

test("the scorecard labels its columns and totals up", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });
  await playContestRun(g);

  const card = g.el("runBreakdown");
  const head = card.querySelector("li.head");
  assert.ok(head, "the scorecard needs column headings");
  assert.match(head.textContent, /Course/);
  assert.match(head.textContent, /Holes/);
  assert.match(head.textContent, /Points/);

  const rows = [...card.querySelectorAll("li.row")];
  assert.ok(rows.length >= 1, "at least one level should be listed");
  // Every level shows how far it got, not just whether it was cleared.
  for (const row of rows) {
    assert.match(row.querySelector(".holes").textContent, /^\d+\/\d+$/);
    assert.ok(row.querySelector(".course").textContent.length > 0);
  }

  // The level the run ended on is marked, and says why.
  const last = rows[rows.length - 1];
  assert.ok(last.className.includes("unfinished"), "the final level should be flagged");
  assert.match(last.querySelector(".bonus").textContent, /ran out of lives/);

  const total = card.querySelector("li.total");
  assert.ok(total, "the scorecard needs a total");
  assert.equal(
    total.querySelector(".pts").textContent,
    g.text("runHeadline").replace(" points", ""),
    "the total must match the headline score",
  );
});

test("a rejected run explains itself and leaves the form open", async () => {
  const api = fakeApi({
    "/api/submit-run": () =>
      new Response(JSON.stringify({ error: "That run did not add up" }), { status: 422 }),
  });
  const g = bootGame({ fetch: api.fetch });
  await playContestRun(g);

  g.type("nameInput", "Ryan B");
  g.type("emailInput", "ryan@example.com");
  g.submit("submitForm");
  await g.settle(50);

  assert.equal(g.text("submitStatus"), "That run did not add up");
  assert.equal(g.el("submitForm").hidden, false, "the player can try again");
  assert.equal(g.el("submitBtn").disabled, false);
});

test("the same run cannot be posted twice from the form", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });
  await playContestRun(g);

  g.type("nameInput", "Ryan B");
  g.type("emailInput", "ryan@example.com");
  g.submit("submitForm");
  g.submit("submitForm"); // double tap before the first resolves
  await g.settle(50);

  assert.equal(api.calls.filter((c) => c.path === "/api/submit-run").length, 1);
});

test("the name and email are remembered for the next run", async () => {
  const api = fakeApi();
  const g = bootGame({ fetch: api.fetch });
  await playContestRun(g);

  g.type("nameInput", "Ryan B");
  g.type("emailInput", "ryan@example.com");
  g.submit("submitForm");
  await g.settle(50);

  assert.equal(g.window.localStorage.getItem("ryanbday.name"), "Ryan B");
  assert.equal(g.window.localStorage.getItem("ryanbday.email"), "ryan@example.com");
});
