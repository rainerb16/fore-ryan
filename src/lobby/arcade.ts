// The 3D arcade: a row of cabinets and a camera on rails in front of them.
// Arrow keys, swipes, the on-screen buttons, or a tap move between cabinets;
// Enter, PLAY, or a tap on the focused cabinet zooms into its screen and loads it.
// The out-of-order machines are stops too: there, the same press kicks it.

import { CatmullRomCurve3, Fog, MathUtils, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, type Object3D } from "three";
import type { GameEntry } from "../../shared/games";
import { createView, isLowPower, prefersReducedMotion, runLoop } from "../../shared/three";
import { buildCabinet, CABINET_WIDTH, type Cabinet, type CabinetSpec } from "./cabinet";
import { decorateRoom } from "./festive";
import { sprayGraffiti } from "./graffiti";
import { sfx } from "./audio";
import type { Cue } from "./broken";
import { applyLook } from "./look";
import { buildPoster } from "./poster";
import { buildProps } from "./props";
import { buildRoom, TRIM_Y, WALL_Z } from "./room";
import { seasonOf } from "./season";
import { buildStorefront, FRONT_Z } from "./storefront";
import type { Scores } from "./screen";

const SPACING = CABINET_WIDTH + 0.26;
const ROW_Z = WALL_Z + 0.5;
const FOV = 55;
/** Enough cabinets that the row reads as an arcade, not a lone machine. */
const MIN_CABINETS = 5;

