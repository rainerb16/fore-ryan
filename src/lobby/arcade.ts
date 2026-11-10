// The 3D arcade: a row of cabinets and a camera on rails in front of them.
// Arrow keys, swipes, the on-screen buttons, or a tap move between games;
// Enter, PLAY, or a tap on the focused cabinet zooms into its screen and loads it.

import { MathUtils, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, type Object3D } from "three";
import type { GameEntry } from "../../shared/games";
import { createView, isLowPower, prefersReducedMotion, runLoop } from "../../shared/three";
import { buildCabinet, CABINET_WIDTH, type Cabinet, type CabinetSpec } from "./cabinet";
import { applyLook } from "./look";
import { buildPoster } from "./poster";
import { buildRoom, WALL_Z } from "./room";
import type { Scores } from "./screen";

const SPACING = CABINET_WIDTH + 0.26;
const ROW_Z = WALL_Z + 0.5;
const FOV = 55;
/** Enough cabinets that the row reads as an arcade, not a lone machine. */
const MIN_CABINETS = 5;

export interface Arcade {
  setScores(gameId: string, scores: Scores): void;
  focusGame(gameId: string): void;
}

export interface ArcadeImages {
  head: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  guy: HTMLImageElement | null;
}

export interface ArcadeOptions {
  canvas: HTMLCanvasElement;
  games: GameEntry[];
  images: ArcadeImages;
  onFocus(game: GameEntry): void;
  onLaunchStart(game: GameEntry): void;
}

/** Coming soon on the left, the games newest first, broken machines after. */
function lineUp(games: GameEntry[]): CabinetSpec[] {
  const specs: CabinetSpec[] = [{ kind: "soon" }];
  games.forEach((game, i) => specs.push({ kind: "game", game, offset: i * 3.7 }));
  while (specs.length < MIN_CABINETS || specs.at(-1)?.kind === "game") specs.push({ kind: "broken" });
  return specs;
}

