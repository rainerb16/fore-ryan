// An upright arcade cabinet, built from a handful of boxes and an extruded side
// profile. Units are metres; the cabinet stands on y = 0 facing +z.

import {
  AdditiveBlending,
  BoxGeometry,
  CurvePath,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LineCurve3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Texture,
} from "three";
import type { GameEntry } from "../../shared/games";
import { decorate } from "./decorations";
import { AttractScreen } from "./screen";
import { ARCADE_FONT, contactShadow, lightPool, marquee, paint, PALETTES, SCRIPT_FONT, sideArt } from "./textures";

export const CABINET_WIDTH = 0.74;
const PANEL = 0.04; // side panel thickness
const DEPTH = 0.88;

/** The side silhouette, back to front: kick panel, jutting controls, sloped screen, marquee overhang. */
const PROFILE = [
  [0, 0], [0.8, 0], [0.8, 0.86], [0.88, 0.92], [0.88, 1.0],
  [0.58, 1.08], [0.52, 1.62], [0.66, 1.66], [0.66, 1.92], [0, 1.92],
].map(([x, y]) => new Vector2(x, y));

export type CabinetSpec =
  | { kind: "game"; game: GameEntry; offset: number }
  | { kind: "soon" }
  | { kind: "broken" };

export interface Cabinet {
  group: Group;
  game: GameEntry | null;
  screen: AttractScreen | null;
  /** Where the camera zooms to when this cabinet is launched. */
  screenMesh: Mesh;
  /** Attract-mode screen and decorations; called every frame. */
  update(time: number): void;
  setFocused(on: boolean): void;
}

let shared: { profile: ExtrudeGeometry; molding: TubeGeometry; shadow: Texture; pool: Texture } | null = null;

function sharedParts(): NonNullable<typeof shared> {
  if (shared) return shared;
  const shape = new Shape(PROFILE);
  const profile = new ExtrudeGeometry(shape, { depth: PANEL, bevelEnabled: false });
  // Profile depth runs along +z, the extrusion along -x, centred front to back.
  profile.rotateY(-Math.PI / 2);
  profile.translate(0, 0, -DEPTH / 2);

  // T-molding: the glowing edge strip along the front of each side panel.
  const path = new CurvePath<Vector3>();
  const front = PROFILE.slice(1, 9).map((p) => new Vector3(0, p.y, p.x - DEPTH / 2));
  for (let i = 1; i < front.length; i++) path.add(new LineCurve3(front[i - 1], front[i]));
  const molding = new TubeGeometry(path, 48, 0.011, 6, false);

  shared = { profile, molding, shadow: contactShadow(), pool: lightPool() };
  return shared;
}

