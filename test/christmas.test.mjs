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
