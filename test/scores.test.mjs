// The arcade's shared modules: the registry, name cleaning, and the scores
// adapter's fallback rules. esbuild compiles the TypeScript for Node.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "arcade-scores-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function load(entry) {
  const outfile = join(dir, entry.replace(/\W/g, "_") + ".mjs");
  await build({ entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "neutral", logLevel: "warning" });
  return import("file://" + outfile);
}

const { GAMES, gameById, byNewest } = await load("shared/games.ts");
const { cleanName, MAX_NAME_LENGTH } = await load("shared/names.ts");
const scores = await load("shared/scores.ts");

// --- fakes --------------------------------------------------------------------

let saved;
let requests;
let warnings;
globalThis.localStorage = {
  getItem: (k) => (saved.has(k) ? saved.get(k) : null),
  setItem: (k, v) => saved.set(k, String(v)),
};
console.warn = (...args) => warnings.push(args.join(" "));

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** Answers each path with the given response, or throws like a dropped connection. */
function serve(routes) {
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).split("?")[0];
    requests.push({ url: String(url), path, body: init.body && JSON.parse(init.body), signal: init.signal });
    const route = routes[path];
    if (!route) throw new TypeError("fetch failed");
    return route();
  };
}

beforeEach(() => {
  saved = new Map();
  requests = [];
  warnings = [];
  serve({});
});

const run = (over = {}) => ({ displayName: "Ryan", points: 500, durationMs: 30000, details: { a: 1 }, ...over });

// --- registry -----------------------------------------------------------------

test("every game has a unique occasion-and-year id and a page path", () => {
  const ids = GAMES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of GAMES) {
    assert.match(g.id, /^(birthday|christmas|easter)-\d{4}$/);
    assert.equal(g.path, `/games/${g.id}/`);
  }
  assert.equal(gameById("birthday-2026")?.sort, "desc");
  assert.equal(gameById("nope"), undefined);
});

test("the lobby lists games newest first", () => {
  const order = byNewest([
    { id: "a", released: "2026-08-17" },
    { id: "b", released: "2026-12-24" },
    { id: "c", released: "2027-04-05" },
  ]).map((g) => g.id);
  assert.deepEqual(order, ["c", "b", "a"]);
});

// --- names --------------------------------------------------------------------

test("names are trimmed, collapsed, stripped of control characters, and capped", () => {
  assert.equal(cleanName("  Ryan   B \t "), "Ryan B");
  assert.equal(cleanName("Ry\u0000an\u007f"), "Ryan");
  assert.equal(cleanName("x".repeat(30)), "x".repeat(MAX_NAME_LENGTH));
  assert.equal(cleanName("🎄".repeat(25)), "🎄".repeat(MAX_NAME_LENGTH));
  assert.equal(cleanName("   "), null);
  assert.equal(cleanName(42), null);
});

// --- startRun -----------------------------------------------------------------

test("startRun returns the server's token and says which game", async () => {
  serve({ "/api/run-start": () => json({ token: "t-1" }) });
  assert.equal(await scores.startRun("birthday-2026"), "t-1");
  assert.deepEqual(requests[0].body, { gameId: "birthday-2026" });
});

test("startRun falls back to a local token when the server is down or failing", async () => {
  assert.match(await scores.startRun("birthday-2026"), /^local:/);
  serve({ "/api/run-start": () => json({ error: "db paused" }, 500) });
  assert.match(await scores.startRun("birthday-2026"), /^local:/);
  assert.equal(warnings.length, 2);
});

test("startRun returns null when the server refuses, so nothing is kept locally", async () => {
  serve({ "/api/run-start": () => json({ error: "closed" }, 403) });
  assert.equal(await scores.startRun("birthday-2026"), null);
});

// --- submitRun ----------------------------------------------------------------

test("submitRun posts the details, never the claimed points, and returns the server's score", async () => {
  serve({ "/api/submit-run": () => json({ points: 480 }) });
  const res = await scores.submitRun("birthday-2026", "t-1", run({ displayName: "  Ryan  B " }));
  assert.deepEqual(res, { ok: true, points: 480 });
  const { body } = requests[0];
  assert.deepEqual(Object.keys(body).sort(), ["details", "displayName", "gameId", "playerId", "token"]);
  assert.equal(body.displayName, "Ryan B");
  assert.match(body.playerId, /^[0-9a-f-]{36}$/);
});

