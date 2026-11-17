// The 3D arcade: a row of cabinets and a camera on rails in front of them.
// Arrow keys, swipes, the on-screen buttons, or a tap move between cabinets;
// Enter, PLAY, or a tap on the focused cabinet zooms into its screen and loads it.
// The out-of-order machines are stops too: there, the same press kicks it.

import { MathUtils, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, type Object3D } from "three";
import type { GameEntry } from "../../shared/games";
import { createView, isLowPower, prefersReducedMotion, runLoop } from "../../shared/three";
import { buildCabinet, CABINET_WIDTH, type Cabinet, type CabinetSpec } from "./cabinet";
import { decorateRoom } from "./festive";
import { sprayGraffiti } from "./graffiti";
import { sfx } from "./audio";
import type { Cue } from "./broken";
import { applyLook } from "./look";
import { buildPoster } from "./poster";
import { buildRoom, TRIM_Y, WALL_Z } from "./room";
import { seasonOf } from "./season";
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

/** The cabinet the camera has stopped at: a game, or a machine that's out of order. */
export type Focus = { kind: "game"; game: GameEntry } | { kind: "broken" };

export interface ArcadeOptions {
  canvas: HTMLCanvasElement;
  games: GameEntry[];
  images: ArcadeImages;
  onFocus(focus: Focus): void;
  onLaunchStart(game: GameEntry): void;
}

const PERSONALITIES = ["glitchy", "overheating"] as const;

/** Coming soon on the left, the games newest first, broken machines after. */
function lineUp(games: GameEntry[]): CabinetSpec[] {
  const specs: CabinetSpec[] = [{ kind: "soon" }];
  games.forEach((game, i) => specs.push({ kind: "game", game, offset: i * 3.7 }));
  let broken = 0;
  while (specs.length < MIN_CABINETS || specs.at(-1)?.kind === "game") {
    specs.push({ kind: "broken", personality: PERSONALITIES[broken++ % PERSONALITIES.length] });
  }
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
  /** The cabinets the camera stops at: every game, and the broken machines after them. */
  const playable = cabinets.map((c, i) => (c.game || c.broken ? i : -1)).filter((i) => i >= 0);
  const lowPower = isLowPower();
  const room = buildRoom(scene, specs.map((_, i) => xOf(i)), lowPower);

  // On the wall past the end of the row, where the cabinets don't hide it.
  const poster = buildPoster(images.logo, images.guy);
  poster.position.set(xOf(0) - SPACING * 1.45, 1.45, WALL_Z + 0.03);
  scene.add(poster);

  // Christmas in the arcade, in season: the tree goes in the gap between the
  // poster and the first cabinet.
  const reduceMotion = prefersReducedMotion();
  const season = seasonOf(new Date(), window.location.search);
  const festive = season === "christmas"
    ? decorateRoom(scene, {
        trimY: TRIM_Y,
        wallZ: WALL_Z,
        treeX: (xOf(0) - CABINET_WIDTH / 2 + poster.position.x + 0.5) / 2,
        treeZ: ROW_Z - 0.05,
        snow: !reduceMotion,
        lowPower,
      })
    : null;

  // Ryan, sprayed on the wall above the broken machines, blamed for them.
  const brokenAt = cabinets.map((c, i) => (c.broken ? xOf(i) : null)).filter((x): x is number => x !== null);
  // Right of the neon sign and the birthday cabinet's balloons, filling the
  // wall up to the top of the view.
  if (brokenAt.length) {
    sprayGraffiti(scene, {
      head: images.head,
      season,
      x: brokenAt[0] + SPACING,
      y: TRIM_Y + 0.6,
      z: WALL_Z + 0.02,
      blameX: brokenAt[1] ?? brokenAt[0],
    });
  }

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

  function setFocus(next: number, quiet = false): void {
    const was = focus;
    focus = MathUtils.clamp(next, 0, playable.length - 1);
    if (focus !== was && !quiet) sfx.move();
    cabinets.forEach((c, i) => c.setFocused(i === playable[focus]));
    const game = cabinets[playable[focus]].game;
    onFocus(game ? { kind: "game", game } : { kind: "broken" });
  }

  /** Where a cabinet is on screen, -1 left to 1 right, for panning its sounds. */
  const panOf = (i: number): number => MathUtils.clamp((xOf(i) - camera.position.x) / 1.5, -1, 1);

  function play(cues: Cue[], i: number): void {
    const pan = panOf(i);
    for (const cue of cues) sfx[cue](pan);
  }

  function kick(i: number): void {
    const broken = cabinets[i].broken;
    if (!broken) return;
    play(broken.poke(), i);
  }

  function launch(): void {
    if (launching) return;
    const cabinet = cabinets[playable[focus]];
    if (cabinet.broken) {
      kick(playable[focus]);
      return;
    }
    const game = cabinet.game;
    if (!game) return;
    sfx.coin();
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
    if (cabinets[hit].broken) {
      // A broken machine takes a kick straight away, wherever the camera is.
      if (at !== focus) setFocus(at);
      kick(hit);
    } else if (at === focus) launch();
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
    cabinets.forEach((c, i) => {
      c.update(time);
      const cues = c.broken?.takeCues();
      if (cues?.length) play(cues, i);
    });
    festive?.(time, dt, camera.position.x);

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

  setFocus(0, true);

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
