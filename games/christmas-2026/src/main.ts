import "./styles.css";
import { startRun } from "../../../shared/scores";
import { store } from "../../../shared/storage";
import { hasWebGL } from "../../../shared/webgl";
import { CHRISTMAS_LINE_M, distanceAt, GAME_ID, newJump, PHYSICS, step, timeScale, type Jump } from "../rules";
import { hush, initAudio, isMuted, JINGLE_SECONDS, setLayers, setMuted, sfx } from "./audio";
import { armPost, loadPodium } from "./board";
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
const podiumScreen = $("podiumScreen");
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

const muteBtn = $<HTMLButtonElement>("muteBtn");
function showMute(): void {
  muteBtn.textContent = isMuted() ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-pressed", String(isMuted()));
}
muteBtn.addEventListener("click", () => {
  setMuted(!isMuted());
  if (!isMuted()) initAudio();
  showMute();
  // Otherwise Space would press this button again instead of jumping.
  muteBtn.blur();
});
showMute();

/** Real seconds Santa's sleigh is in the sky: its crossing, part of it in slow motion. */
const sleighSeconds = (crossing: number): number =>
  PHYSICS.slowmoFor / PHYSICS.slowmoScale + Math.max(0, crossing - PHYSICS.slowmoFor);

function openPodium(note = ""): void {
  for (const screen of [startScreen, resultScreen, $("noWebgl")]) screen.hidden = true;
  podiumScreen.hidden = false;
  void loadPodium(note);
}

async function boot(): Promise<void> {
  // The podium needs no 3D, so it is there even where the jump cannot run.
  for (const id of ["startBoardBtn", "resultBoardBtn", "noWebglBoardBtn"]) $(id).addEventListener("click", () => openPodium());

  if (!hasWebGL()) {
    startScreen.hidden = true;
    $("noWebgl").hidden = false;
    $("podiumAgainBtn").hidden = true;
    return;
  }

  const [{ createJumpView, SLEIGH_CROSSING }, head] = await Promise.all([import("./scene"), loadImage(HEAD_SRC)]);
  const view = createJumpView($<HTMLCanvasElement>("scene"), head);
  attachInput();

  let jump: Jump = newJump();
  /** The state one step back, so the view can draw between the two. */
  const prev: Jump = newJump();
  let playing = false;
  let lastPhase = jump.phase;
  let acc = 0;
  /** This jump's run token, asked for as it begins so the server has its own clock on it. */
  let token: Promise<string | null> = Promise.resolve(null);
  /** Whether this jump cleared the Christmas line. */
  let christmas = false;

  function start(): void {
    initAudio();
    hush();
    christmas = false;
    jump = newJump();
    Object.assign(prev, jump);
    view.reset();
    lastPhase = jump.phase;
    acc = 0;
    resetInput();
    token = startRun(GAME_ID);
    startScreen.hidden = true;
    resultScreen.hidden = true;
    podiumScreen.hidden = true;
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
      $("resultTitle").textContent = christmas ? "Happy Holidays! 🎆" : isBest ? "New personal best! 🎄" : "Nice jump!";
      $("resultDistance").textContent = metres(d);
      $("resultDetail").textContent =
        `${jump.quality} take-off · ${christmas && isBest ? "new personal best!" : `best ${metres(best())}`}`;
      if (isBest && !christmas) sfx.best();
    }
    resultScreen.hidden = false;
    void armPost(jump, token, openPodium);
  }

  /** Callouts as the jump moves from one phase to the next. */
  function onPhase(from: Jump["phase"], to: Jump["phase"]): void {
    if (from === "ready" && to === "inrun") {
      call("Tap at the lip!", false, 0);
      sfx.pushOff();
    }
    if (to === "flight") {
      const q = jump.quality;
      sfx.takeoff(q ?? "late");
      sfx.sleigh(sleighSeconds(SLEIGH_CROSSING));
      if (jump.tapAt === null) call("Late!", true);
      else call(q === "perfect" ? "PERFECT!" : q === "good" ? "Good!" : "Late!", q === "late");
    }
    if (to === "outrun") {
      const d = jump.distance ?? 0;
      if (jump.crashed) {
        call("CRASH!", true, 2000);
        sfx.crash();
      } else if (d >= CHRISTMAS_LINE_M) {
        // Past the line: the holiday payoff.
        christmas = true;
        call("HAPPY HOLIDAYS!", false, 4000);
        sfx.land(d);
        sfx.jingleBells();
        view.celebrate(JINGLE_SECONDS, sfx.boom);
      } else {
        call(metres(d), false, 2000);
        sfx.land(d);
      }
    }
    if (to === "done") finish();
  }

  $("startBtn").addEventListener("click", start);
  $("againBtn").addEventListener("click", start);
  $("podiumAgainBtn").addEventListener("click", start);
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
      // Skis hiss on the inrun and the outrun; the wind picks up in flight, more when leaning in.
      const air = Math.hypot(jump.vx, jump.vy);
      if (jump.phase === "inrun") setLayers(Math.min(1, jump.speed / 26), Math.min(1, jump.speed / 26) * 0.25);
      else if (jump.phase === "flight") setLayers(0, Math.min(1, air / 28) * (jump.holding ? 1 : 0.6), timeScale(jump) < 1);
      else if (jump.phase === "outrun") setLayers(jump.crashed ? 0 : Math.min(1, jump.speed / 26) * 0.8, 0);
      else setLayers(0, 0);
      readout.textContent =
        jump.phase === "inrun" ? `${Math.round(jump.speed * 3.6)} km/h`
        : jump.phase === "flight" ? metres(distanceAt(Math.max(jump.x, 0)))
        : jump.distance !== null ? metres(jump.distance) : "";
    }

    if (!playing) setLayers(0, 0);
    view.render(jump, dt, prev, playing ? acc / STEP : 1, readLook());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