test("submitRun keeps the run on this device for a local token, without calling the server", async () => {
  const res = await scores.submitRun("birthday-2026", "local:x", run());
  assert.deepEqual(res, { ok: true, points: 500, rank: 1, local: true });
  assert.equal(requests.length, 0);
  assert.equal(JSON.parse(saved.get("arcade.scores.birthday-2026"))[0].display_name, "Ryan");
});

test("submitRun keeps the run locally when the server is down mid-submit", async () => {
  serve({ "/api/submit-run": () => json({}, 503) });
  const res = await scores.submitRun("birthday-2026", "t-1", run());
  assert.equal(res.local, true);
  assert.ok(saved.has("arcade.scores.birthday-2026"));
});

test("a refusal from the server is passed back and never saved locally", async () => {
  serve({ "/api/submit-run": () => json({ error: "That run did not add up" }, 422) });
  const res = await scores.submitRun("birthday-2026", "t-1", run());
  assert.deepEqual(res, { ok: false, error: "That run did not add up" });
  assert.equal(saved.has("arcade.scores.birthday-2026"), false);
});

test("an empty name is refused before anything is sent", async () => {
  const res = await scores.submitRun("birthday-2026", "local:x", run({ displayName: "  " }));
  assert.equal(res.ok, false);
  assert.equal(saved.size, 0);
});

// --- getLeaderboard -----------------------------------------------------------

test("getLeaderboard asks for the game, the limit, and this player's standing", async () => {
  const board = { top: [], mine: null, closesAt: null, closed: false };
  serve({ "/api/leaderboard": () => json(board) });
  scores.playerId();
  assert.deepEqual(await scores.getLeaderboard("birthday-2026", 3), board);
  const url = new URL(requests[0].url, "https://x.test");
  assert.equal(url.searchParams.get("game"), "birthday-2026");
  assert.equal(url.searchParams.get("limit"), "3");
  assert.match(url.searchParams.get("player"), /^[0-9a-f-]{36}$/);
});

test("offline, the local board keeps each name's best run, best first", async () => {
  await scores.submitRun("birthday-2026", "local:1", run({ displayName: "Ryan", points: 300 }));
  await scores.submitRun("birthday-2026", "local:2", run({ displayName: "Sam", points: 900 }));
  await scores.submitRun("birthday-2026", "local:3", run({ displayName: "ryan", points: 200 })); // worse
  await scores.submitRun("birthday-2026", "local:4", run({ displayName: "Dana", points: 900, durationMs: 1000 }));

  const board = await scores.getLeaderboard("birthday-2026", 10);
  assert.equal(board.local, true);
  assert.deepEqual(
    board.top.map((e) => [e.rank, e.display_name, e.points]),
    [[1, "Dana", 900], [2, "Sam", 900], [3, "Ryan", 300]],
  );
  assert.equal((await scores.getLeaderboard("birthday-2026", 1)).top.length, 1);
});

test("local scores are kept per game", async () => {
  await scores.submitRun("birthday-2026", "local:1", run());
  const other = await scores.getLeaderboard("christmas-2026", 10);
  assert.deepEqual(other.top, []);
});

test("a leaderboard error that is not an outage is surfaced, not hidden", async () => {
  serve({ "/api/leaderboard": () => json({ error: "Use GET" }, 405) });
  await assert.rejects(scores.getLeaderboard("birthday-2026"), /Use GET/);
});

// --- time limits --------------------------------------------------------------

test("every request has a time limit, and running out keeps the run on this device", async () => {
  serve({
    "/api/submit-run": () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    },
  });
  const res = await scores.submitRun("birthday-2026", "t-1", run());
  assert.equal(res.local, true);
  assert.ok(requests[0].signal instanceof AbortSignal, "the request has no time limit");
});

