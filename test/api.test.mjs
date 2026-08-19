// Tests the submission gate against a fake PostgREST. No Supabase project needed:
// the functions talk to the database over plain HTTP, so stubbing fetch exercises
// the real handler code, including the token, wall-clock, and rate-limit checks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { build } from "esbuild";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.HASH_SALT = "test-salt";

const dir = mkdtempSync(join(tmpdir(), "fore-ryan-api-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function bundle(entry, name, platform = "node") {
  const outfile = join(dir, name + ".mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform,
    packages: "external",
    logLevel: "warning",
  });
  return import("file://" + outfile);
}

const submitRun = (await bundle("netlify/functions/submit-run.ts", "submit-run")).default;
const runStart = (await bundle("netlify/functions/run-start.ts", "run-start")).default;
const leaderboard = (await bundle("netlify/functions/leaderboard.ts", "leaderboard")).default;
const { runTotal } = await bundle("test/shared-entry.ts", "shared", "neutral");

// --- fake PostgREST ---------------------------------------------------------

let tokens;
let runs;
let board;

function installFakeDatabase() {
  tokens = new Map();
  runs = [];
  board = [];

  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(process.env.SUPABASE_URL + "/rest/v1/", "");
    const method = init.method || "GET";
    const ok = (body, headers = {}) =>
      new Response(JSON.stringify(body), { status: 200, headers });
    const idIn = (p) => decodeURIComponent(p.match(/token=eq\.([^&]+)/)[1]);

    if (path === "run_tokens" && method === "POST") {
      const row = {
        token: randomUUID(),
        issued_at: new Date().toISOString(),
        used_at: null,
        ip_hash: JSON.parse(init.body).ip_hash,
      };
      tokens.set(row.token, row);
      return ok([row]);
    }

    // Counting tokens for one address, for the run-start rate limit.
    if (path.startsWith("run_tokens?ip_hash=eq.") && method === "GET") {
      const hash = decodeURIComponent(path.match(/ip_hash=eq\.([^&]+)/)[1]);
      const since = Date.parse(decodeURIComponent(path.match(/issued_at=gte\.([^&]+)/)[1]));
      const n = [...tokens.values()].filter(
        (t) => t.ip_hash === hash && Date.parse(t.issued_at) >= since,
      ).length;
      return ok([], { "content-range": "0-0/" + n });
    }

    if (path.startsWith("run_tokens?") && method === "GET") {
      const row = tokens.get(idIn(path));
      return ok(row ? [row] : []);
    }

    if (path.startsWith("run_tokens?") && method === "PATCH") {
      const row = tokens.get(idIn(path));
      if (!row || row.used_at) return ok([]); // already consumed
      row.used_at = new Date().toISOString();
      return ok([row]);
    }

    if (path.startsWith("runs?") && method === "GET") {
      const hash = decodeURIComponent(path.match(/player_id=eq\.([^&]+)/)[1]);
      const since = Date.parse(decodeURIComponent(path.match(/created_at=gte\.([^&]+)/)[1]));
      const n = runs.filter((r) => r.player_id === hash && r.created_at >= since).length;
      return ok([], { "content-range": "0-0/" + n });
    }

    // The leaderboard view: each person is already reduced to their best run.
    if (path.startsWith("leaderboard?") && method === "GET") {
      // Counting the runs that beat a given one, for a rank below the cut.
      const beats = path.match(/points\.gt\.(\d+).+duration_ms\.lt\.(\d+)/);
      if (beats) {
        const [, pts, ms] = beats.map(Number);
        const n = board.filter(
          (r) => r.points > pts || (r.points === pts && r.duration_ms < ms),
        ).length;
        return ok([], { "content-range": "0-0/" + n });
      }
      const hash = path.match(/player_id=eq\.([^&]+)/);
      if (hash) return ok(board.filter((r) => r.player_id === decodeURIComponent(hash[1])));

      // The view is ordered and paged by the database, so the fake must be too.
      const limit = Number(path.match(/limit=(\d+)/)?.[1] ?? board.length);
      const ranked = [...board].sort(
        (a, b) => b.points - a.points || a.duration_ms - b.duration_ms,
      );
      return ok(ranked.slice(0, limit));
    }

    if (path === "runs" && method === "POST") {
      runs.push(Object.assign(JSON.parse(init.body), { created_at: Date.now() }));
      return new Response("[]", { status: 201 });
    }

    throw new Error("fake database got an unexpected request: " + method + " " + path);
  };
}

