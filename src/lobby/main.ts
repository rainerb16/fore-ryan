import "./lobby.css";
import { byNewest } from "../../shared/games";
import { getLeaderboard, type LeaderboardEntry } from "../../shared/scores";
import { hasWebGL } from "../../shared/webgl";
import { isMuted, listenForTaps, setMuted, stopSound } from "./audio";
import { webFonts } from "./fonts";
import { renderList } from "./list";

type ShowScores = (gameId: string, top: LeaderboardEntry[] | null) => void;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const games = byNewest();
/** The GPU took the 3D arcade away for good, and the list took over. */
let gpuGone = false;
const setListScores = renderList(games);

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The faces the arcade's canvases paint with. */
const FACES = ["700 92px Oswald", "600 26px Poppins", "700 22px Poppins", "120px Monoton", "190px \"Mr Dafoe\""];
/** Long enough for the stylesheet and then the fonts on a slow phone; after that, fallback faces. */
const FONTS_LIMIT_MS = 3000;

/** A visit starts outside the shop; once in, the rest of the visit (this tab) stays inside. */
const INSIDE_KEY = "arcade.inside";
function insideAlready(): boolean {
  // ?outside always starts in the street, for showing it off.
  if (new URLSearchParams(window.location.search).has("outside")) return false;
  try {
    return window.sessionStorage.getItem(INSIDE_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberInside(): void {
  try {
    window.sessionStorage.setItem(INSIDE_KEY, "1");
  } catch {
    // Private mode or blocked storage: they'll just see the street again next time.
  }
}

async function start3d(): Promise<ShowScores> {
  // Loaded on demand, so the fallback list never waits on Three.js.
  const [{ createArcade }, head, logo, guy] = await Promise.all([
    import("./arcade"),
    loadImage("/assets/ryan/ryan-head-floating.png"),
    loadImage("/assets/af/af-logo.webp"),
    loadImage("/assets/af/af-guy-thumbs-up.webp"),
    webFonts(document.getElementById("fonts") as HTMLLinkElement | null, document.fonts, FACES, FONTS_LIMIT_MS),
  ]);

  const title = $("focusTitle");
  const occasion = $("focusOccasion");
  const playBtn = $("playBtn");
  const hintAction = $("hintAction");
  const fade = $("fade");

  const startOutside = !insideAlready();
  const enterWords = window.matchMedia("(hover: none)").matches ? "Tap to enter" : "Click to enter";
  $("enterLabel").textContent = `${enterWords} the arcade`;
  document.body.classList.toggle("outside", startOutside);

  const arcade = createArcade({
    canvas: $<HTMLCanvasElement>("arcade"),
    onGpuGone() {
      // The list every device without 3D gets, scores already in, and no
      // sound from a room that is no longer on screen.
      gpuGone = true;
      fade.classList.remove("on");
      document.body.classList.remove("webgl", "outside");
      document.body.classList.add("no-webgl");
      stopSound();
    },
    startOutside,
    enterWords,
    onEntered() {
      document.body.classList.remove("outside");
      rememberInside();
    },
    games,
    images: { head, logo, guy },
    onFocus(focus) {
      if (focus.kind === "game") {
        title.textContent = focus.game.title;
        occasion.textContent = `${focus.game.occasion} ${focus.game.year}`;
        playBtn.textContent = "PLAY";
        hintAction.textContent = "play";
      } else {
        title.textContent = "Out of order";
        occasion.textContent = "Rainer's on it";
        playBtn.textContent = "KICK";
        hintAction.textContent = "give it a kick";
      }
    },
    onLaunchStart() {
      fade.classList.add("on");
    },
  });

  // The on-screen buttons drive the same handlers as the keyboard.
  const press = (key: string) => () => window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  $("prevBtn").addEventListener("click", press("ArrowLeft"));
  $("nextBtn").addEventListener("click", press("ArrowRight"));
  $("playBtn").addEventListener("click", press("Enter"));
  $("enterBtn").addEventListener("click", () => arcade.enter());

  // Tabbing through the hidden list moves the camera along with it.
  $("cabinetList").addEventListener("focusin", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-game]")?.dataset.game;
    if (id) arcade.focusGame(id);
  });

  // Back from a game restores this page from cache with the fade still on.
  window.addEventListener("pageshow", () => fade.classList.remove("on"));

  await arcade.ready;

  return (id, top) => arcade.setScores(id, top ? { state: "ready", top } : { state: "error" });
}

/** The arcade's sound: off until the first tap or key press, and mutable. */
function setUpSound(): void {
  const muteBtn = $<HTMLButtonElement>("muteBtn");
  const show = (): void => {
    muteBtn.textContent = isMuted() ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-pressed", String(isMuted()));
  };
  show();
  muteBtn.addEventListener("click", () => {
    setMuted(!isMuted());
    show();
    // Otherwise Enter or Space would press it again instead of reaching the arcade.
    muteBtn.blur();
  });
  listenForTaps();
}

async function boot(): Promise<void> {
  // Asked for now, alongside the 3D arcade loading, not after it.
  const scores = games.map((game) => {
    const top = getLeaderboard(game.id, 3)
      .then((board) => board.top)
      .catch(() => null);
    void top.then((t) => setListScores.get(game.id)?.(t));
    return { id: game.id, top };
  });

  let showOnScreens: ShowScores | null = null;
  if (hasWebGL($<HTMLCanvasElement>("arcade"))) {
    try {
      showOnScreens = await start3d();
      // Lost while loading, and the list has taken over: don't bring a still frame back.
      if (gpuGone) showOnScreens = null;
      else {
        document.body.classList.add("webgl");
        setUpSound();
      }
    } catch (err) {
      console.error("The 3D arcade failed to start; showing the list instead.", err);
    }
  }
  if (!showOnScreens) document.body.classList.add("no-webgl");

  const show = showOnScreens;
  if (show) for (const { id, top } of scores) void top.then((t) => show(id, t));
}

void boot();
