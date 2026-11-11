import "./styles.css";
import { store } from "../../../shared/storage";
import { hasWebGL } from "../../../shared/webgl";
import { distanceAt, newJump, step, timeScale, type Jump } from "../rules";
import { attachInput, readInput, readLook, resetInput } from "./input";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const BEST_KEY = "skijump.best";
const HEAD_SRC = "/assets/ryan/ryan-head-floating.png";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
/** The simulation always steps at this rate, whatever the display does. */
const STEP = 1 / 120;

const startScreen = $("startScreen");
const resultScreen = $("resultScreen");
const hud = $("hud");
const readout = $("readout");
const callout = $("callout");

const metres = (m: number): string => `${m.toFixed(1)} m`;
const best = (): number => parseFloat(store.get(BEST_KEY, "0")) || 0;

function showBest(): void {
  const b = best();
  $("bestLine").textContent = b > 0 ? `Your best: ${metres(b)}` : "";
}

let calloutTimer = 0;
function call(text: string, bad = false, ms = 1400): void {
  callout.textContent = text;
  callout.classList.toggle("bad", bad);
  callout.classList.add("on");
  clearTimeout(calloutTimer);
  if (ms > 0) calloutTimer = window.setTimeout(() => callout.classList.remove("on"), ms);
}
const hideCallout = (): void => callout.classList.remove("on");

async function boot(): Promise<void> {
  if (!hasWebGL()) {
    startScreen.hidden = true;
    $("noWebgl").hidden = false;
    return;
  }

  const [{ createJumpView }, head] = await Promise.all([import("./scene"), loadImage(HEAD_SRC)]);
  const view = createJumpView($<HTMLCanvasElement>("scene"), head);
  attachInput();

  let jump: Jump = newJump();
  /** The state one step back, so the view can draw between the two. */
  const prev: Jump = newJump();
  let playing = false;
  let lastPhase = jump.phase;
  let acc = 0;

  function start(): void {
    jump = newJump();
    Object.assign(prev, jump);
    view.reset();
    lastPhase = jump.phase;
    acc = 0;
    resetInput();
    startScreen.hidden = true;
    resultScreen.hidden = true;
    hud.hidden = false;
    playing = true;
    call("Tap to push off", false, 0);
  }

  function finish(): void {
    playing = false;
    hud.hidden = true;
    hideCallout();
    const d = jump.distance ?? 0;
    if (jump.crashed) {
      $("resultTitle").textContent = "Wipeout! 🎁💥";
      $("resultDistance").textContent = "—";
      $("resultDetail").textContent = "You were still leaning when you landed. Let go just before touchdown.";
    } else {
      const isBest = d > best();
      if (isBest) store.set(BEST_KEY, d.toFixed(2));
      $("resultTitle").textContent = isBest ? "New personal best! 🎄" : "Nice jump!";
      $("resultDistance").textContent = metres(d);
      $("resultDetail").textContent = `${jump.quality} take-off · best ${metres(best())}`;
    }
    resultScreen.hidden = false;
  }

  /** Callouts as the jump moves from one phase to the next. */
  function onPhase(from: Jump["phase"], to: Jump["phase"]): void {
    if (from === "ready" && to === "inrun") call("Tap at the lip!", false, 0);
    if (to === "flight") {
      const q = jump.quality;
      if (jump.tapAt === null) call("Late!", true);
      else call(q === "perfect" ? "PERFECT!" : q === "good" ? "Good!" : "Late!", q === "late");
    }
    if (to === "outrun") call(jump.crashed ? "CRASH!" : metres(jump.distance ?? 0), jump.crashed, 2000);
    if (to === "done") finish();
  }

  $("startBtn").addEventListener("click", start);
  $("againBtn").addEventListener("click", start);
  showBest();

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (playing) {
      // Fixed steps keep every device's jump identical; slow motion just
      // feeds the simulation less time per real second.
      acc += dt * timeScale(jump);
      while (acc >= STEP) {
        Object.assign(prev, jump);
        step(jump, readInput(), STEP);
        acc -= STEP;
        if (jump.phase !== lastPhase) {
          onPhase(lastPhase, jump.phase);
          lastPhase = jump.phase;
        }
      }
      readout.textContent =
        jump.phase === "inrun" ? `${Math.round(jump.speed * 3.6)} km/h`
        : jump.phase === "flight" ? metres(distanceAt(Math.max(jump.x, 0)))
        : jump.distance !== null ? metres(jump.distance) : "";
    }

    view.render(jump, dt, prev, playing ? acc / STEP : 1, readLook());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
