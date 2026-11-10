// Occasion decorations dressed onto a game's cabinet: a party for birthdays,
// a festive cabinet for Christmas. Cabinet-local metres: the top sits at
// y = 1.92, the marquee face at z = 0.22, the cabinet is 0.74 m wide.

import {
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  IcosahedronGeometry,
  MeshPhysicalMaterial,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import type { GameEntry } from "../../shared/games";
import { paint } from "./textures";

const TOP = 1.92;
const FRONT = 0.22;
const HALF = 0.37;

/** Advances any animation; called every frame with seconds elapsed. */
export type Animate = (time: number) => void;

const gloss = (color: string, extra = {}): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.25, ...extra });
const matte = (color: string): MeshStandardMaterial => new MeshStandardMaterial({ color, roughness: 0.85 });

function mesh(geometry: ConstructorParameters<typeof Mesh>[0], material: Material, x: number, y: number, z: number): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A thin cord through the given points. */
const cord = (points: Vector3[], radius: number, material: Material): Mesh =>
  new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 24, radius, 5), material);

/** A line that sags between two ends, as `count` evenly spaced points. */
function sag(from: Vector3, to: Vector3, drop: number, count: number): Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return new Vector3().lerpVectors(from, to, t).setY(from.y + (to.y - from.y) * t - drop * 4 * t * (1 - t));
  });
}

/** A party hat on the cabinet top, tilted at a jaunty angle. */
function partyHat(body: Material, tip: Material, x: number, tilt: number): Group {
  const g = new Group();
  g.add(mesh(new ConeGeometry(0.12, 0.3, 24, 1, true), body, 0, 0.15, 0));
  g.add(mesh(new SphereGeometry(0.035, 14, 10), tip, 0, 0.31, 0));
  g.position.set(x, TOP + 0.02, -0.12);
  g.rotation.z = tilt;
  return g;
}

/** Nudges every vertex in or out a little, deterministically, so fur reads as fluffy. */
function fluff<G extends BufferGeometry>(geometry: G, amount: number): G {
  const pos = geometry.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 91 + v.y * 57) * Math.cos(v.z * 73 - v.x * 31);
    v.multiplyScalar(1 + n * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A Santa hat in soft fabric: it rises from a fur brim, then flops over to one
 * side with the pompom hanging. Built as a tube along that bent path whose
 * radius tapers to the tip, with gentle bulges and creases for the folds.
 */
function santaHat(x: number): Group {
  const path = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0, 0.09, 0),
    new Vector3(0.02, 0.17, 0.01),
    new Vector3(0.09, 0.22, 0.02),
    new Vector3(0.16, 0.19, 0.03),
    new Vector3(0.2, 0.12, 0.03),
  ]);
  const rings = 40;
  const sides = 20;
  const body = new TubeGeometry(path, rings, 1, sides, false);

  // TubeGeometry lays vertices out ring by ring; reshape each ring around its centre.
  const pos = body.attributes.position;
  const centre = new Vector3();
  const v = new Vector3();
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    path.getPointAt(t, centre);
    const taper = 0.12 * Math.pow(1 - t, 0.85) + 0.012;
    for (let side = 0; side <= sides; side++) {
      const i = ring * (sides + 1) + side;
      const angle = (side / sides) * Math.PI * 2;
      const folds = 1 + 0.07 * Math.sin(t * 13) + 0.05 * Math.sin(angle * 3 + t * 7);
      v.fromBufferAttribute(pos, i).sub(centre).normalize().multiplyScalar(taper * folds).add(centre);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  body.computeVertexNormals();

  const velvet = new MeshPhysicalMaterial({
    color: "#9e0f26",
    roughness: 0.85,
    sheen: 1,
    sheenRoughness: 0.4,
    sheenColor: "#ff5a6e",
  });
  // Fur stays grey-white: pure white glows under the ceiling spotlight.
  const fur = new MeshStandardMaterial({ color: "#9c9c9c", roughness: 1 });

  const g = new Group();
  g.add(mesh(body, velvet, 0, 0, 0));
  g.add(mesh(fluff(new TorusGeometry(0.122, 0.038, 12, 36).rotateX(Math.PI / 2), 0.05), fur, 0, 0.01, 0));
  const tip = path.getPointAt(1);
  g.add(mesh(fluff(new IcosahedronGeometry(0.04, 2), 0.12), fur, tip.x, tip.y - 0.03, tip.z));
  g.position.set(x, TOP + 0.03, -0.12);
  g.rotation.y = 0.3; // flop to the side, angled slightly back, so its silhouette reads from the front
  return g;
}

