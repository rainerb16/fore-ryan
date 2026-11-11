// The land around the jump, modelled on Canada Olympic Park: the landing hill
// cut into a hillside, rolling snowy hills beyond, and spruce woods in clumps.
// Along the track (|z| < 8) the ground is exactly the simulation's landing
// profile; away from it, it blends into noise-driven hills.

import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  type Scene,
} from "three";
import { hillY, inrunPoints, LANDING } from "../rules";

// --- noise ----------------------------------------------------------------------

function hash(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth value noise in about -1..1. */
function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Layered noise: broad hills with smaller rolls on top. */
const fbm = (x: number, z: number): number =>
  noise(x / 260, z / 260) * 0.6 + noise(x / 110, z / 110) * 0.28 + noise(x / 40, z / 40) * 0.12;

// --- the ground ---------------------------------------------------------------------

const TOP = inrunPoints(4)[0]; // the start gate, [x, y]
/** The hilltop the jump tower stands on sits this far below the gate. */
const TOWER_HEIGHT = 34;

/** The natural ground along the jump's line: under the inrun, then the landing hill. */
export function lineY(x: number): number {
  if (x >= 0) return hillY(Math.min(x, LANDING.end));
  // Rises from just below the lip to the hilltop under the tower, then eases off behind it.
  const t = Math.min(1, x / TOP[0]);
  const rise = t * t * (3 - 2 * t);
  const hilltop = TOP[1] - TOWER_HEIGHT;
  const beyond = Math.max(0, TOP[0] - x);
  return hillY(0) + (hilltop - hillY(0)) * rise - beyond * 0.12;
}

/** Half-width of the flat, groomed strip either side of the track. */
const CORRIDOR = 24;
/**
 * How far the ground sits below the landing surface in that strip. The ground
 * mesh is coarse (~13 m between points), and between points it cuts corners;
 * this margin keeps it from ever rising through the slab Ryan lands on.
 */
const SINK = 1.2;

/** Ground height anywhere: the jump's line near the track, rolling hills away from it. */
export function groundY(x: number, z: number): number {
  const along = lineY(Math.max(-500, Math.min(x, LANDING.end + 200)));
  const away = Math.abs(z);
  const core = along - SINK;
  if (away <= CORRIDOR) return core;

  const w = Math.max(0, 1 - (away - CORRIDOR) / 80);
  const blend = w * w * (3 - 2 * w);
  // Hills grow with distance from the track, so the land beside the jump stays
  // near its level. Behind the track it rolls into hills; on the camera's side
  // it only falls gently away, so nothing rises between the camera and Ryan.
  const grow = Math.min(1, (away - CORRIDOR) / 220);
  const hills = z < 0
    ? core - 3 + fbm(x, z) * (6 + 60 * grow) + grow * 25
    : core - (away - CORRIDOR) * 0.25 + fbm(x, z) * 4 * grow;
  return core * blend + hills * (1 - blend);
}

function ground(lowPower: boolean): Mesh {
  const segs = lowPower ? [110, 70] : [200, 130];
  const geometry = new PlaneGeometry(2600, 1500, segs[0], segs[1]);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(350, 0, -620);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const snow = new Color("#e6edfb");
  const shade = new Color("#b9c6e3");
  const scrub = new Color("#5d6a80");
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundY(x, z);
    pos.setY(i, y);
    // Wind-scoured slopes and woodland floor show through the snow in patches.
    const patch = noise(x / 55 + 9, z / 55 - 3);
    const nearTrack = Math.abs(z) < 14 && x > -140 && x < LANDING.end + 60;
    c.copy(snow).lerp(shade, 0.5 + 0.5 * noise(x / 18, z / 18));
    if (!nearTrack && patch > 0.35) c.lerp(scrub, Math.min(1, (patch - 0.35) * 2.2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The groomed landing hill itself, a slab whose top is the exact profile the
 * simulation lands on, so Ryan touches down on the surface you see.
 */
function landingSlab(): Mesh {
  // The underside follows the profile 5 m down. A straight underside would cut
  // above the curved hill and fold the outline over itself.
  const top: Array<[number, number]> = [[-6, hillY(0)]];
  for (let x = 0; x <= LANDING.end + 120; x += 1.5) top.push([x, hillY(Math.min(x, LANDING.end))]);
  const shape = new Shape();
  shape.moveTo(top[0][0], top[0][1]);
  for (const [x, y] of top.slice(1)) shape.lineTo(x, y);
  for (const [x, y] of top.reverse()) shape.lineTo(x, y - 5);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 16, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -8);
  const slab = new Mesh(geometry, new MeshStandardMaterial({ color: "#eef3ff", roughness: 0.85 }));
  slab.receiveShadow = true;
  return slab;
}

// --- woods ----------------------------------------------------------------------------

/** Spruce: three stacked cones on a short trunk, with snow on the boughs. */
function forest(scene: Scene, lowPower: boolean): void {
  const wanted = lowPower ? 450 : 1100;
  const spots: Array<[number, number, number, number]> = [];
  for (let i = 0; spots.length < wanted && i < wanted * 12; i++) {
    const x = -450 + hash(i, 1) * 1700;
    const z = 20 - hash(i, 2) * 820;
    // Keep the jump clear: the track, the inrun corridor, and the run-out.
    if (Math.abs(z) < 16 && x > -160 && x < LANDING.end + 80) continue;
    // Woods grow in clumps: only where the clump noise is high.
    if (noise(x / 70 - 4, z / 70 + 2) < 0.1 + hash(i, 3) * 0.25) continue;
    spots.push([x, groundY(x, z), z, 0.7 + hash(i, 4) * 0.9]);
  }

  const needles = new MeshStandardMaterial({ color: "#16301f", roughness: 1 });
  const snowy = new MeshStandardMaterial({ color: "#cbd6ec", roughness: 1 });
  const bark = new MeshStandardMaterial({ color: "#3a2a1e", roughness: 1 });
  const tiers: Array<[ConeGeometry, number, MeshStandardMaterial]> = [
    [new ConeGeometry(3.2, 6, 8), 3.5, needles],
    [new ConeGeometry(2.4, 5, 8), 6.5, needles],
    [new ConeGeometry(1.5, 4.2, 8), 9.4, needles],
    [new ConeGeometry(1.1, 2.4, 8), 10.6, snowy],
  ];
  const trunk = new InstancedMesh(new CylinderGeometry(0.35, 0.45, 2, 6), bark, spots.length);
  const layers = tiers.map(([g, , m]) => new InstancedMesh(g, m, spots.length));
  const dummy = new Object3D();
  const m = new Matrix4();
  spots.forEach(([x, y, z, k], i) => {
    dummy.position.set(x, y + k, z);
    dummy.scale.set(k, k, k);
    dummy.rotation.y = hash(i, 5) * Math.PI;
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    tiers.forEach(([, height], t) => {
      m.makeTranslation(0, height - 1, 0);
      layers[t].setMatrixAt(i, dummy.matrix.clone().multiply(m));
    });
  });
  for (const l of [trunk, ...layers]) {
    l.castShadow = !lowPower;
    scene.add(l);
  }
}

export function buildTerrain(scene: Scene, lowPower: boolean): void {
  scene.add(ground(lowPower), landingSlab());
  forest(scene, lowPower);
}
