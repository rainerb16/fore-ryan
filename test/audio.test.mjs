// The shared sound engine, and that each game wires it up, run against a fake
// AudioContext. Phones pause audio whenever they like (iOS calls it
// "interrupted"), so the engine must restart it on the next tap, every time.
import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { loadPage } from "./harness.mjs";

const engine = buildSync({
  entryPoints: ["shared/audio.ts"],
  bundle: true,
  format: "iife",
  globalName: "SharedAudio",
  write: false,
  logLevel: "warning",
}).outputFiles[0].text;

/** Any audio node or param: every property is another stub, and connect() chains. */
function stub() {
  const own = {};
  return new Proxy(function () {}, {
    get: (_, p) => {
      if (p in own) return own[p];
      if (p === "connect") return (next) => next;
      if (p === "then" || typeof p === "symbol") return undefined;
      return (own[p] = stub());
    },
    set: (_, p, v) => ((own[p] = v), true),
    apply: () => stub(),
  });
}

/** Installs a fake AudioContext on `window`; returns the contexts it makes. */
function fakeAudio(window, opts = {}) {
  const { state = "suspended" } = opts;
  const made = [];
  class FakeContext {
    constructor() {
      this.state = state;
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = stub();
      this.resumes = 0;
      this.suspends = 0;
      const ctx = new Proxy(this, { get: (t, p) => (p in t ? t[p] : stub()) });
      made.push(ctx);
      return ctx;
    }
    resume() {
      this.resumes++;
      if (opts.refuse) return Promise.reject(new Error("not allowed to start"));
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.suspends++;
      this.state = "suspended";
      return Promise.resolve();
    }
  }
  window.AudioContext = FakeContext;
  made.allow = () => (opts.refuse = false);
  return made;
}

function setHidden(window, hidden) {
  Object.defineProperty(window.document, "hidden", { get: () => hidden, configurable: true });
  window.document.dispatchEvent(new window.Event("visibilitychange"));
}

const tap = (window, target = window) => {
  for (const type of ["pointerdown", "pointerup", "touchend", "click"]) {
    target.dispatchEvent(new window.Event(type, { bubbles: true }));
  }
};

function bootEngine({ audioSession, ...fake } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://fore-ryan.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const made = fakeAudio(window, fake);
  if (audioSession) window.navigator.audioSession = audioSession;
  window.eval(`${engine}\nwindow.SharedAudio = SharedAudio;`);
  return { window, made, createAudio: window.SharedAudio.createAudio };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("a tap restarts sound the phone has interrupted", async () => {
  const { window, made, createAudio } = bootEngine();
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  tap(window);
  await settle();
  assert.equal(made.length, 1, "one context, however many taps");
  assert.equal(made[0].state, "running");

  // A notification, a lock screen, a phone call: iOS parks the context.
  made[0].state = "interrupted";
  const before = made[0].resumes;
  tap(window);
  await settle();
  assert.ok(made[0].resumes > before, "an interrupted context is resumed on the next tap");
  assert.equal(made[0].state, "running");
});

test("muted, nothing starts, and muting pauses what was playing", async () => {
  const { window, made, createAudio } = bootEngine();
  window.localStorage.setItem("t.muted", "1");
  const audio = createAudio({ muteKey: "t.muted", level: 0.8 });
  audio.listen();
  tap(window);
  assert.equal(made.length, 0);

  audio.setMuted(false);
  assert.equal(made.length, 1, "unmuting, itself a tap, starts the sound");
  await settle();
  audio.setMuted(true);
  await new Promise((r) => setTimeout(r, 200)); // past the fade
  assert.equal(made[0].state, "suspended");
  assert.equal(window.localStorage.getItem("t.muted"), "1");
  tap(window);
  assert.equal(made[0].state, "suspended", "taps leave muted sound alone");
});

test("on iPhone it plays even with the ringer on silent", () => {
  const audioSession = { type: "auto" };
  const { window, createAudio } = bootEngine({ audioSession });
  createAudio({ muteKey: "t.muted", level: 0.8, playOnSilent: true }).listen();
  tap(window);
  assert.equal(audioSession.type, "playback");
});

test("browsers without an audio session still start", () => {
  const { window, made, createAudio } = bootEngine();
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  tap(window);
  assert.equal(made.length, 1);
});

test("a hidden page goes quiet, and comes back when shown", async () => {
  const { window, made, createAudio } = bootEngine();
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  tap(window);
  await settle();
  setHidden(window, true);
  assert.equal(made[0].state, "suspended");
  tap(window);
  assert.equal(made[0].state, "suspended", "no sound from a hidden tab");
  setHidden(window, false);
  await settle();
  assert.equal(made[0].state, "running");
});

test("leaving the page silences it and runs the page's own cleanup", async () => {
  const { window, made, createAudio } = bootEngine();
  let left = 0;
  createAudio({ muteKey: "t.muted", level: 0.8, onStop: () => left++ }).listen();
  tap(window);
  await settle();
  window.dispatchEvent(new window.Event("pagehide"));
  assert.equal(left, 1);
  assert.equal(made[0].state, "suspended");
});

test("a refused restart is retried on the next tap, without an error", async () => {
  const { window, made, createAudio } = bootEngine({ refuse: true });
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  tap(window);
  await settle();
  assert.equal(made[0].state, "suspended");
  made.allow();
  tap(window);
  await settle();
  assert.equal(made[0].state, "running");
});

test("a key press starts it too", () => {
  const { window, made, createAudio } = bootEngine();
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: " " }));
  assert.equal(made.length, 1);
});

