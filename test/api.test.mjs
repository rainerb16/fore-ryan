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
process.env.EMAIL_HASH_SALT = "test-salt";

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
const { runTotal } = await bundle("test/shared-entry.ts", "shared", "neutral");

// --- fake PostgREST ---------------------------------------------------------

let tokens;
let runs;

function installFakeDatabase() {
  tokens = new Map();
  runs = [];

  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace(process.env.SUPABASE_URL + "/rest/v1/", "");
    const method = init.method || "GET";
    const ok = (body, headers = {}) =>
      new Response(JSON.stringify(body), { status: 200, headers });
    const idIn = (p) => decodeURIComponent(p.match(/token=eq\.([^&]+)/)[1]);

    if (path === "run_tokens" && method === "POST") {
      const row = { token: randomUUID(), issued_at: new Date().toISOString(), used_at: null };
      tokens.set(row.token, row);
      return ok([row]);
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
      const hash = decodeURIComponent(path.match(/email_hash=eq\.([^&]+)/)[1]);
      const since = Date.parse(decodeURIComponent(path.match(/created_at=gte\.([^&]+)/)[1]));
      const n = runs.filter((r) => r.email_hash === hash && r.created_at >= since).length;
      return ok([], { "content-range": "0-0/" + n });
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
  email: "ryan@example.com",
  summary: summaryOf([clearedL1, clearedL2]),
  ...over,
});

// --- run-start --------------------------------------------------------------

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

test("the email is stored only as a salted hash", async () => {
  await post(goodSubmission());
  assert.ok(
    !JSON.stringify(runs[0]).includes("ryan@example.com"),
    "the raw email must never be stored",
  );
  assert.match(runs[0].email_hash, /^[0-9a-f]{64}$/);
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

test("rejects a missing or malformed email", async () => {
  assert.equal((await post(goodSubmission({ email: "nope" }))).status, 400);
  assert.equal((await post(goodSubmission({ email: null }))).status, 400);
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

test("the rate limit is per person, not global", async () => {
  for (let i = 0; i < 20; i++) await post(goodSubmission());
  const other = await post(goodSubmission({ email: "someone.else@example.com" }));
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
