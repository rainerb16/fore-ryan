// The room dressed for Christmas (see season.ts): a string of bulbs tacked
// along the trim above the cabinets, and a lit tree with presents between the
// poster and the first cabinet.
// Bulbs are instanced, so a whole wall of them is one draw call.

import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
} from "three";
import { present } from "./decorations";

const BULB_COLOURS = ["#ff3b3b", "#3bff7a", "#ffd23b", "#3bb4ff", "#ff7af0"];

/** Advances the twinkle; called every frame. */
export type Festive = (time: number) => void;

export interface FestiveOptions {
  /** Height of the wall trim the bulbs are tacked along, and where the wall is. */
  trimY: number;
  wallZ: number;
  /** Where the tree stands. */
  treeX: number;
  treeZ: number;
  /** Stretches of wall the bulbs skip, as [from, to] in x: the poster hangs there. */
  skip: Array<[number, number]>;
}

/** Many small bulbs as one mesh; returns the twinkle for them. */
function bulbs(scene: Scene, at: Array<[number, number, number]>, radius: number, brightness: number): (time: number) => void {
  const mesh = new InstancedMesh(new SphereGeometry(radius, 8, 6), new MeshBasicMaterial(), at.length);
  const m = new Matrix4();
  const base = at.map((_, i) => new Color(BULB_COLOURS[i % BULB_COLOURS.length]).multiplyScalar(brightness));
  at.forEach(([x, y, z], i) => {
    mesh.setMatrixAt(i, m.makeTranslation(x, y, z));
    mesh.setColorAt(i, base[i]);
  });
  scene.add(mesh);
  const c = new Color();
  return (time) => {
    for (let i = 0; i < at.length; i++) {
      // A slow chase along the string, with each bulb's own little flicker.
      const chase = 0.5 + 0.5 * Math.sin(time * 1.6 - i * 0.35);
      const flicker = 0.85 + 0.15 * Math.sin(time * 7 + i * 2.3);
      mesh.setColorAt(i, c.copy(base[i]).multiplyScalar((0.45 + 0.55 * chase) * flicker));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
}

function star(r: number): ShapeGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.42 : r;
    if (i === 0) shape.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    else shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return new ShapeGeometry(shape);
}

/** A small, lit tree, about 1.2 m tall, with presents round its foot. */
const TREE_SCALE = 0.85;
function tree(scene: Scene, x: number, z: number): (time: number) => void {
  const g = new Group();
  const needles = new MeshStandardMaterial({ color: "#1d5a33", roughness: 0.9 });
  const trunk = new Mesh(new CylinderGeometry(0.04, 0.05, 0.2, 10), new MeshStandardMaterial({ color: "#4a2e1c", roughness: 0.9 }));
  trunk.position.y = 0.1;
  g.add(trunk);
  // Three tiers, each overlapping the one below.
  for (const [r, h, y] of [[0.3, 0.6, 0.45], [0.24, 0.5, 0.8], [0.17, 0.42, 1.11]] as const) {
    const tier = new Mesh(new ConeGeometry(r, h, 20), needles);
    tier.position.y = y;
    g.add(tier);
  }
  const top = new Mesh(star(0.09), new MeshBasicMaterial({ color: new Color("#ffd166").multiplyScalar(1.6), side: DoubleSide }));
  top.position.set(0, 1.4, 0.02);
  g.add(top);
  g.add(present([0.2, 0.15, 0.18], "#c8102e", "#ffd23b", 0.2, 0.22, 0.4));
  g.add(present([0.14, 0.12, 0.14], "#1f7a3e", "#f4f4f4", -0.17, 0.2, -0.3));
  g.add(present([0.12, 0.2, 0.12], "#2a4fb8", "#e8e8e8", 0.02, 0.3, 0.1));
  g.position.set(x, 0, z);
  g.scale.setScalar(TREE_SCALE);
  scene.add(g);

  // Bulbs spiralling up round the tree, just proud of its branches.
  const at: Array<[number, number, number]> = [];
  const count = 46;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = 0.22 + t * 1.08;
    const r = 0.3 * (1 - (y - 0.18) / 1.16) + 0.02;
    const a = t * Math.PI * 2 * 4.5;
    at.push([x + Math.cos(a) * r * TREE_SCALE, y * TREE_SCALE, z + Math.sin(a) * r * TREE_SCALE]);
  }
  return bulbs(scene, at, 0.014, 1.3);
}

export function decorateRoom(scene: Scene, o: FestiveOptions): Festive {
  // Along the trim, the length of the wall.
  const trim: Array<[number, number, number]> = [];
  for (let x = -18; x <= 18; x += 0.14) {
    if (o.skip.some(([from, to]) => x >= from && x <= to)) continue;
    trim.push([x, o.trimY - 0.035, o.wallZ + 0.05]);
  }
  const twinkleTrim = bulbs(scene, trim, 0.016, 1.1);
  const twinkleTree = tree(scene, o.treeX, o.treeZ);
  return (time) => {
    twinkleTrim(time);
    twinkleTree(time);
  };
}
