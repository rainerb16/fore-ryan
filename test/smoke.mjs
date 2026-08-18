// Boot check: run the built bundle in jsdom with a stubbed 2D context, play both
// modes, and confirm nothing throws. Math.random is seeded so a run either always
// passes or always fails — never intermittently.
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync("dist/index.html", "utf8");
const bundle = readdirSync("dist/assets").find((f) => f.endsWith(".js"));
const code = readFileSync(`dist/assets/${bundle}`, "utf8");

const gradient = { addColorStop() {} };
const ctxStub = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
  },
  {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: () => true,
  },
);

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;

window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 1024 });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 720 });

// Seeded PRNG (mulberry32) so gameplay outcomes are reproducible.
let seed = 0x9e3779b9;
window.Math.random = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const errors = [];
window.addEventListener("error", (e) => errors.push(e.error || e.message));

// Drive frames manually so we control how many ticks run.
let pending = [];
window.requestAnimationFrame = (cb) => pending.push(cb);

window.eval(code);

const fail = (msg) => {
  console.error("SMOKE FAIL:", msg);
  if (errors[0]) console.error(errors[0]);
  process.exit(1);
};

if (errors.length) fail("threw during bootstrap");

let ts = 0;
function tick(n) {
  for (let i = 0; i < n; i++) {
    const cb = pending.pop();
    if (!cb) fail(`frame loop stopped after ${i} of ${n} ticks`);
    pending = [];
    ts += 16.7;
    cb(ts);
    if (errors.length) fail(`threw on tick ${i}`);
  }
}

const el = (id) => doc.getElementById(id);
const text = (id) => el(id).textContent.trim();
const click = (id) => el(id).dispatchEvent(new window.MouseEvent("click"));

const canvas = el("game");
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 720 });
const holdFire = () => canvas.dispatchEvent(new window.MouseEvent("mousedown", { clientX: 500 }));

if (!text("startHint")) fail("startHint never populated — bootstrap did not finish");
console.log("boot ok            :", text("startHint"));

// --- birthday round ---------------------------------------------------------
click("startBtn");
holdFire();
tick(240);
if (el("level").hidden !== true) fail("birthday round should not show the level pill");
console.log("birthday · 4s      :", text("score"), "·", text("lives"));

// --- contest mode -----------------------------------------------------------
click("contestBtn");
if (el("level").hidden) fail("contest mode should show the level pill");
if (text("level") !== "LVL 1") fail(`contest should start on level 1, got ${text("level")}`);
holdFire();
tick(1800); // ~30s, comfortably past level 1's par

const level = Number(text("level").replace(/\D/g, ""));
const points = Number(text("points").replace(/\D/g, ""));
if (level < 2) fail(`never cleared level 1 in 30s (level ${level}, ${points} pts)`);
if (points <= 0) fail("cleared a level but banked no points");
console.log("contest · 30s      :", text("level"), "·", text("score"), "·", text("points"));

// Play on until the run ends, then check the scorecard rendered.
for (let i = 0; i < 40 && el("runScreen").hidden; i++) {
  holdFire();
  tick(300);
}
if (el("runScreen").hidden) {
  console.log("contest run        : still alive after ~4min (no crash)");
} else {
  const rows = el("runBreakdown").children.length;
  if (rows < 1) fail("run ended but the scorecard is empty");
  console.log("run over           :", text("runHeadline"), `· ${rows} levels on the card`);
  console.log("                    ", text("runStats"));
}

console.log("SMOKE PASS");
