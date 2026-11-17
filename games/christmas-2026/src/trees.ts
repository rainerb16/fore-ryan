// Snow-laden spruce. Each tree is built from tiers of drooping, feathery
// branches round a slim core, longest at the bottom and shortening to a spire,
// with snow settled on the upper faces of the boughs (coloured per vertex by
// which way it faces). Trees near the jump get the full detail; distant ones a
// lighter version of the same shape. All instanced: two draw calls for the woods.

import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
  type Scene,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seeded } from "./random";


const NEEDLES = new Color("#1b3526");
const NEEDLES_DARK = new Color("#0e1f16");
const SNOW = new Color("#dfe6f2");
const BARK = new Color("#3a2a1e");

/** Colours a part by which way each vertex faces: snow on top, shadowed needles below. */
function paint(geometry: BufferGeometry, base: Color, snowy: boolean, rand: () => number): BufferGeometry {
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(normals.count * 3);
  const c = new Color();
  for (let i = 0; i < normals.count; i++) {
    const up = normals.getY(i);
    c.copy(NEEDLES_DARK).lerp(base, MathUtils.smoothstep(up, -0.6, 0.3));
    if (snowy) c.lerp(SNOW, MathUtils.smoothstep(up, 0.25, 0.75) * (0.75 + rand() * 0.25));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

interface Detail {
  tiers: number;
  sides: number;
  branches: number;
}

/** One spruce, 1 m tall, its foot at the origin; instances scale it to size. */
function spruce(detail: Detail, seed: number): BufferGeometry {
  const rand = seeded(seed);
  const parts: BufferGeometry[] = [];
  const m = new Matrix4();

  const trunk = new CylinderGeometry(0.02, 0.035, 0.2, 6).translate(0, 0.1, 0);
  parts.push(paint(trunk, BARK, false, rand));
  const core = new ConeGeometry(0.11, 0.9, detail.sides + 2).translate(0, 0.53, 0);
  parts.push(paint(core, NEEDLES, true, rand));

  for (let k = 0; k < detail.tiers; k++) {
    const t = k / (detail.tiers - 1); // 0 at the bottom tier, 1 at the top
    const y = 0.14 + t * 0.78;
    const reach = 0.33 * Math.pow(1 - t, 0.9) + 0.035;
    const count = Math.max(4, Math.round(detail.branches * (1 - t * 0.45)));
    // Lower boughs droop more under their snow.
    const droop = 0.18 + 0.32 * (1 - t);
    const shade = NEEDLES.clone().offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.05);
    for (let b = 0; b < count; b++) {
      const angle = (b / count) * Math.PI * 2 + k * 0.9 + (rand() - 0.5) * 0.5;
      const length = reach * (0.85 + rand() * 0.3);
      // A flattened cone: a fan of needles, thick at the trunk, tapering to the tip.
      // Open-ended: its base is hidden against the core anyway.
      const bough = new ConeGeometry(length * 0.34, length, detail.sides, 1, true);
      bough.rotateZ(-Math.PI / 2).translate(length / 2, 0, 0);
      bough.scale(1, 0.4, 1);
      m.makeRotationZ(-(droop + (rand() - 0.5) * 0.15));
      bough.applyMatrix4(m);
      m.makeRotationY(angle);
      bough.applyMatrix4(m);
      bough.translate(0, y + (rand() - 0.5) * 0.02, 0);
      parts.push(paint(bough, shade, true, rand));
    }
  }
  const spire = new ConeGeometry(0.025, 0.12, detail.sides).translate(0, 0.98, 0);
  parts.push(paint(spire, NEEDLES, true, rand));

  // Merge everything into one mesh, as plain triangle lists.
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  return merged;
}

export interface TreeSpot {
  x: number;
  y: number;
  z: number;
  /** Height in metres. */
  height: number;
}

/** Plants the woods: full-detail trees at `near` spots, lighter ones at `far`. */
export function plantForest(scene: Scene, near: TreeSpot[], far: TreeSpot[], lowPower: boolean): void {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const sets: Array<[TreeSpot[], Detail, boolean]> = [
    [near, lowPower ? { tiers: 10, sides: 5, branches: 7 } : { tiers: 16, sides: 6, branches: 9 }, !lowPower],
    [far, { tiers: 7, sides: 4, branches: 6 }, false],
  ];
  const rand = seeded(77);
  const dummy = new Object3D();
  const tint = new Color();
  sets.forEach(([spots, detail, shadows], s) => {
    if (spots.length === 0) return;
    const trees = new InstancedMesh(spruce(detail, 11 + s), material, spots.length);
    spots.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.3, p.z);
      // Spruce are slim: about 0.4–0.5 times as wide as they are tall.
      const girth = 0.55 + rand() * 0.15;
      dummy.scale.set(p.height * girth, p.height, p.height * girth);
      dummy.rotation.set((rand() - 0.5) * 0.05, rand() * Math.PI * 2, (rand() - 0.5) * 0.05);
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
      trees.setColorAt(i, tint.setScalar(0.85 + rand() * 0.25));
    });
    trees.castShadow = shadows;
    trees.receiveShadow = true;
    scene.add(trees);
  });
}
