// An upright arcade cabinet, built from a handful of boxes and an extruded side
// profile. Units are metres; the cabinet stands on y = 0 facing +z.

import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  type Material,
  type Texture,
} from "three";
import type { GameEntry } from "../../shared/games";
import { AttractScreen } from "./screen";
import { ARCADE_FONT, marquee, paint, PALETTES, sideArt } from "./textures";

export const CABINET_WIDTH = 0.74;
const PANEL = 0.04; // side panel thickness
const DEPTH = 0.88;

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
  setFocused(on: boolean): void;
}

/** The classic silhouette: kick panel, jutting controls, sloped screen, marquee overhang. */
function sideProfile(): ExtrudeGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(0.8, 0);
  s.lineTo(0.8, 0.86);
  s.lineTo(0.88, 0.92);
  s.lineTo(0.88, 1.0);
  s.lineTo(0.58, 1.08);
  s.lineTo(0.52, 1.62);
  s.lineTo(0.66, 1.66);
  s.lineTo(0.66, 1.92);
  s.lineTo(0, 1.92);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: PANEL, bevelEnabled: false });
  // Profile depth runs along +z, the extrusion along -x, centred front to back.
  g.rotateY(-Math.PI / 2);
  g.translate(0, 0, -DEPTH / 2);
  return g;
}

let profile: ExtrudeGeometry | null = null;

function box(w: number, h: number, d: number, material: Material | Material[], x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A taped-on paper sign for the broken machines. */
const outOfOrder = (): Texture =>
  paint(256, 160, (ctx) => {
    ctx.fillStyle = "#f4f0e2";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = "#c22";
    ctx.font = `bold 40px ${ARCADE_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("OUT OF", 128, 68);
    ctx.fillText("ORDER", 128, 116);
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
  const W = CABINET_WIDTH;
  const zFront = DEPTH / 2;

  const group = new Group();
  const body = new MeshStandardMaterial({ color: lit ? "#231a3d" : "#1a1a20", roughness: 0.7 });
  const trim = new MeshStandardMaterial({
    color: lit ? palette.primary : "#333",
    emissive: new Color(lit ? palette.primary : "#000"),
    emissiveIntensity: lit ? 0.35 : 0,
  });
  const black = new MeshStandardMaterial({ color: "#0a0a0e", roughness: 0.4 });

  // Side panels, with art on the outside face.
  profile ??= sideProfile();
  for (const side of [-1, 1]) {
    const panel = new Mesh(profile, body);
    panel.position.x = side < 0 ? -W / 2 : W / 2 + PANEL;
    group.add(panel);

    if (lit) {
      const art = new Mesh(new PlaneGeometry(0.62, 1.24), new MeshBasicMaterial({ map: sideArt(palette, head) }));
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
  group.add(box(0.26, 0.3, 0.02, black, 0, 0.5, 0.8 - zFront + 0.01));
  const slot = new MeshBasicMaterial({ color: lit ? "#ff3b3b" : "#401010" });
  for (const x of [-0.06, 0.06]) group.add(box(0.04, 0.07, 0.01, slot, x, 0.56, 0.8 - zFront + 0.025));

  // Control panel: the front lip, then the sloped deck with stick and buttons.
  group.add(box(W, 0.14, 0.08, trim, 0, 0.93, 0.88 - zFront - 0.04));
  const deck = box(W, 0.04, 0.31, black, 0, 1.02, 0.73 - zFront);
  deck.rotation.x = 0.26;
  const stick = new Mesh(new CylinderGeometry(0.012, 0.012, 0.08), black);
  stick.position.set(-0.17, 0.06, 0);
  const ball = new Mesh(new SphereGeometry(0.032, 12, 8), new MeshStandardMaterial({ color: "#e23" }));
  ball.position.set(-0.17, 0.11, 0);
  deck.add(stick, ball);
  ["#ff3b6b", "#ffd23b", "#3bc8ff"].forEach((colour, i) => {
    const button = new Mesh(
      new CylinderGeometry(0.026, 0.026, 0.02, 14),
      new MeshBasicMaterial({ color: lit ? colour : "#2a2a30" }),
    );
    button.position.set(0.02 + i * 0.075, 0.025, i === 1 ? -0.03 : 0);
    deck.add(button);
  });
  group.add(deck);

  // Screen in its bezel, tilted back like a real CRT.
  const bezel = box(W, 0.55, 0.04, black, 0, 1.35, 0.55 - zFront);
  bezel.rotation.x = -0.11;
  const screen = game ? new AttractScreen(game, palette, spec.kind === "game" ? spec.offset : 0) : null;
  const glass = new MeshBasicMaterial({
    map: screen?.texture ?? (spec.kind === "soon" ? comingSoon() : null),
    color: spec.kind === "broken" ? "#050507" : "#ffffff",
  });
  const screenMesh = new Mesh(new PlaneGeometry(W * 0.82, 0.42), glass);
  screenMesh.position.z = 0.021;
  bezel.add(screenMesh);
  if (spec.kind === "broken") {
    const sign = new Mesh(new PlaneGeometry(0.26, 0.16), new MeshBasicMaterial({ map: outOfOrder() }));
    sign.position.set(0.04, -0.02, 0.023);
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

  return {
    group,
    game,
    screen,
    screenMesh,
    setFocused(on) {
      if (!screen) return;
      glass.color.setScalar(on ? 1 : 0.55);
      trim.emissiveIntensity = on ? 0.8 : 0.35;
    },
  };
}
