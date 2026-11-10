import "./lobby.css";
import { byNewest } from "../../shared/games";
import { getLeaderboard, type LeaderboardEntry } from "../../shared/scores";
import { hasWebGL } from "../../shared/webgl";
import { renderList } from "./list";

type ShowScores = (gameId: string, top: LeaderboardEntry[] | null) => void;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const games = byNewest();
const setListScores = renderList(games);

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Canvas text only uses a web font once it has loaded. Don't wait forever. */
function webFonts(): Promise<unknown> {
  const faces = ["700 92px Oswald", "600 26px Poppins", "700 22px Poppins", "120px Monoton", "190px \"Mr Dafoe\""];
  const load = Promise.all(faces.map((f) => document.fonts.load(f)));
  return Promise.race([load, new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
}

async function start3d(): Promise<ShowScores> {
  // Loaded on demand, so the fallback list never waits on Three.js.
  const [{ createArcade }, head, logo, guy] = await Promise.all([
    import("./arcade"),
    loadImage("/assets/ryan/ryan-head-floating.png"),
    loadImage("/assets/af/af-logo.png"),
    loadImage("/assets/af/af-guy-thumbs-up.png"),
    webFonts(),
  ]);

  const title = $("focusTitle");
  const occasion = $("focusOccasion");
  const fade = $("fade");

  const arcade = createArcade({
    canvas: $<HTMLCanvasElement>("arcade"),
    games,
    images: { head, logo, guy },
    onFocus(game) {
      title.textContent = game.title;
      occasion.textContent = `${game.occasion} ${game.year}`;
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

  // Tabbing through the hidden list moves the camera along with it.
  $("cabinetList").addEventListener("focusin", (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-game]")?.dataset.game;
    if (id) arcade.focusGame(id);
  });

  // Back from a game restores this page from cache with the fade still on.
  window.addEventListener("pageshow", () => fade.classList.remove("on"));

  return (id, top) => arcade.setScores(id, top ? { state: "ready", top } : { state: "error" });
}

async function boot(): Promise<void> {
  let showOnScreens: ShowScores | null = null;
  if (hasWebGL()) {
    try {
      showOnScreens = await start3d();
      document.body.classList.add("webgl");
    } catch (err) {
      console.error("The 3D arcade failed to start; showing the list instead.", err);
    }
  }
  if (!showOnScreens) document.body.classList.add("no-webgl");

  for (const game of games) {
    getLeaderboard(game.id, 3)
      .then((board) => board.top)
      .catch(() => null)
      .then((top) => {
        setListScores.get(game.id)?.(top);
        showOnScreens?.(game.id, top);
      });
  }
}

void boot();
