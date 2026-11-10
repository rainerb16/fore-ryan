// The ski jump page without WebGL, as jsdom (and any browser that cannot do
// 3D) sees it: it must explain itself rather than throw.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { loadPage } from "./harness.mjs";

test("without WebGL the ski jump says so plainly, with no errors", async () => {
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
  window.eval(code);
  await new Promise((r) => setTimeout(r, 30));

  const doc = window.document;
  assert.deepEqual(errors, []);
  assert.equal(doc.getElementById("noWebgl").hidden, false);
  assert.equal(doc.getElementById("startScreen").hidden, true);
  assert.equal(doc.querySelector("a.back").getAttribute("href"), "/");
});