function box(w: number, h: number, d: number, material: Material | Material[], x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A taped-on paper sign for the broken machines. */
const outOfOrder = (): Texture =>
  paint(256, 200, (ctx) => {
    ctx.fillStyle = "#f4f0e2";
    ctx.fillRect(0, 0, 256, 200);
    ctx.fillStyle = "#c22";
    ctx.font = `bold 40px ${ARCADE_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("OUT OF", 128, 58);
    ctx.fillText("ORDER", 128, 104);
    // Scrawled underneath in blue pen.
    ctx.fillStyle = "#1f3fbf";
    ctx.font = `46px ${SCRIPT_FONT}`;
    ctx.fillText("Rainer's on it!", 128, 166, 236);
  });

const comingSoon = (): Texture =>
  paint(320, 240, (ctx) => {
    ctx.fillStyle = "#05030d";
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = "#6f6790";
    ctx.font = `bold 30px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.fillText("COMING SOON", 160, 128);
  });

export function buildCabinet(spec: CabinetSpec, head: HTMLImageElement | null): Cabinet {
  const lit = spec.kind === "game";
  const game = spec.kind === "game" ? spec.game : null;
  const palette = PALETTES[game?.occasion ?? "Birthday"];
  const parts = sharedParts();
  const W = CABINET_WIDTH;
  const zFront = DEPTH / 2;

  const group = new Group();
  // Lacquered laminate, satin black plastic, and a brushed-metal control deck.
  const body = new MeshStandardMaterial({ color: lit ? "#211838" : "#18181d", roughness: 0.38, metalness: 0.05 });
  const black = new MeshStandardMaterial({ color: "#0b0b10", roughness: 0.32 });
  const deckMetal = new MeshStandardMaterial({ color: "#2a2a33", roughness: 0.35, metalness: 0.6 });
  const trim = new MeshStandardMaterial({
    color: lit ? palette.primary : "#2c2c33",
    emissive: lit ? palette.primary : "#000000",
    emissiveIntensity: lit ? 0.08 : 0,
    roughness: 0.55,
  });
  // Coloured plastic, not a light: the spotlight hits it head-on, so keep it dark.
  trim.color.multiplyScalar(0.45);

  // Side panels with their T-molding, and art on the outside face.
  for (const side of [-1, 1]) {
    const panel = new Mesh(parts.profile, body);
    panel.position.x = side < 0 ? -W / 2 : W / 2 + PANEL;
    group.add(panel);

    const molding = new Mesh(parts.molding, trim);
    molding.position.x = side * (W / 2 + PANEL / 2);
    group.add(molding);

    if (lit) {
      const art = new Mesh(
        new PlaneGeometry(0.62, 1.24),
        new MeshStandardMaterial({ map: sideArt(palette, head), roughness: 0.45 }),
      );
      art.position.set(side * (W / 2 + PANEL + 0.002), 0.82, -0.05);
      art.rotation.y = side * (Math.PI / 2);
      group.add(art);
    }
  }

  // Back, top, and kick panel.
  group.add(box(W, 1.92, 0.04, body, 0, 0.96, -zFront + 0.02));
  group.add(box(W, 0.04, 0.66, body, 0, 1.9, -0.11));
  group.add(box(W, 0.86, 0.04, body, 0, 0.43, 0.8 - zFront - 0.02));

  // Coin door, with two glowing slots.
  group.add(box(0.26, 0.3, 0.02, deckMetal, 0, 0.5, 0.8 - zFront + 0.01));
  const slot = new MeshBasicMaterial({ color: lit ? "#ff3b3b" : "#401010" });
  for (const x of [-0.06, 0.06]) group.add(box(0.04, 0.07, 0.01, slot, x, 0.56, 0.8 - zFront + 0.025));

  // Control panel: the front lip, then the sloped deck with stick and buttons.
  group.add(box(W, 0.14, 0.08, black, 0, 0.93, 0.88 - zFront - 0.04));
  const deck = box(W, 0.04, 0.31, deckMetal, 0, 1.02, 0.73 - zFront);
  deck.rotation.x = 0.26;
  const stick = new Mesh(new CylinderGeometry(0.012, 0.012, 0.08, 10), black);
  stick.position.set(-0.17, 0.06, 0);
  const ball = new Mesh(
    new SphereGeometry(0.032, 20, 14),
    new MeshStandardMaterial({ color: "#d4142a", roughness: 0.12 }),
  );
  ball.position.set(-0.17, 0.11, 0);
  deck.add(stick, ball);
  ["#ff3b6b", "#ffd23b", "#3bc8ff"].forEach((colour, i) => {
    const button = new Mesh(
      new CylinderGeometry(0.026, 0.026, 0.02, 20),
      new MeshStandardMaterial({
        color: lit ? colour : "#2a2a30",
        emissive: lit ? colour : "#000000",
        emissiveIntensity: lit ? 0.35 : 0,
        roughness: 0.2,
      }),
    );
    button.position.set(0.02 + i * 0.075, 0.025, i === 1 ? -0.03 : 0);
    deck.add(button);
  });
  group.add(deck);

  // Screen in its bezel, tilted back like a real CRT, behind a pane of glass.
  const bezel = box(W, 0.55, 0.04, black, 0, 1.35, 0.55 - zFront);
  bezel.rotation.x = -0.11;
  const screen = game ? new AttractScreen(game, palette, spec.kind === "game" ? spec.offset : 0) : null;
  const tube = new MeshBasicMaterial({
    map: screen?.texture ?? (spec.kind === "soon" ? comingSoon() : null),
    color: spec.kind === "broken" ? "#050507" : spec.kind === "soon" ? "#9a9a9a" : "#ffffff",
  });
  const screenMesh = new Mesh(new PlaneGeometry(W * 0.82, 0.42), tube);
  screenMesh.position.z = 0.021;
  bezel.add(screenMesh);
  const glass = new Mesh(
    new PlaneGeometry(W * 0.86, 0.46),
    new MeshStandardMaterial({
      color: "#000000",
      roughness: 0.05,
      metalness: 1,
      transparent: true,
      opacity: 0.22,
      envMapIntensity: 4,
      depthWrite: false,
    }),
  );
  glass.position.z = 0.026;
  bezel.add(glass);
  if (spec.kind === "broken") {
    const sign = new Mesh(
      new PlaneGeometry(0.26, 0.2),
      new MeshStandardMaterial({ map: outOfOrder(), roughness: 0.9 }),
    );
    sign.position.set(0.04, -0.02, 0.03);
    sign.rotation.z = -0.12;
    bezel.add(sign);
  }
  group.add(bezel);

  // Marquee overhang and the backlit sign.
  group.add(box(W, 0.04, 0.14, body, 0, 1.64, 0.15));
  const signFace = new MeshBasicMaterial({
    map: marquee(game?.title ?? (spec.kind === "soon" ? "Coming soon" : "Out of order"), palette, lit),
  });
  group.add(box(W, 0.26, 0.04, [body, body, body, body, signFace, body], 0, 1.79, 0.66 - zFront - 0.02));

  group.traverse((node) => {
    if (node instanceof Mesh && node.material !== tube && node.material !== signFace) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  // Grounding: a soft dark footprint, and the screen's glow spilling onto the carpet.
  const footprint = new Mesh(
    new PlaneGeometry(W + 0.5, DEPTH + 0.4),
    new MeshBasicMaterial({ map: parts.shadow, transparent: true, depthWrite: false }),
  );
  footprint.rotation.x = -Math.PI / 2;
  footprint.position.y = 0.003;
  group.add(footprint);

  let spill: MeshBasicMaterial | null = null;
  if (lit) {
    spill = new MeshBasicMaterial({
      map: parts.pool,
      color: palette.primary,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const pool = new Mesh(new PlaneGeometry(1.4, 1.1), spill);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.005, zFront + 0.45);
    group.add(pool);
  }

  // Dressed for the occasion: balloons for a birthday, garland for Christmas.
  const animate = game ? decorate(group, game.occasion) : null;

  return {
    group,
    game,
    screen,
    screenMesh,
    update(time) {
      screen?.update(time);
      animate?.(time);
    },
    setFocused(on) {
      if (!screen) return;
      tube.color.setScalar(on ? 1 : 0.6);
      trim.emissiveIntensity = on ? 0.12 : 0.08;
      if (spill) spill.opacity = on ? 0.45 : 0.25;
    },
  };
}
