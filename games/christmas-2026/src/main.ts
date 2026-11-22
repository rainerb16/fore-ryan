import "./styles.css";
import { runLoop } from "../../../shared/loop";
import { runTokens } from "../../../shared/scores";
import { store } from "../../../shared/storage";
import { hasWebGL, unlessContextLost } from "../../../shared/webgl";
import { CHRISTMAS_LINE_M, distanceAt, GAME_ID, newJump, PHYSICS, step, timeScale, type Jump } from "../rules";
import { hush, isMuted, JINGLE_SECONDS, setLayers, setMuted, sfx } from "./audio";
import { armPost, loadPodium } from "./board";
import { buildDancer } from "./dancer";
import { buildDisco } from "./disco";
import { createStepClock } from "./clock";
import { attachInput, inputUntil, readLook, resetInput } from "./input";

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

/** Disabled and saying "Loading…" in the page itself, until the jump has loaded. */
const startBtn = $<HTMLButtonElement>("startBtn");

const muteBtn = $<HTMLButtonElement>("muteBtn");
function showMute(): void {
  muteBtn.textContent = isMuted() ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-pressed", String(isMuted()));
}
muteBtn.addEventListener("click", () => {
  setMuted(!isMuted());
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

  if (!hasWebGL($<HTMLCanvasElement>("scene"))) {
    startScreen.hidden = true;
    $("noWebgl").hidden = false;
    $("podiumAgainBtn").hidden = true;
    return;
  }

  buildDancer($("dancer"));
  buildDisco($("disco"));
  const [{ createJumpView, SLEIGH_CROSSING }, head] = await Promise.all([import("./scene"), loadImage(HEAD_SRC)]);
  const canvas = $<HTMLCanvasElement>("scene");
  const view = createJumpView(canvas, head);
  // The scene's shaders compile in the background first: drawing straight away
  // would compile them one by one inside that frame, freezing the page.
  await unlessContextLost(canvas, view.compile());
  attachInput();

  let jump: Jump = newJump();
  /** The state one step back, so the view can draw between the two. */
  const prev: Jump = newJump();
  let playing = false;
  let lastPhase = jump.phase;
  /** Steps the simulation with real time, applying each tap at the step it happened in. */
  const clock = createStepClock(STEP);
  /** This jump's run token, asked for as it begins so the server has its own clock on it. */
  const tokens = runTokens(GAME_ID);
  let token: Promise<string | null> = Promise.resolve(null);
  /** Whether this jump cleared the Christmas line. */
  let christmas = false;

  function start(): void {
    hush();
    christmas = false;
    jump = newJump();
    Object.assign(prev, jump);
    view.reset();
    lastPhase = jump.phase;
    clock.reset();
    resetInput();
    token = tokens.next();
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
    showHint(d);
    resultScreen.hidden = false;
    void armPost(jump, token, openPodium);
  }

  /** Tells a jump that missed the payoff that there is one, and how close it came. */
  function showHint(d: number): void {
    const hint = $("resultHint");
    hint.hidden = christmas;
    if (christmas) return;
    if (jump.crashed) {
      hint.textContent = d >= CHRISTMAS_LINE_M
        ? "🎁 You flew past the gold line! Land it cleanly for a holiday surprise."
        : `🎁 Land cleanly past the gold line (${CHRISTMAS_LINE_M} m) for a holiday surprise.`;
    } else {
      hint.textContent = `🎁 ${Math.max(0.1, CHRISTMAS_LINE_M - d).toFixed(1)} m short of the gold line. Land past it for a holiday surprise!`;
    }
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
        sfx.land(d, true);
        sfx.jingleBells();
        view.celebrate(JINGLE_SECONDS, sfx.boom);
      } else {
        call(metres(d), false, 2000);
        sfx.land(d);
      }
    }
    if (to === "done") finish();
  }

  // The shadow and bloom passes only compile when drawn, so draw one frame
  // now, behind the start screen, before Start can begin a jump.
  view.render(jump, 0, prev, 1, readLook());

  $("againBtn").addEventListener("click", start);
  $("podiumAgainBtn").addEventListener("click", start);
  showBest();

  const frame = (time: number, dt: number): void => {
    if (playing) {
      // Fixed steps keep every device's jump identical; slow motion just
      // feeds the simulation less time per real second.
      clock.advance(
        time * 1000,
        (endMs) => {
          Object.assign(prev, jump);
          step(jump, inputUntil(endMs), STEP);
          if (jump.phase !== lastPhase) {
            onPhase(lastPhase, jump.phase);
            lastPhase = jump.phase;
          }
        },
        () => timeScale(jump),
      );
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
    view.render(jump, dt, prev, playing ? clock.blend : 1, readLook());
  };
  // Behind the menus only snow falls, unless fireworks are going off.
  runLoop(frame, view.lowPower ? { idleFps: 30, busy: () => playing || view.celebrating() } : {});

  // Last, so nothing above can fail once Start works (and a failure's retry
  // never shares the button with a working Start).
  startBtn.addEventListener("click", start);
  startBtn.disabled = false;
  startBtn.textContent = "Tap to start";
}

void boot().catch((err: unknown) => {
  // A failed download or a GPU that can't run the scene: offer another go
  // rather than leave Start doing nothing.
  console.error("The ski jump failed to load.", err);
  startBtn.textContent = "Couldn't load. Tap to try again";
  startBtn.disabled = false;
  startBtn.addEventListener("click", () => window.location.reload());
});