test("back from another page, it resumes", async () => {
  const { window, made, createAudio } = bootEngine();
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  tap(window);
  await settle();
  window.dispatchEvent(new window.Event("pagehide"));
  window.dispatchEvent(Object.assign(new window.Event("pageshow"), { persisted: true }));
  await settle();
  assert.equal(made[0].state, "running");
});

test("muting fades out, stops what was queued, then pauses", async () => {
  const { window, made, createAudio } = bootEngine();
  let left = 0;
  const audio = createAudio({ muteKey: "t.muted", level: 0.8, onStop: () => left++ });
  audio.listen();
  tap(window);
  await settle();
  audio.setMuted(true);
  assert.equal(left, 1, "a song still queued is dropped, not resumed on unmute");
  assert.equal(made[0].state, "running", "still fading, so no click");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(made[0].state, "suspended");
  audio.setMuted(false);
  await settle();
  assert.equal(made[0].state, "running");
});

test("unmuting during the fade is not undone by it", async () => {
  const { window, made, createAudio } = bootEngine();
  const audio = createAudio({ muteKey: "t.muted", level: 0.8 });
  audio.listen();
  tap(window);
  await settle();
  audio.setMuted(true);
  audio.setMuted(false);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(made[0].state, "running");
});

test("a closed context is replaced, not retried forever", async () => {
  const { window, made, createAudio } = bootEngine();
  createAudio({ muteKey: "t.muted", level: 0.8 }).listen();
  tap(window);
  await settle();
  made[0].state = "closed";
  tap(window);
  assert.equal(made.length, 2);
});

test("a page's setup failing still leaves its sound effects working", () => {
  const { window, made, createAudio } = bootEngine();
  window.console.error = () => {};
  const audio = createAudio({
    muteKey: "t.muted",
    level: 0.8,
    onReady: () => {
      throw new Error("broken room tone");
    },
  });
  audio.listen();
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error));
  tap(window);
  assert.deepEqual(errors, [], "no uncaught error from the tap");
  assert.equal(made.length, 1);
  assert.ok(audio.master, "the engine itself is up");
});

test("pages that play continuously can leave other apps' music alone", () => {
  const audioSession = { type: "auto" };
  const { window, createAudio } = bootEngine({ audioSession });
  createAudio({ muteKey: "t.muted", level: 0.8, playOnSilent: false }).listen();
  tap(window);
  assert.equal(audioSession.type, "auto");
});

test("the sound is built once, when it first starts", () => {
  const { window, made, createAudio } = bootEngine();
  let ready = 0;
  const audio = createAudio({ muteKey: "t.muted", level: 0.8, onReady: () => ready++ });
  audio.listen();
  assert.equal(audio.context, null);
  tap(window);
  tap(window);
  assert.equal(ready, 1);
  assert.equal(audio.context, made[0]);
});

test("stopped for good, it goes quiet and no tap brings it back", async () => {
  const { window, made, createAudio } = bootEngine();
  const audio = createAudio({ muteKey: "t.muted", level: 0.8 });
  audio.listen();
  tap(window);
  await settle();
  audio.stop();
  await settle();
  assert.equal(made[0].state, "suspended");
  tap(window);
  window.document.dispatchEvent(new window.Event("visibilitychange"));
  await settle();
  assert.equal(made[0].state, "suspended");
  assert.equal(window.localStorage.getItem("t.muted"), null, "not remembered as the player muting it");
});

// --- the games use it --------------------------------------------------------

function bootPage(page) {
  const { html, code } = loadPage(page);
  const dom = new JSDOM(html, {
    url: `https://fore-ryan.test/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  const made = fakeAudio(window);
  const flat = stub();
  flat.measureText = () => ({ width: 10 });
  window.HTMLCanvasElement.prototype.getContext = (kind) => (kind === "2d" ? flat : null);
  window.requestAnimationFrame = () => 0;
  window.fetch = () => Promise.reject(new Error("offline"));
  window.eval(code);
  return { window, made };
}

for (const [name, page, target] of [
  ["golf", "games/birthday-2026/", "game"],
  ["ski jump", "games/christmas-2026/", "scene"],
]) {
  test(`${name}: any tap, not just Start, restarts interrupted sound`, async () => {
    const { window, made } = bootPage(page);
    const canvas = window.document.getElementById(target);
    tap(window, canvas);
    await settle();
    assert.equal(made.length, 1, "the first tap anywhere starts the sound");
    made[0].state = "interrupted";
    tap(window, canvas);
    await settle();
    assert.equal(made[0].state, "running");
  });
}
