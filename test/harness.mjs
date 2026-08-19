// Boots the built bundle inside jsdom with a stubbed canvas and a seeded PRNG,
// and hands back the controls a test needs to play the game. Shared by the smoke
// test and the UI tests so there is one description of how the game starts.
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";

const gradient = { addColorStop() {} };

/** Records what was drawn as text, so tests can see which glyphs a level uses. */
function stubContext(drawnText, drawnImages) {
  return new Proxy(
    {
      canvas: null,
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      measureText: () => ({ width: 10 }),
      fillText: (text) => drawnText.push(text),
      drawImage: () => drawnImages.push(1),
    },
    {
      get: (target, prop) => (prop in target ? target[prop] : () => {}),
      set: () => true,
    },
  );
}

/**
 * @param {object} [options]
 * @param {Function} [options.fetch] stub for window.fetch; omitted means offline
 * @param {number} [options.seed] PRNG seed, so runs are reproducible
 */
export function bootGame({ fetch, seed = 0x9e3779b9 } = {}) {
  const html = readFileSync("dist/index.html", "utf8");
  const bundle = readdirSync("dist/assets").find((f) => f.endsWith(".js"));
  const code = readFileSync(`dist/assets/${bundle}`, "utf8");

  // A real origin is required or localStorage throws, which the game's storage
  // helper would quietly swallow — leaving persistence untested.
  const dom = new JSDOM(html, {
    url: "https://fore-ryan.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const doc = window.document;

  const drawnText = [];
  const drawnImages = [];
  window.HTMLCanvasElement.prototype.getContext = () => stubContext(drawnText, drawnImages);
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 1024 });
  Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 720 });

  // mulberry32, so gameplay outcomes repeat exactly run to run.
  let state = seed;
  window.Math.random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  if (fetch) window.fetch = fetch;

  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error || e.message));

  // Frames are driven by hand so the test controls how much time passes.
  let pending = [];
  window.requestAnimationFrame = (cb) => pending.push(cb);

  window.eval(code);

  const el = (id) => doc.getElementById(id);
  const text = (id) => el(id).textContent.trim();
  const click = (id) => el(id).dispatchEvent(new window.MouseEvent("click"));
  const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

  const canvas = el("game");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 720 });
  const holdFire = (clientX = 500) =>
    canvas.dispatchEvent(new window.MouseEvent("mousedown", { clientX }));

  const type = (id, value) => {
    const input = el(id);
    input.value = value;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  /** key("keydown", " ", { repeat: true }) — a held key, as the browser sends it. */
  const key = (kind, name, opts = {}) =>
    window.dispatchEvent(new window.KeyboardEvent(kind, { key: name, bubbles: true, ...opts }));

  const submit = (id) => el(id).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  let ts = 0;
  /**
   * Advance n frames, yielding to the event loop periodically. Without the yield
   * the game's own setTimeout calls — the ones that reveal the end-of-round
   * overlays — could never fire and a test would silently miss them.
   */
  async function tick(n, onError) {
    for (let i = 0; i < n; i++) {
      const cb = pending.pop();
      if (!cb) throw new Error(`frame loop stopped after ${i} of ${n} ticks`);
      pending = [];
      ts += 16.7;
      cb(ts);
      if (errors.length) {
        if (onError) onError(errors[0], i);
        throw errors[0] instanceof Error ? errors[0] : new Error(String(errors[0]));
      }
      if (i % 60 === 59) await settle();
    }
  }

  /** endRun and endLose both park the HUD before their overlay timer runs. */
  const roundOver = () => el("hud").classList.contains("pregame");

  return {
    window,
    doc,
    el,
    text,
    click,
    settle,
    tick,
    holdFire,
    type,
    submit,
    roundOver,
    key,
    errors,
    drawnText,
    drawnImages,
  };
}