beforeEach(installFakeDatabase);

// --- helpers ----------------------------------------------------------------

const clearedL1 = { level: 1, holes: 5, shots: 20, durationMs: 20000, livesLost: 0 };
const clearedL2 = { level: 2, holes: 6, shots: 26, durationMs: 30000, livesLost: 1 };

const summaryOf = (levels, over = {}) => ({
  levelReached: levels[levels.length - 1].level,
  levelsCleared: levels.length,
  points: runTotal(levels),
  durationMs: levels.reduce((n, s) => n + s.durationMs, 0),
  shotsFired: levels.reduce((n, s) => n + s.shots, 0),
  holesSunk: levels.reduce((n, s) => n + s.holes, 0),
  levels,
  ...over,
});

/** A token issued far enough in the past that the wall-clock check passes. */
function tokenIssuedAgo(ms) {
  const row = {
    token: randomUUID(),
    issued_at: new Date(Date.now() - ms).toISOString(),
    used_at: null,
  };
  tokens.set(row.token, row);
  return row.token;
}

const post = (body) =>
  submitRun(
    new Request("https://example.com/api/submit-run", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "test" },
      body: JSON.stringify(body),
    }),
  );

const goodSubmission = (over = {}) => ({
  token: tokenIssuedAgo(120000),
  displayName: "Ryan B",
  playerId: "11111111-aaaa-4bbb-8ccc-222222222222",
  summary: summaryOf([clearedL1, clearedL2]),
  ...over,
});

// --- run-start --------------------------------------------------------------

const startRunReq = (ip = "203.0.113.7") =>
  runStart(
    new Request("https://example.com/api/run-start", {
      method: "POST",
      headers: { "x-nf-client-connection-ip": ip },
    }),
  );

test("run-start caps how many tokens one address can mint", async () => {
  for (let i = 0; i < 60; i++) {
    assert.equal((await startRunReq()).status, 200, `token ${i + 1} should be issued`);
  }
  const blocked = await startRunReq();
  assert.equal(blocked.status, 429);
  assert.equal(tokens.size, 60, "the blocked request must not create a row");
});

test("the contest deadline closes both endpoints", async () => {
  process.env.CONTEST_ENDS_AT = "2020-01-01T00:00:00Z"; // long past

  const started = await startRunReq();
  assert.equal(started.status, 403, "no new runs once the contest has closed");

  const submitted = await post(goodSubmission());
  assert.equal(submitted.status, 403);
  assert.equal(runs.length, 0);

  delete process.env.CONTEST_ENDS_AT;
});

test("a deadline in the future changes nothing", async () => {
  process.env.CONTEST_ENDS_AT = "2099-01-01T00:00:00Z";
  assert.equal((await startRunReq()).status, 200);
  assert.equal((await post(goodSubmission())).status, 200);
  delete process.env.CONTEST_ENDS_AT;
});

test("an unparseable deadline is ignored rather than closing the contest", async () => {
  process.env.CONTEST_ENDS_AT = "next Tuesday-ish";
  assert.equal((await startRunReq()).status, 200, "a bad date must not lock everyone out");
  delete process.env.CONTEST_ENDS_AT;
});

