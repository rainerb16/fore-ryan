// The ski jump page without WebGL, as jsdom (and any browser that cannot do
// 3D) sees it: it must explain itself rather than throw, and still show the podium.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { loadPage } from "./harness.mjs";

const settle = () => new Promise((r) => setTimeout(r, 30));

/** Boots the page with `fetch` answering as given. */
async function boot(fetchImpl) {
  const { html, code } = loadPage("games/christmas-2026/");
  const dom = new JSDOM(html, {
    url: "https://fore-ryan.test/games/christmas-2026/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error || e.message));
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = fetchImpl;
  window.console.warn = () => {}; // the offline fallback warns, by design
  window.eval(code);
  await settle();
  return { window, doc: window.document, errors };
}

const entry = (rank, display_name, points) => ({ rank, display_name, points, duration_ms: 21000, created_at: "2026-12-24T20:00:00Z" });

const reply = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test("without WebGL the ski jump says so plainly, with no errors", async () => {
  const { doc, errors } = await boot(reply({}));
  assert.deepEqual(errors, []);
  assert.equal(doc.getElementById("noWebgl").hidden, false);
  assert.equal(doc.getElementById("startScreen").hidden, true);
  assert.equal(doc.querySelector("a.back").getAttribute("href"), "/");
});

test("the podium shows the top three on their steps and the rest below, mine highlighted", async () => {
  const top = [
    entry(1, "Ryan", 14812),
    entry(2, "<b>Dana</b>", 13870),
    entry(3, "Sam", 12005),
    entry(4, "Lee", 11000),
    entry(5, "Kim", 10450),
  ];
  const { doc, errors } = await boot(reply({ top, mine: top[3], closesAt: null, closed: false }));
  doc.getElementById("noWebglBoardBtn").click();
  await settle();

  assert.deepEqual(errors, []);
  assert.equal(doc.getElementById("podiumScreen").hidden, false);
  assert.match(doc.querySelector(".greeting").textContent, /Happy Holidays from/);
  assert.equal(doc.querySelector(".greeting img").getAttribute("alt"), "Action Furnace");

  // Second, first, third from left to right; names are text, never markup.
  const steps = [...doc.querySelectorAll("#podium .who")].map((n) => n.textContent);
  assert.deepEqual(steps, ["<b>Dana</b>", "Ryan", "Sam"]);
  assert.equal(doc.querySelector("#podium b"), null);
  assert.equal(doc.querySelector("#podium .place-1 .far").textContent, "148.1 m");

  const rows = [...doc.querySelectorAll("#boardList li")];
  assert.deepEqual(rows.map((r) => r.querySelector(".who").textContent), ["Lee", "Kim"]);
  assert.ok(rows[0].classList.contains("mine"));
  assert.match(doc.getElementById("boardStatus").textContent, /You're #4/);
  // Where the jump cannot run, there is nothing to "jump again" in.
  assert.equal(doc.getElementById("podiumAgainBtn").hidden, true);
});

test("with the server down the podium shows this device's jumps and says so", async () => {
  const { window, doc } = await boot(async () => {
    throw new TypeError("offline");
  });
  window.localStorage.setItem("arcade.scores.christmas-2026", JSON.stringify([entry(null, "Ryan", 9050)]));
  doc.getElementById("noWebglBoardBtn").click();
  await settle();

  assert.equal(doc.querySelector("#podium .place-1 .who").textContent, "Ryan");
  assert.match(doc.getElementById("boardStatus").textContent, /offline/);
});

// --- loading ------------------------------------------------------------------

/**
 * Boots the page as a browser with WebGL would: the check passes, and the jump
 * then loads. jsdom never loads images, so Ryan's head stays on its way unless
 * `headSettles`, which makes it fail (the jump carries on without it). The
 * bare WebGL context then makes the renderer fail, as a broken GPU or a failed
 * download would.
 */
async function bootWithWebGL({ headSettles = false } = {}) {
  const { html, code } = loadPage("games/christmas-2026/");
  const reloads = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => {
    if (/navigation/i.test(e.message)) reloads.push(e.message);
  });
  const dom = new JSDOM(html, {
    url: "https://fore-ryan.test/games/christmas-2026/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  const flat = new Proxy({}, { get: (_, p) => (p === "measureText" ? () => ({ width: 10 }) : () => ({ addColorStop() {} })), set: () => true });
  window.HTMLCanvasElement.prototype.getContext = (kind) => (kind === "2d" ? flat : {});
  if (headSettles) {
    Object.defineProperty(window.HTMLImageElement.prototype, "src", {
      set() {
        setTimeout(() => this.onerror?.(new window.Event("error")));
      },
    });
  }
  window.requestAnimationFrame = () => 0;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.fetch = reply({ top: [], mine: null, closesAt: null, closed: false });
  window.console.warn = () => {};
  window.console.error = () => {};
  window.eval(code);
  await settle();
  return { window, doc: window.document, reloads };
}

test("while the jump loads, Start says so instead of ignoring taps", async () => {
  const { doc } = await bootWithWebGL();
  const start = doc.getElementById("startBtn");
  assert.equal(start.disabled, true);
  assert.match(start.textContent, /Loading/);
  assert.equal(doc.getElementById("startBoardBtn").disabled, false, "the podium is there all along");
});

test("if the jump fails to load, Start offers to try again, and does", async () => {
  const { window, doc, reloads } = await bootWithWebGL({ headSettles: true });
  const start = doc.getElementById("startBtn");
  assert.equal(start.disabled, false);
  assert.match(start.textContent, /try again/i);
  start.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(reloads.length, 1, "tapping it reloads the page");
});