test("browsers without a timeout signal (older iPhones) still post", async () => {
  const timeout = AbortSignal.timeout;
  delete AbortSignal.timeout;
  try {
    serve({ "/api/submit-run": () => json({ points: 480 }) });
    const res = await scores.submitRun("birthday-2026", "t-1", run());
    assert.deepEqual(res, { ok: true, points: 480 });
  } finally {
    AbortSignal.timeout = timeout;
  }
});

// --- reusing run tokens ---------------------------------------------------------

/**
 * run-start handing out a new token per call. Tokens are unique per test, like
 * the server's uuids, because the module remembers spent ones for the page's life.
 * Returns the name of the nth token it will issue.
 */
let batch = 0;
function issuing(status = 200) {
  const prefix = `b${++batch}`;
  let n = 0;
  serve({
    "/api/run-start": () => (status === 200 ? json({ token: `${prefix}-${++n}` }) : json({ error: "no" }, status)),
    "/api/submit-run": () => json({ points: 480 }),
  });
  return (nth) => `${prefix}-${nth}`;
}
const starts = () => requests.filter((r) => r.path === "/api/run-start").length;

test("a run nobody posted hands its token to the next run", async () => {
  const t = issuing();
  const tokens = scores.runTokens("christmas-2026");
  assert.equal(await tokens.next(), t(1));
  assert.equal(await tokens.next(), t(1));
  assert.equal(starts(), 1);
});

test("two runs started before the server answers share the one request", async () => {
  issuing();
  const tokens = scores.runTokens("christmas-2026");
  const [a, b] = await Promise.all([tokens.next(), tokens.next()]);
  assert.equal(a, b);
  assert.equal(starts(), 1);
});

test("once a run is posted, the next run gets a fresh token", async () => {
  const t = issuing();
  const tokens = scores.runTokens("christmas-2026");
  const first = await tokens.next();
  await scores.submitRun("christmas-2026", first, run());
  assert.equal(await tokens.next(), t(2));
});

test("a token the server says was already used is not handed out again", async () => {
  issuing();
  const tokens = scores.runTokens("christmas-2026");
  const first = await tokens.next();
  serve({
    "/api/submit-run": () => json({ error: "That run was already submitted" }, 409),
    "/api/run-start": () => json({ token: `${first}-next` }),
  });
  await scores.submitRun("christmas-2026", first, run());
  assert.equal(await tokens.next(), `${first}-next`);
});

test("a refused or offline start is asked again, not reused", async () => {
  issuing(429);
  const tokens = scores.runTokens("christmas-2026");
  assert.equal(await tokens.next(), null);
  serve({});
  assert.match(await tokens.next(), /^local:/);
  const t = issuing();
  assert.equal(await tokens.next(), t(1));
});

test("a token is not reused once it is near its time limit on the server", async () => {
  const t = issuing();
  const tokens = scores.runTokens("christmas-2026");
  const now = Date.now;
  try {
    assert.equal(await tokens.next(), t(1));
    Date.now = () => now() + 5 * 60 * 60 * 1000 + 1;
    assert.equal(await tokens.next(), t(2));
  } finally {
    Date.now = now;
  }
});

test("each game keeps its own tokens", async () => {
  issuing();
  const golf = scores.runTokens("birthday-2026");
  const jump = scores.runTokens("christmas-2026");
  assert.notEqual(await golf.next(), await jump.next());
});

test("a token being posted is not handed to the next run, however the post ends", async () => {
  issuing();
  const tokens = scores.runTokens("christmas-2026");
  const first = await tokens.next();
  let finish;
  serve({
    "/api/run-start": () => json({ token: `${first}-next` }),
    "/api/submit-run": () => new Promise((r) => (finish = r)),
  });
  const posting = scores.submitRun("christmas-2026", first, run());
  // "Jump again" while the post is still on its way.
  assert.equal(await tokens.next(), `${first}-next`);
  finish(json({ points: 480 }));
  await posting;
});

test("a post that timed out may have been saved, so its token is not reused", async () => {
  issuing();
  const tokens = scores.runTokens("christmas-2026");
  const first = await tokens.next();
  serve({
    "/api/run-start": () => json({ token: `${first}-next` }),
    "/api/submit-run": () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    },
  });
  await scores.submitRun("christmas-2026", first, run());
  assert.equal(await tokens.next(), `${first}-next`);
});

