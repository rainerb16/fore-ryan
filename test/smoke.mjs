// Throwaway boot check: run the built bundle in jsdom with a stubbed 2D context
// and confirm the game initialises and ticks frames without throwing.
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
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set() {
      return true;
    },
  },
);

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 1024 });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 720 });

const errors = [];
window.addEventListener("error", (e) => errors.push(e.error || e.message));

// Drive frames manually so we control how many ticks run.
const frames = [];
window.requestAnimationFrame = (cb) => {
  frames.push(cb);
  return frames.length;
};

window.eval(code);

if (errors.length) {
  console.error("BOOT FAILED:", errors[0]);
  process.exit(1);
}

const doc = window.document;
const hint = doc.getElementById("startHint").textContent;
if (!hint) throw new Error("startHint never populated — bootstrap did not finish");

// Start a round, then tick ~4 seconds of frames with fire held down.
doc.getElementById("startBtn").dispatchEvent(new window.MouseEvent("click"));

const canvas = doc.getElementById("game");
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 720 });
canvas.dispatchEvent(new window.MouseEvent("mousedown", { clientX: 500 }));

let ts = 0;
for (let i = 0; i < 240; i++) {
  const cb = frames.pop();
  if (!cb) throw new Error(`frame loop stopped at tick ${i}`);
  frames.length = 0;
  ts += 16.7;
  cb(ts);
}

if (errors.length) {
  console.error("RUNTIME ERROR:", errors[0]);
  process.exit(1);
}

console.log("boot ok           :", hint);
console.log("frames ticked     : 240 (~4s)");
console.log("score pill        :", doc.getElementById("score").textContent);
console.log("lives pill        :", doc.getElementById("lives").textContent.replace(/<[^>]+>/g, ""));
console.log("hud pregame class :", doc.getElementById("hud").className || "(none — playing)");
console.log("SMOKE PASS");
