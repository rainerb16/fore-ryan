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