/** A wrapped box with a ribbon cross, sitting on the floor. */
function present(size: [number, number, number], paper: string, ribbon: string, x: number, z: number, turn: number): Group {
  const [w, h, d] = size;
  const g = new Group();
  const tie = gloss(ribbon);
  g.add(mesh(new BoxGeometry(w, h, d), matte(paper), 0, h / 2, 0));
  g.add(mesh(new BoxGeometry(w + 0.004, h + 0.004, 0.025), tie, 0, h / 2, 0));
  g.add(mesh(new BoxGeometry(0.025, h + 0.004, d + 0.004), tie, 0, h / 2, 0));
  g.add(mesh(new TorusGeometry(0.03, 0.01, 8, 16), tie, 0, h + 0.02, 0));
  g.position.set(x, 0, z);
  g.rotation.y = turn;
  return g;
}

// --- birthday -----------------------------------------------------------------

function birthday(cabinet: Group): Animate {
  const stripes = paint(128, 128, (ctx) => {
    ctx.fillStyle = "#ff6fa3";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#ffd166";
    for (let x = -128; x < 128; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.lineTo(x + 16, 128);
      ctx.lineTo(x + 144, 0);
      ctx.lineTo(x + 128, 0);
      ctx.fill();
    }
  });
  stripes.wrapS = stripes.wrapT = RepeatWrapping;
  stripes.repeat.set(3, 1);
  // Paper under a spotlight: dimmed, or bloom turns it into a lamp.
  const paper = new MeshStandardMaterial({ map: stripes, color: "#8c8c8c", roughness: 0.8, side: DoubleSide });
  cabinet.add(partyHat(paper, matte("#bdbdbd"), -0.18, 0.22));

  // Balloons tied to the top-right corner, each bobbing on its own beat. Kept
  // low and to the side so they frame the wall sign rather than cover it.
  const anchor = new Vector3(HALF - 0.06, TOP, 0.05);
  const string = new MeshStandardMaterial({ color: "#b8b0cc", roughness: 0.6 });
  const balloons = [
    { color: "#ff4f8b", at: new Vector3(0.44, 2.3, 0.0) },
    { color: "#ffc93b", at: new Vector3(0.6, 2.42, -0.08) },
    { color: "#2a9fd0", at: new Vector3(0.3, 2.2, 0.08) },
  ].map(({ color, at }, i) => {
    const g = new Group();
    const shell = mesh(new SphereGeometry(0.11, 24, 18), gloss(color, { roughness: 0.4 }), 0, 0, 0);
    shell.scale.set(1, 1.18, 1);
    g.add(shell, mesh(new ConeGeometry(0.018, 0.03, 10), gloss(color), 0, -0.14, 0));
    g.position.copy(at);
    // The string is drawn in the balloon's own frame, back down to the anchor.
    const local = anchor.clone().sub(at);
    g.add(cord([new Vector3(0, -0.15, 0), local.clone().multiplyScalar(0.5).add(new Vector3(0.03, 0, 0)), local], 0.0025, string));
    cabinet.add(g);
    return { g, at, phase: i * 2.1 };
  });

  // Pennant bunting sagging across the top of the marquee.
  const pennant = new ShapeGeometry(new Shape().moveTo(-0.035, 0).lineTo(0.035, 0).lineTo(0, -0.055).closePath());
  const colours = ["#ff4f8b", "#ffc93b", "#36c9ff", "#8a5cff", "#4dff9a"];
  // Along the top edge with a shallow sag, so the flags frame the title rather than cover it.
  const line = sag(new Vector3(-HALF - 0.02, TOP + 0.005, FRONT + 0.012), new Vector3(HALF + 0.02, TOP + 0.005, FRONT + 0.012), 0.02, 9);
  cabinet.add(cord(line, 0.003, string));
  line.slice(1, -1).forEach((p, i) => {
    const flag = new Mesh(pennant, new MeshStandardMaterial({
      color: colours[i % colours.length], roughness: 0.7, side: DoubleSide,
    }));
    flag.position.copy(p);
    cabinet.add(flag);
  });

  return (time) => {
    for (const { g, at, phase } of balloons) {
      g.position.y = at.y + Math.sin(time * 1.1 + phase) * 0.025;
      g.rotation.z = Math.sin(time * 0.7 + phase) * 0.06;
    }
  };
}