export interface Arcade {
  setScores(gameId: string, scores: Scores): void;
  focusGame(gameId: string): void;
  /** Goes in from the street: the door opens and the camera glides through it. */
  enter(): void;
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
  /** Start outside the shop front, waiting to be let in. */
  startOutside: boolean;
  /** "Click to enter" or "Tap to enter", for the sign on the door. */
  enterWords: string;
  /** Once the camera is inside, whether by the door or straight away. */
  onEntered(): void;
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

/** How long walking in takes, door and all. */
const ENTER_FOR = 2.6;
/** The room's haze inside, and how far you can see out in the street. */
const FOG_INSIDE = { near: 5, far: 14 };
const FOG_OUTSIDE = { near: 9, far: 40 };

export function createArcade({ canvas, games, images, onFocus, onLaunchStart, startOutside, enterWords, onEntered }: ArcadeOptions): Arcade {
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
        // Back against the wall, so from the camera it stays in its gap rather than in front of the poster.
        treeZ: WALL_Z + 0.3,
        // The poster is 1 m wide; leave a little air either side of it.
        skip: [[poster.position.x - 0.6, poster.position.x + 0.6]],
      })
    : null;

  // Ryan, sprayed on the wall above the broken machines, blamed for them.
  const brokenAt = cabinets.map((c, i) => (c.broken ? xOf(i) : null)).filter((x): x is number => x !== null);
  // Right of the neon sign and the birthday cabinet's balloons, filling the
  // wall up to the top of the view.
  const graffitiX = (brokenAt[0] ?? 0) + SPACING;
  const graffitiPan = (): number => MathUtils.clamp((graffitiX - camera.position.x) / 1.5, -1, 1);
  const graffiti = brokenAt.length
    ? sprayGraffiti(
        scene,
        {
          head: images.head,
          season,
          x: graffitiX,
          y: TRIM_Y + 0.6,
          z: WALL_Z + 0.02,
          blameX: brokenAt[1] ?? brokenAt[0],
          reduceMotion,
        },
        (seconds) => sfx.spray(graffitiPan(), seconds),
      )
    : null;

  // The rest of the arcade floor at either end of the row: a claw machine and a
  // pinball table past the poster, and a prize counter past the last machine.
  const props = buildProps(scene, {
    head: images.head,
    wallZ: WALL_Z,
    leftX: poster.position.x - 0.5,
    rightX: xOf(specs.length - 1) + CABINET_WIDTH / 2,
    frontZ: FRONT_Z,
  });

  // The street outside, where a visit starts (once per visit; see main.ts).
  const storefront = startOutside ? buildStorefront(scene, { season, words: enterWords, lowPower }) : null;
  /** Outside waiting at the door, or walking in (seconds since the door was opened). */
  let intro: { phase: "outside" } | { phase: "entering"; t: number; path: CatmullRomCurve3; from: Vector3 } | null =
    storefront ? { phase: "outside" } : null;
  const fog = scene.fog instanceof Fog ? scene.fog : null;
  if (intro && fog) Object.assign(fog, FOG_OUTSIDE);
  // Seen from the street, the room is dimmer, so the door's sign reads against it.
  if (intro) room.setBrightness(0);
  /** How far back from the shop front the camera stands outside: enough to fit the door and windows. */
  let outsideDistance = 6;

  // Back far enough that a whole cabinet fits, even on a portrait phone; the
  // sign shrinks to whatever width of wall that leaves in view.
  let distance = 3;
  const renderer = createView(canvas, camera, (w, h) => {
    const halfTan = Math.tan(MathUtils.degToRad(FOV / 2));
    distance = Math.max(3, (CABINET_WIDTH * 0.95) / (halfTan * (w / h)));
    // Close in, so the lit windows fill the view; phones frame the door and the windows' edges.
    outsideDistance = Math.max(4.8, 1.75 / (halfTan * (w / h)));
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
  /** The zoom into a game's screen: the game it's going to is fixed when it starts. */
  let launching: { game: GameEntry; from: Vector3; to: Vector3; look: Vector3; started: number } | null = null;

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
    launching = { game, from: camera.position.clone(), to: look.clone().addScaledVector(normal, 0.32), look, started: -1 };
  }

  // --- input ------------------------------------------------------------------

  /** Where the camera stands in the street, and what it looks at. */
  const outsidePose = (pos: Vector3, at: Vector3): void => {
    pos.set(0, 1.6, FRONT_Z + outsideDistance);
    at.set(0, 1.9, FRONT_Z);
  };

  function enter(): void {
    if (intro?.phase !== "outside") return;
    sfx.doorBell();
    if (reduceMotion) {
      finishEntering();
      return;
    }
    const from = new Vector3();
    outsidePose(from, new Vector3());
    // Up to the door, through it, and on to the first cabinet's view.
    const inside = new Vector3(xOf(playable[focus]), 1.6, ROW_Z + distance);
    const path = new CatmullRomCurve3([
      from,
      new Vector3(0, 1.6, FRONT_Z + 1.4),
      new Vector3(0, 1.55, FRONT_Z - 0.8),
      inside,
    ]);
    intro = { phase: "entering", t: 0, path, from };
  }

  function finishEntering(): void {
    intro = null;
    room.setBrightness(1);
    if (fog) Object.assign(fog, FOG_INSIDE);
    onEntered();
  }

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("a, button")) return; // let links work
    if (intro) {
      if (intro.phase === "outside" && (e.key === "Enter" || e.key === " ") && !e.repeat) {
        enter();
        e.preventDefault();
      }
      return;
    }
    if (launching) return; // on the way into a game: nothing else now
    if (e.key === "ArrowLeft") setFocus(focus - 1);
    else if (e.key === "ArrowRight") setFocus(focus + 1);
    else if (e.key === "Enter" || e.key === " ") {
      // One press, one kick: a held key would otherwise kick 30 times a second.
      if (!e.repeat) launch();
    } else return;
    e.preventDefault();
  });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let downAt: { x: number; y: number } | null = null;

  canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    if (intro) {
      // Outside: a tap anywhere goes in.
      downAt = null;
      enter();
      return;
    }
    if (!downAt || launching) return;
    const dx = e.clientX - downAt.x;
    const dy = e.clientY - downAt.y;
    downAt = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setFocus(focus + (dx < 0 ? 1 : -1)); // swipe left reveals the next cabinet
      return;
    }
    if (Math.hypot(dx, dy) > 10) return;
    const hit = cabinetAt(e.clientX, e.clientY);
    if (hit < 0) {
      // Not a cabinet: maybe Ryan on the wall, who gets his outfit sprayed on again.
      if (graffiti?.hit(raycaster)) graffiti.respray();
      return;
    }
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
    if (intro) {
      canvas.style.cursor = intro.phase === "outside" ? "pointer" : "";
      return;
    }
    const over = cabinetAt(e.clientX, e.clientY);
    canvas.style.cursor = playable.includes(over) || (over < 0 && graffiti?.hit(raycaster)) ? "pointer" : "";
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
    festive?.(time);
    props(time);

    if (intro && storefront) {
      storefront.update(time, dt);
      if (intro.phase === "outside") {
        outsidePose(camera.position, lookAt);
        // A slow, gentle sway, like someone standing in the street.
        if (!reduceMotion) camera.position.x += Math.sin(time * 0.3) * 0.08;
        camera.lookAt(lookAt);
      } else {
        intro.t += dt;
        const t = Math.min(intro.t / ENTER_FOR, 1);
        // The door swings open first; the walk in starts as it does.
        const doorT = Math.min(1, t / 0.3);
        storefront.openDoor(1 - (1 - doorT) * (1 - doorT));
        const walk = MathUtils.clamp((t - 0.12) / 0.88, 0, 1);
        const ease = walk * walk * (3 - 2 * walk);
        camera.position.copy(intro.path.getPoint(ease));
        // Looking at the door, then down the row of cabinets.
        const ahead = new Vector3(xOf(playable[focus]), 1.5, ROW_Z);
        const door = new Vector3(0, 1.75, FRONT_Z);
        lookAt.lerpVectors(door, ahead, MathUtils.smoothstep(walk, 0.15, 0.85));
        camera.lookAt(lookAt);
        if (fog) {
          fog.near = MathUtils.lerp(FOG_OUTSIDE.near, FOG_INSIDE.near, walk);
          fog.far = MathUtils.lerp(FOG_OUTSIDE.far, FOG_INSIDE.far, walk);
        }
        room.setBrightness(walk);
        if (t >= 1) {
          railX = xOf(playable[focus]);
          finishEntering();
        }
      }
      look.render();
      return;
    }
    graffiti?.update(dt, camera);

    if (launching) {
      if (launching.started < 0) launching.started = time;
      const t = Math.min((time - launching.started) / 0.8, 1);
      const ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(launching.from, launching.to, ease);
      lookAt.lerp(launching.look, ease);
      camera.lookAt(lookAt);
      if (t === 1) {
        window.location.assign(launching.game.path);
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
      // Tabbing into the game list from the street steps straight inside.
      if (intro) {
        railX = xOf(playable[focus]);
        finishEntering();
      }
      const at = playable.findIndex((i) => cabinets[i].game?.id === gameId);
      if (at >= 0 && at !== focus) setFocus(at);
    },
    enter,
  };
}
