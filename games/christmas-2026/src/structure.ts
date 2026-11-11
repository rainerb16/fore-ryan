// The jump itself, after Canada Olympic Park: the inrun as a steel deck raised on
// columns, running down from a tall white tower with a lit cab, a smaller jump
// alongside, and floodlight towers down the landing hill.

import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  SpotLight,
  Vector3,
  type Scene,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { hillY, inrunPoints, xAtDistance } from "../rules";
import { glowing } from "./glow";
import { groundY } from "./terrain";

const DECK_WIDTH = 4.6;

const steel = new MeshStandardMaterial({ color: "#5a6170", roughness: 0.55, metalness: 0.6 });
const deckMat = new MeshStandardMaterial({ color: "#e9eef8", roughness: 0.8 });
const concrete = new MeshStandardMaterial({ color: "#cfd5df", roughness: 0.85 });

/** Places a unit cylinder (radius 0.5, height 1) between two points as a round strut. */
function strut(mesh: InstancedMesh, i: number, a: Vector3, b: Vector3, thickness: number, dummy: Object3D): void {
  dummy.position.copy(a).add(b).multiplyScalar(0.5);
  dummy.scale.set(thickness, a.distanceTo(b), thickness);
  dummy.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

/** A cross-section point: [across the track (z), up from the track surface]. */
type Section = Array<[number, number]>;

/** A rectangle with rounded corners, counter-clockwise as seen looking down the track. */
function roundedRect(halfWidth: number, top: number, bottom: number, r: number): Section {
  const corners: Array<[number, number, number]> = [
    [halfWidth - r, top - r, 0],
    [-halfWidth + r, top - r, 90],
    [-halfWidth + r, bottom + r, 180],
    [halfWidth - r, bottom + r, 270],
  ];
  const out: Section = [];
  for (const [cz, cu, start] of corners) {
    for (let k = 0; k <= 3; k++) {
      const a = ((start + k * 30) * Math.PI) / 180;
      out.push([cz + Math.cos(a) * r, cu + Math.sin(a) * r]);
    }
  }
  return out;
}

const circle = (z: number, up: number, r: number, sides = 8): Section =>
  Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [z + Math.cos(a) * r, up + Math.sin(a) * r] as [number, number];
  });

/**
 * Sweeps a cross-section down a path that runs downhill (+x) in a vertical
 * plane, keeping it square to the slope: one smooth, continuous piece, so the
 * deck and rails curve with the inrun instead of stepping in straight segments.
 */