// --- christmas ----------------------------------------------------------------

function christmas(cabinet: Group): Animate {
  // No snow on top: the ceiling spotlight shines straight down on it, and any
  // pale surface there glows like a lamp. Whites are kept grey for the same reason.
  cabinet.add(santaHat(0.02));

  // A garland along the marquee's top edge, clear of the title, hung with baubles.
  const needles = new MeshStandardMaterial({ color: "#1f5a32", roughness: 0.9 });
  const drape = sag(new Vector3(-HALF - 0.03, TOP + 0.015, FRONT + 0.03), new Vector3(HALF + 0.03, TOP + 0.015, FRONT + 0.03), 0.025, 9);
  cabinet.add(cord(drape, 0.02, needles));
  const baubles = ["#d4142a", "#ffc93b", "#b9b9c4", "#d4142a"];
  drape.slice(2, -2).forEach((p, i) => {
    const b = mesh(new SphereGeometry(0.018, 14, 10), gloss(baubles[i % baubles.length], { metalness: 0.6, roughness: 0.3 }), p.x, p.y - 0.03, p.z + 0.01);
    cabinet.add(b);
  });

  // Fairy lights round the marquee face and down the front edges; they twinkle.
  const bulbColours = ["#ff3b3b", "#3bff7a", "#ffd23b", "#3bb4ff"];
  const path: Vector3[] = [];
  for (let i = 0; i <= 10; i++) path.push(new Vector3(-HALF + (i / 10) * 2 * HALF, 1.665, FRONT + 0.02));
  for (let i = 1; i <= 6; i++) path.push(new Vector3(HALF + 0.03, 1.66 - i * 0.1, 0.12));
  for (let i = 1; i <= 6; i++) path.push(new Vector3(-HALF - 0.03, 1.66 - i * 0.1, 0.12));
  const bulbs = path.map((p, i) => {
    const material = new MeshBasicMaterial({ color: bulbColours[i % bulbColours.length] });
    const base = material.color.clone();
    cabinet.add(mesh(new SphereGeometry(0.011, 8, 6), material, p.x, p.y, p.z));
    return { material, base, phase: i * 1.7 };
  });

  // Presents waiting on the floor in front of the cabinet.
  cabinet.add(present([0.2, 0.16, 0.2], "#c8102e", "#ffd23b", 0.36, 0.62, 0.4));
  cabinet.add(present([0.14, 0.11, 0.14], "#1f7a3e", "#f4f4f4", 0.2, 0.72, -0.3));

  return (time) => {
    for (const { material, base, phase } of bulbs) {
      const twinkle = 0.55 + 0.45 * Math.max(0, Math.sin(time * 2.4 + phase));
      material.color.copy(base).multiplyScalar(twinkle);
    }
  };
}

const DECORATORS: Partial<Record<GameEntry["occasion"], (cabinet: Group) => Animate>> = {
  Birthday: birthday,
  Christmas: christmas,
};

/** Dresses the cabinet for its game's occasion. Returns its animation, if any. */
export function decorate(cabinet: Group, occasion: GameEntry["occasion"]): Animate | null {
  return DECORATORS[occasion]?.(cabinet) ?? null;
}
