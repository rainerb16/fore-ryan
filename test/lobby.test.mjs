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
