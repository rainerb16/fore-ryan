// The lobby's wait for its web fonts: the 3D signs are painted once, so they
// must wait for the stylesheet and then the fonts, but never for too long.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "arcade-fonts-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, "fonts.mjs");
await build({ entryPoints: ["src/lobby/fonts.ts"], outfile, bundle: true, format: "esm", platform: "neutral", logLevel: "warning" });
const { webFonts } = await import(`file://${outfile}`);

/** A <link> whose stylesheet has `loaded` already, or arrives when `load()` is called. */
function stylesheet(loaded = false) {
  const link = new EventTarget();
  link.sheet = loaded ? {} : null;
  link.dataset = loaded ? { state: "done" } : {};
  link.load = () => {
    link.sheet = {};
    link.dataset.state = "done"; // as the page's own onload does
    link.dispatchEvent(new Event("load"));
  };
  return link;
}

/** document.fonts, recording which faces were asked for and when they settle. */
function fontSet() {
  const asked = [];
  let finish;
  const done = new Promise((r) => (finish = r));
  return { asked, finish, set: { load: (face) => (asked.push(face), done) } };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test("waits for the stylesheet before asking for the fonts it declares", async () => {
  const link = stylesheet();
  const fonts = fontSet();
  let ready = false;
  void webFonts(link, fonts.set, ["700 92px Oswald"], 1000).then(() => (ready = true));
  await tick();
  assert.deepEqual(fonts.asked, [], "asking first would find no fonts and paint the fallback");
  link.load();
  await tick();
  await tick();
  assert.deepEqual(fonts.asked, ["700 92px Oswald"]);
  assert.equal(ready, false);
  fonts.finish();
  await tick();
  assert.equal(ready, true);
});

test("a stylesheet already loaded goes straight to the fonts", async () => {
  const fonts = fontSet();
  void webFonts(stylesheet(true), fonts.set, ["120px Monoton"], 1000);
  await tick();
  assert.deepEqual(fonts.asked, ["120px Monoton"]);
});

test("gives up after its limit, so the arcade still opens without the fonts", async () => {
  const started = Date.now();
  await webFonts(stylesheet(), fontSet().set, ["120px Monoton"], 30);
  assert.ok(Date.now() - started < 500);
});

test("a stylesheet that fails to load does not hold anything up", async () => {
  const link = stylesheet();
  const fonts = fontSet();
  const waiting = webFonts(link, fonts.set, ["120px Monoton"], 1000);
  link.dispatchEvent(new Event("error"));
  fonts.finish();
  await waiting;
});

test("no stylesheet or no font loading API: nothing to wait for", async () => {
  await webFonts(null, undefined, ["120px Monoton"], 1000);
});

test("a stylesheet that failed before the wait began holds nothing up", async () => {
  // The page's onerror marked it done; its error event has long since fired.
  const link = new EventTarget();
  link.sheet = null;
  link.dataset = { state: "done" };
  const fonts = fontSet();
  fonts.finish();
  const started = Date.now();
  await webFonts(link, fonts.set, ["120px Monoton"], 1000);
  assert.ok(Date.now() - started < 200, `waited ${Date.now() - started}ms`);
});

test("the fonts are asked for a moment after the stylesheet arrives, once it applies", async () => {
  const link = stylesheet();
  const fonts = fontSet();
  void webFonts(link, fonts.set, ["120px Monoton"], 1000);
  link.load();
  await Promise.resolve();
  assert.deepEqual(fonts.asked, [], "asked in the same task as the stylesheet switched on");
  await tick();
  assert.deepEqual(fonts.asked, ["120px Monoton"]);
});