export function createArcade({ canvas, games, images, onFocus, onLaunchStart }: ArcadeOptions): Arcade {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 40);

  const specs = lineUp(games);
  const firstGame = 1;
  const xOf = (i: number): number => (i - firstGame) * SPACING;

  const cabinets: Cabinet[] = specs.map((spec, i) => {
    const cabinet = buildCabinet(spec, images.head);
    cabinet.group.position.set(xOf(i), 0, ROW_Z);
    scene.add(cabinet.group);
    return cabinet;
  });
  const playable = cabinets.map((c, i) => (c.game ? i : -1)).filter((i) => i >= 0);
  const lowPower = isLowPower();
  const room = buildRoom(scene, specs.map((_, i) => xOf(i)), lowPower);

  // On the wall past the end of the row, where the cabinets don't hide it.
  const poster = buildPoster(images.logo, images.guy);
  poster.position.set(xOf(0) - SPACING * 1.45, 1.45, WALL_Z + 0.03);
  scene.add(poster);

  // Back far enough that a whole cabinet fits, even on a portrait phone; the
  // sign shrinks to whatever width of wall that leaves in view.
  let distance = 3;
  const renderer = createView(canvas, camera, (w, h) => {
    const halfTan = Math.tan(MathUtils.degToRad(FOV / 2));
    distance = Math.max(3, (CABINET_WIDTH * 0.95) / (halfTan * (w / h)));
    const wallDistance = distance + (ROW_Z - WALL_Z);
    room.fitSign(2 * wallDistance * halfTan * (w / h));
    look.resize(w, h);
  });
  const look = applyLook(renderer, scene, camera, lowPower);

  // Each game's gameplay thumbnail, made by scripts/make-thumbnails.mjs.
  for (const cabinet of cabinets) {
    if (!cabinet.game || !cabinet.screen) continue;
    const { screen } = cabinet;
    const img = new Image();
    img.onload = () => screen.setThumbnail(img);
    img.src = `/assets/thumbs/${cabinet.game.id}.jpg`;
  }

  let focus = 0; // index into playable
  let railX = xOf(playable[0]);
  let launching: { from: Vector3; to: Vector3; look: Vector3; started: number } | null = null;
  const reduceMotion = prefersReducedMotion();

  function setFocus(next: number): void {
    focus = MathUtils.clamp(next, 0, playable.length - 1);
    cabinets.forEach((c, i) => c.setFocused(i === playable[focus]));
    const game = cabinets[playable[focus]].game;
    if (game) onFocus(game);
  }

  function launch(): void {
    if (launching) return;
    const cabinet = cabinets[playable[focus]];
    const game = cabinet.game;
    if (!game) return;
    onLaunchStart(game);
    if (reduceMotion) {
      window.location.assign(game.path);
      return;
    }
    const look = cabinet.screenMesh.getWorldPosition(new Vector3());
    const normal = new Vector3(0, 0, 1).transformDirection(cabinet.screenMesh.matrixWorld);
    launching = { from: camera.position.clone(), to: look.clone().addScaledVector(normal, 0.32), look, started: -1 };
  }

  // --- input ------------------------------------------------------------------

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("a, button")) return; // let links work
    if (e.key === "ArrowLeft") setFocus(focus - 1);
    else if (e.key === "ArrowRight") setFocus(focus + 1);
    else if (e.key === "Enter" || e.key === " ") launch();
    else return;
    e.preventDefault();
  });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let downAt: { x: number; y: number } | null = null;

  canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    const dx = e.clientX - downAt.x;
    const dy = e.clientY - downAt.y;
    downAt = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setFocus(focus + (dx < 0 ? 1 : -1)); // swipe left reveals the next cabinet
      return;
    }
    if (Math.hypot(dx, dy) > 10) return;
    const hit = cabinetAt(e.clientX, e.clientY);
    if (hit < 0) return;
    const at = playable.indexOf(hit);
    if (at < 0) return;
    if (at === focus) launch();
    else setFocus(at);
  });

  canvas.addEventListener("pointermove", (e) => {
    canvas.style.cursor = playable.includes(cabinetAt(e.clientX, e.clientY)) ? "pointer" : "";
  });

  function cabinetAt(clientX: number, clientY: number): number {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(cabinets.map((c) => c.group), true);
    if (!hit) return -1;
    let node: Object3D | null = hit.object;
    while (node && !cabinets.some((c) => c.group === node)) node = node.parent;
    return cabinets.findIndex((c) => c.group === node);
  }

  // --- frame loop -------------------------------------------------------------

  const lookAt = new Vector3();
  runLoop((time, dt) => {
    room.update(time);
    for (const c of cabinets) c.update(time);

    if (launching) {
      if (launching.started < 0) launching.started = time;
      const t = Math.min((time - launching.started) / 0.8, 1);
      const ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(launching.from, launching.to, ease);
      lookAt.lerp(launching.look, ease);
      camera.lookAt(lookAt);
      if (t === 1) {
        const game = cabinets[playable[focus]].game;
        if (game) window.location.assign(game.path);
        launching = null;
      }
    } else {
      // Glide along the rail, with a gentle idle sway.
      const targetX = xOf(playable[focus]);
      railX = reduceMotion ? targetX : MathUtils.damp(railX, targetX, 6, dt);
      const sway = reduceMotion ? 0 : Math.sin(time * 0.4) * 0.05;
      camera.position.set(railX + sway, 1.6, ROW_Z + distance);
      lookAt.set(railX, 1.5, ROW_Z);
      camera.lookAt(lookAt);
      room.spot.position.x = railX;
      room.spot.target.position.set(railX, 0.8, ROW_Z);
    }
    look.render();
  });

  setFocus(0);

  // Coming back via the browser's Back button restores this page from cache,
  // mid-zoom. Start again from the rail.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) launching = null;
  });

  return {
    setScores(gameId, scores) {
      cabinets.find((c) => c.game?.id === gameId)?.screen?.setScores(scores);
    },
    focusGame(gameId) {
      const at = playable.findIndex((i) => cabinets[i].game?.id === gameId);
      if (at >= 0 && at !== focus) setFocus(at);
    },
  };
}