test("run-start issues a token and rejects GET", async () => {
  const bad = await runStart(new Request("https://example.com/api/run-start"));
  assert.equal(bad.status, 405);

  const res = await runStart(new Request("https://example.com/api/run-start", { method: "POST" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(tokens.has(body.token));
});

// --- the happy path ---------------------------------------------------------

test("an honest run is accepted and stored with the server's own score", async () => {
  const body = goodSubmission();
  const res = await post(body);
  const payload = await res.json();
  assert.equal(res.status, 200, JSON.stringify(payload));

  assert.equal(runs.length, 1);
  assert.equal(runs[0].points, runTotal(body.summary.levels));
  assert.equal(runs[0].display_name, "Ryan B");
  assert.equal(payload.points, runs[0].points);
});

test("nothing personal is stored — a run carries a name and an opaque id", async () => {
  await post(goodSubmission());
  const stored = runs[0];
  assert.equal(stored.display_name, "Ryan B");
  assert.equal(stored.player_id, "11111111-aaaa-4bbb-8ccc-222222222222");
  assert.equal(Object.keys(stored).includes("email_hash"), false);
});

test("an inflated score claim is overwritten, not trusted", async () => {
  const body = goodSubmission();
  const honest = runTotal(body.summary.levels);
  body.summary.points = 99999999;

  const res = await post(body);
  assert.equal(res.status, 200);
  assert.equal(runs[0].points, honest);
  assert.equal(runs[0].client_meta.claimed_points, 99999999, "the claim is kept for review");
});

// --- rejections -------------------------------------------------------------

test("rejects a run whose stats do not add up", async () => {
  const res = await post(goodSubmission({ summary: summaryOf([{ ...clearedL1, shots: 1 }]) }));
  assert.equal(res.status, 422);
  assert.equal(runs.length, 0);
});

test("rejects a replay of an already-submitted token", async () => {
  const body = goodSubmission();
  assert.equal((await post(body)).status, 200);

  const again = await post(body);
  assert.equal(again.status, 409);
  assert.equal(runs.length, 1, "the replay must not create a second row");
});

test("rejects an unknown token", async () => {
  const res = await post(goodSubmission({ token: randomUUID() }));
  assert.equal(res.status, 403);
});

test("rejects a token that is not even a uuid", async () => {
  const res = await post(goodSubmission({ token: "not-a-uuid" }));
  assert.equal(res.status, 400);
});

test("rejects a long run submitted seconds after the token was issued", async () => {
  // 50s of claimed play, but the token was handed out 2s ago.
  const res = await post(goodSubmission({ token: tokenIssuedAgo(2000) }));
  assert.equal(res.status, 422);
  assert.equal(runs.length, 0);
});

test("rejects a token older than its time to live", async () => {
  const res = await post(goodSubmission({ token: tokenIssuedAgo(7 * 60 * 60 * 1000) }));
  assert.equal(res.status, 410);
});

test("rejects a missing or malformed name", async () => {
  assert.equal((await post(goodSubmission({ displayName: "   " }))).status, 400);
  assert.equal((await post(goodSubmission({ displayName: "x".repeat(41) }))).status, 400);
  assert.equal((await post(goodSubmission({ displayName: 42 }))).status, 400);
});

test("rejects a missing or malformed player id", async () => {
  assert.equal((await post(goodSubmission({ playerId: "nope" }))).status, 400);
  assert.equal((await post(goodSubmission({ playerId: null }))).status, 400);
});

test("rate limits one person to 20 runs an hour", async () => {
  for (let i = 0; i < 20; i++) {
    const res = await post(goodSubmission());
    assert.equal(res.status, 200, "submission " + (i + 1) + " should succeed");
  }
  const blocked = await post(goodSubmission());
  assert.equal(blocked.status, 429);
  assert.equal(runs.length, 20);
});

test("the rate limit is per player, not global", async () => {
  for (let i = 0; i < 20; i++) await post(goodSubmission());
  const other = await post(goodSubmission({ playerId: "33333333-aaaa-4bbb-8ccc-444444444444" }));
  assert.equal(other.status, 200);
});

test("rejects a body that is not JSON", async () => {
  const res = await submitRun(
    new Request("https://example.com/api/submit-run", { method: "POST", body: "not json" }),
  );
  assert.equal(res.status, 400);
});

test("rejects GET", async () => {
  const res = await submitRun(new Request("https://example.com/api/submit-run"));
  assert.equal(res.status, 405);
});

// --- leaderboard ------------------------------------------------------------

const boardRow = (over = {}) => ({
  player_id: "11111111-aaaa-4bbb-8ccc-222222222222",
  display_name: "Dana",
  points: 18400,
  level_reached: 7,
  levels_cleared: 6,
  duration_ms: 240000,
  created_at: "2026-08-18T10:00:00Z",
  ...over,
});

const getBoard = (query = "") =>
  leaderboard(new Request(`https://example.com/api/leaderboard${query}`));

test("the standings never expose anybody's player id", async () => {
  board.push(boardRow(), boardRow({ player_id: "33333333-aaaa-4bbb-8ccc-444444444444", display_name: "Sam", points: 900 }));

  const res = await getBoard();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.top.length, 2);
  assert.ok(!JSON.stringify(body).includes("11111111-aaaa-4bbb-8ccc-222222222222"), "an identifier reached the browser");
  for (const entry of body.top) assert.equal(entry.player_id, undefined);
});

test("ranks are assigned in the order the view returns", async () => {
  board.push(boardRow(), boardRow({ player_id: "33333333-aaaa-4bbb-8ccc-444444444444", display_name: "Sam", points: 900 }));
  const { top } = await (await getBoard()).json();
  assert.deepEqual(top.map((r) => [r.rank, r.display_name]), [[1, "Dana"], [2, "Sam"]]);
});

test("a player id finds its own rank, and matches on identity not on score", async () => {
  const mineHash = "33333333-aaaa-4bbb-8ccc-444444444444";
  // Same name and same points as the leader: matching on those would collide.
  board.push(boardRow(), boardRow({ player_id: mineHash }));

  const { mine } = await (await getBoard(`?player=${mineHash}`)).json();
  assert.equal(mine.rank, 2, "the second row is mine, despite identical name and score");
  assert.equal(mine.player_id, undefined);
});

test("someone with no posted run has no standing", async () => {
  board.push(boardRow());
  const { mine } = await (await getBoard(`?player=${"55555555-aaaa-4bbb-8ccc-666666666666"}`)).json();
  assert.equal(mine, null);
});

test("a run below the listed cut still gets its real rank", async () => {
  const mineHash = "77777777-aaaa-4bbb-8ccc-888888888888";
  // Thirty ahead of them, and only three are listed.
  for (let i = 0; i < 30; i++) {
    board.push(boardRow({ player_id: `${String(i).padStart(8, "0")}-aaaa-4bbb-8ccc-999999999999`, points: 20000 - i }));
  }
  board.push(boardRow({ player_id: mineHash, display_name: "Late Joiner", points: 300 }));

  const { top, mine } = await (await getBoard(`?player=${mineHash}&limit=3`)).json();
  assert.equal(top.length, 3, "the list is capped");
  assert.equal(mine.rank, 31, "counted against the whole board, not just the page");
  assert.equal(mine.display_name, "Late Joiner");
});

test("anything that is not a player id is ignored", async () => {
  board.push(boardRow());
  for (const q of ["?player=ryan@example.com", "?player=../etc", "?player=", "?handle=x"]) {
    const { mine } = await (await getBoard(q)).json();
    assert.equal(mine, null, `${q} should not resolve to anyone`);
  }
});

test("the leaderboard rejects anything but GET", async () => {
  const res = await leaderboard(
    new Request("https://example.com/api/leaderboard", { method: "POST" }),
  );
  assert.equal(res.status, 405);
});
