// The lobby without WebGL, as jsdom (and any browser that cannot do 3D) sees it:
// the cabinet list is the whole lobby, and must work on its own.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { loadPage } from "./harness.mjs";

const { html, code } = loadPage("");

function bootLobby(fetch) {
  const dom = new JSDOM(html, {
    url: "https://fore-ryan.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(), // silence jsdom's "not implemented" notes
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error || e.message));
  window.HTMLCanvasElement.prototype.getContext = () => null; // no WebGL here
  window.fetch = fetch;
  window.console.warn = () => {};
  window.eval(code);
  return { window, doc: window.document, errors };
}

const settle = () => new Promise((r) => setTimeout(r, 30));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("without WebGL the lobby falls back to a list of every game, with its top scores", async () => {
  const top = [
    { rank: 1, display_name: "Dana", points: 214700, duration_ms: 1, created_at: "" },
    { rank: 2, display_name: "Sam", points: 9100, duration_ms: 1, created_at: "" },
  ];
  const requested = [];
  const g = bootLobby(async (url) => {
    requested.push(String(url));
    return json({ top, mine: null, closesAt: null, closed: false });
  });
  await settle();

  assert.deepEqual(g.errors, []);
  assert.ok(g.doc.body.classList.contains("no-webgl"));

  const item = g.doc.querySelector('#cabinetList [data-game="birthday-2026"]');
  assert.ok(item, "the birthday cabinet is listed");
  assert.equal(item.querySelector("a.play").getAttribute("href"), "/games/birthday-2026/");
  assert.match(item.textContent, /Fore Ryan!/);
  assert.match(item.textContent, /Birthday 2026/);

  const rows = Array.from(item.querySelectorAll(".top3 li")).map((li) => li.textContent);
  assert.deepEqual(rows, ["Dana214,700", "Sam9,100"]);
  assert.ok(requested.some((u) => u.includes("game=birthday-2026") && u.includes("limit=3")));
});

test("the lobby still lists the games when the scores cannot be loaded", async () => {
  const g = bootLobby(async () => {
    throw new TypeError("fetch failed");
  });
  await settle();

  assert.deepEqual(g.errors, []);
  const item = g.doc.querySelector('#cabinetList [data-game="birthday-2026"]');
  assert.ok(item.querySelector("a.play"));
  assert.match(item.querySelector(".top3").textContent, /No scores yet/);
});

test("a refused score request says scores are unavailable", async () => {
  const g = bootLobby(async () => json({ error: "nope" }, 405));
  await settle();
  assert.match(g.doc.querySelector(".top3").textContent, /unavailable/);
});

// --- loading ---------------------------------------------------------------------

test("scores are asked for straight away, not after the 3D arcade has loaded", async () => {
  const dom = new JSDOM(html, {
    url: "https://fore-ryan.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  const requested = [];
  // WebGL works, and the 3D arcade is still loading: its fonts are on their way.
  window.HTMLCanvasElement.prototype.getContext = (kind) => (kind === "webgl2" ? {} : null);
  Object.defineProperty(window.document, "fonts", { value: { load: () => new Promise(() => {}) } });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.fetch = async (url) => {
    requested.push(String(url));
    return json({ top: [], mine: null, closesAt: null, closed: false });
  };
  window.console.warn = () => {};
  window.eval(code);
  await settle();
  assert.ok(requested.some((u) => u.startsWith("/api/leaderboard")), "no scores requested while the arcade loads");
});

test("the web fonts never hold up the first paint", () => {
  const doc = new JSDOM(html).window.document;
  const fonts = [...doc.querySelectorAll('link[rel="stylesheet"]')].filter((l) => l.href.includes("fonts.googleapis.com"));
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0].media, "print", "loaded as print, so it does not block rendering");
  assert.match(fonts[0].getAttribute("onload") ?? "", /media\s*=\s*['"]all['"]/);
  // Marked done either way, so a blocked stylesheet doesn't make the arcade wait for it.
  assert.match(fonts[0].getAttribute("onload") ?? "", /dataset\.state\s*=\s*['"]done['"]/);
  assert.match(fonts[0].getAttribute("onerror") ?? "", /dataset\.state\s*=\s*['"]done['"]/);
});