function sweep(path: Vector3[], section: Section): BufferGeometry {
  const ring = section.length;
  const positions = new Float32Array(path.length * ring * 3);
  const tangent = new Vector3();
  path.forEach((p, i) => {
    tangent.subVectors(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
    // Square to the track, pointing up off its surface.
    const nx = -tangent.y;
    const ny = tangent.x;
    section.forEach(([z, up], k) => {
      positions.set([p.x + nx * up, p.y + ny * up, p.z + z], (i * ring + k) * 3);
    });
  });
  const index: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      index.push(a, a + ring, b, b, a + ring, b + ring);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * An inrun deck on steel columns, from the start gate down to the lip, plus its
 * tower. `scale` shrinks the whole jump (the smaller hill beside the big one).
 */
function jump(scene: Scene, scale: number, at: Vector3, withLamps: boolean): void {
  const pts = inrunPoints(3).map(([x, y]) => new Vector3(at.x + x * scale, at.y + y * scale, at.z));
  const smooth = inrunPoints(1).map(([x, y]) => new Vector3(at.x + x * scale, at.y + y * scale, at.z));
  const group = new Group();
  const dummy = new Object3D();
  const half = (DECK_WIDTH * scale) / 2;

  // The deck and its two railings, each one smooth piece following the inrun's curve.
  group.add(new Mesh(sweep(smooth, roundedRect(half, 0, -0.7 * scale, 0.18 * scale)), deckMat));
  for (const side of [-1, 1]) group.add(new Mesh(sweep(smooth, circle(side * half, 0.9 * scale, 0.06)), steel));

  // Round columns down to the ground every few metres, with diagonal bracing.
  const step = 3;
  const cols: Vector3[][] = [];
  for (let i = 0; i < pts.length - 4; i += step) {
    const p = pts[i];
    const ground = groundY(p.x, p.z);
    if (p.y - ground < 1.5) continue;
    cols.push([-1, 1].map((s) => new Vector3(p.x, p.y - 0.7, p.z + s * (DECK_WIDTH * scale) * 0.4)));
    cols[cols.length - 1].push(new Vector3(p.x, ground, p.z));
  }
  const rod = new CylinderGeometry(0.5, 0.5, 1, 12);
  const columns = new InstancedMesh(rod, steel, cols.length * 2);
  const braces = new InstancedMesh(rod, steel, Math.max(0, cols.length - 1) * 2);
  cols.forEach(([l, r, g], i) => {
    for (const [k, top] of [[0, l], [1, r]] as const) strut(columns, i * 2 + k, top, new Vector3(top.x, g.y, top.z), 0.45, dummy);
    if (i > 0) {
      const [pl, , pg] = cols[i - 1];
      // A diagonal from each column's foot up to the next one's head, on the near side.
      const mid = (a: Vector3, b: Vector3): Vector3 => a.clone().lerp(b, 0.5);
      strut(braces, (i - 1) * 2, new Vector3(pl.x, pg.y + 1, pl.z), new Vector3(l.x, mid(l, g).y, l.z), 0.18, dummy);
      strut(braces, (i - 1) * 2 + 1, new Vector3(pl.x, mid(pl, pg).y, pl.z), new Vector3(l.x, g.y + 1, l.z), 0.18, dummy);
    }
  });
  group.add(columns, braces);

  // The tower at the top: white concrete with softened edges and fins, a lit cab, and a warning light.
  const gate = pts[0];
  const foot = groundY(gate.x - 6 * scale, gate.z);
  const height = gate.y + 16 * scale - foot;
  const w = 11 * scale;
  const rounded = (x: number, y: number, z: number, r: number): RoundedBoxGeometry => new RoundedBoxGeometry(x, y, z, 3, r);
  const tower = new Mesh(rounded(w, height, w, 0.6 * scale), concrete);
  tower.position.set(gate.x - 6 * scale, foot + height / 2, gate.z);
  group.add(tower);
  for (const dz of [-0.3, 0, 0.3]) {
    const fin = new Mesh(rounded(w * 0.08, height * 0.9, w * 0.25, 0.2 * scale), concrete);
    fin.position.set(tower.position.x + w / 2 + w * 0.04, tower.position.y, gate.z + dz * w);
    group.add(fin);
  }
  const cab = new Mesh(rounded(w * 1.35, 6 * scale, w * 1.25, 0.8 * scale), concrete);
  cab.position.set(tower.position.x, foot + height + 3 * scale, gate.z);
  const glass = new Mesh(rounded(w * 1.37, 1.8 * scale, w * 1.27, 0.5 * scale), new MeshBasicMaterial({ color: glowing("#ffd9a0", 1.6) }));
  glass.position.set(cab.position.x, cab.position.y + 0.4 * scale, gate.z);
  const beacon = new Mesh(new SphereGeometry(0.6 * scale, 16, 12), new MeshBasicMaterial({ color: glowing("#ff2030", 3) }));
  beacon.position.set(cab.position.x, cab.position.y + 4 * scale, gate.z);
  group.add(cab, glass, beacon);

  if (withLamps) {
    // Warm lamps on posts along both railings.
    const lampPts = inrunPoints(8).map(([x, y]) => new Vector3(at.x + x, at.y + y, at.z));
    const lamps = new InstancedMesh(new SphereGeometry(0.22, 14, 10),new MeshBasicMaterial({ color: glowing("#ffd9a0", 2.5) }), lampPts.length * 2);
    lampPts.forEach((p, i) => {
      for (const s of [0, 1]) {
        dummy.position.set(p.x, p.y + 1.6, p.z + (s ? 1 : -1) * (DECK_WIDTH / 2 + 0.1));
        dummy.scale.setScalar(1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        lamps.setMatrixAt(i * 2 + s, dummy.matrix);
      }
    });
    group.add(lamps);
  }

  group.traverse((n) => {
    if (n instanceof Mesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  scene.add(group);
}

/** Floodlight towers down the far side of the landing hill, lighting it up. */
function floodlights(scene: Scene, lowPower: boolean): void {
  const head = new MeshBasicMaterial({ color: glowing("#fff4dc", 4) });
  for (const d of [30, 75, 120, 165]) {
    const x = xAtDistance(d);
    const z = -22;
    const base = groundY(x, z);
    const pole = new Mesh(new CylinderGeometry(0.25, 0.4, 26, 16), steel);
    pole.position.set(x, base + 13, z);
    const frame = new Mesh(new RoundedBoxGeometry(3.2, 1.6, 0.6, 3, 0.15), steel);
    frame.position.set(x, base + 26.5, z + 0.3);
    frame.rotation.x = -0.4;
    const lamps = new Mesh(new RoundedBoxGeometry(2.8, 1.2, 0.1, 2, 0.04), head);
    lamps.position.set(x, base + 26.4, z + 0.62);
    lamps.rotation.x = -0.4;
    scene.add(pole, frame, lamps);

    // Real light, thrown across and down the hill. Phones get every other one.
    if (lowPower && d % 2 === 0) continue;
    const beam = new SpotLight("#fff1d6", lowPower ? 70 : 40, 170, 0.8, 0.75, 1);
    beam.position.set(x, base + 26, z + 0.8);
    beam.target.position.set(xAtDistance(d + 12), hillY(xAtDistance(d + 12)), 6);
    scene.add(beam, beam.target);
  }
}

/** A warm light from the top of the tower down the inrun, where the jumper starts. */
function inrunLight(scene: Scene): void {
  const [gx, gy] = inrunPoints(4)[0];
  const light = new SpotLight("#ffd9a0", 35, 140, 0.55, 0.8, 1);
  light.position.set(gx - 6, gy + 20, 6);
  const [mx, my] = inrunPoints(4)[Math.floor(inrunPoints(4).length * 0.6)];
  light.target.position.set(mx, my, 0);
  scene.add(light, light.target);
}

export function buildStructures(scene: Scene, lowPower: boolean): void {
  jump(scene, 1, new Vector3(0, 0, 0), true);
  // The smaller hill beside the big one, its lip set into the slope.
  const z = -46;
  jump(scene, 0.66, new Vector3(18, groundY(18, z) + 1.5, z), false);
  floodlights(scene, lowPower);
  inrunLight(scene);
}
