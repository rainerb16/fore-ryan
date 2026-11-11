// The jump itself, after Canada Olympic Park: the inrun as a steel deck raised on
// columns, running down from a tall white tower with a lit cab, a smaller jump
// alongside, and floodlight towers down the landing hill.

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type Scene,
} from "three";
import { inrunPoints, xAtDistance } from "../rules";
import { groundY } from "./terrain";

const DECK_WIDTH = 4.6;

const steel = new MeshStandardMaterial({ color: "#5a6170", roughness: 0.55, metalness: 0.6 });
const deckMat = new MeshStandardMaterial({ color: "#e9eef8", roughness: 0.8 });
const concrete = new MeshStandardMaterial({ color: "#cfd5df", roughness: 0.85 });

/** Places one unit box between two points as a beam of the given thickness. */
function beam(mesh: InstancedMesh, i: number, a: Vector3, b: Vector3, w: number, h: number, dummy: Object3D): void {
  dummy.position.copy(a).add(b).multiplyScalar(0.5);
  dummy.scale.set(a.distanceTo(b), h, w);
  dummy.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x));
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

/**
 * An inrun deck on steel columns, from the start gate down to the lip, plus its
 * tower. `scale` shrinks the whole jump (the smaller hill beside the big one).
 */
function jump(scene: Scene, scale: number, at: Vector3, withLamps: boolean): void {
  const pts = inrunPoints(3).map(([x, y]) => new Vector3(at.x + x * scale, at.y + y * scale, at.z));
  const group = new Group();
  const dummy = new Object3D();
  const box = new BoxGeometry(1, 1, 1);

  // Deck and the two railings, segment by segment.
  const deck = new InstancedMesh(box, deckMat, pts.length - 1);
  const rails = new InstancedMesh(box, steel, (pts.length - 1) * 2);
  for (let i = 1; i < pts.length; i++) {
    beam(deck, i - 1, pts[i - 1].clone().setY(pts[i - 1].y - 0.35), pts[i].clone().setY(pts[i].y - 0.35), DECK_WIDTH * scale, 0.7, dummy);
    for (const side of [0, 1]) {
      const z = (side ? 1 : -1) * (DECK_WIDTH * scale) / 2;
      const a = pts[i - 1].clone().add(new Vector3(0, 0.9, z));
      const b = pts[i].clone().add(new Vector3(0, 0.9, z));
      beam(rails, (i - 1) * 2 + side, a, b, 0.12, 0.12, dummy);
    }
  }
  group.add(deck, rails);

  // Columns down to the ground every few metres, with diagonal bracing.
  const step = Math.max(2, Math.round(9 / 3));
  const cols: Vector3[][] = [];
  for (let i = 0; i < pts.length - 4; i += step) {
    const p = pts[i];
    const ground = groundY(p.x, p.z);
    if (p.y - ground < 1.5) continue;
    cols.push([-1, 1].map((s) => new Vector3(p.x, p.y - 0.7, p.z + s * (DECK_WIDTH * scale) * 0.4)));
    cols[cols.length - 1].push(new Vector3(p.x, ground, p.z));
  }
  const columns = new InstancedMesh(box, steel, cols.length * 2);
  const braces = new InstancedMesh(box, steel, Math.max(0, cols.length - 1) * 2);
  cols.forEach(([l, r, g], i) => {
    for (const [k, top] of [[0, l], [1, r]] as const) {
      dummy.position.set(top.x, (top.y + g.y) / 2, top.z);
      dummy.scale.set(0.45, top.y - g.y, 0.45);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      columns.setMatrixAt(i * 2 + k, dummy.matrix);
    }
    if (i > 0) {
      const [pl, , pg] = cols[i - 1];
      // A diagonal from each column's foot up to the next one's head, on the near side.
      const mid = (a: Vector3, b: Vector3): Vector3 => a.clone().lerp(b, 0.5);
      beam(braces, (i - 1) * 2, new Vector3(pl.x, pg.y + 1, pl.z), new Vector3(l.x, mid(l, g).y, l.z), 0.18, 0.18, dummy);
      beam(braces, (i - 1) * 2 + 1, new Vector3(pl.x, mid(pl, pg).y, pl.z), new Vector3(l.x, g.y + 1, l.z), 0.18, 0.18, dummy);
    }
  });
  group.add(columns, braces);

  // The tower at the top: white concrete with fins, a lit cab, and a warning light.
  const gate = pts[0];
  const foot = groundY(gate.x - 6 * scale, gate.z);
  const height = gate.y + 16 * scale - foot;
  const w = 11 * scale;
  const tower = new Mesh(new BoxGeometry(w, height, w), concrete);
  tower.position.set(gate.x - 6 * scale, foot + height / 2, gate.z);
  group.add(tower);
  for (const dz of [-0.3, 0, 0.3]) {
    const fin = new Mesh(new BoxGeometry(w * 0.08, height * 0.9, w * 0.25), concrete);
    fin.position.set(tower.position.x + w / 2 + w * 0.04, tower.position.y, gate.z + dz * w);
    group.add(fin);
  }
  const cab = new Mesh(new BoxGeometry(w * 1.35, 6 * scale, w * 1.25), concrete);
  cab.position.set(tower.position.x, foot + height + 3 * scale, gate.z);
  const glass = new Mesh(new BoxGeometry(w * 1.37, 1.8 * scale, w * 1.27), new MeshBasicMaterial({ color: "#ffd9a0" }));
  glass.position.set(cab.position.x, cab.position.y + 0.4 * scale, gate.z);
  const beacon = new Mesh(new SphereGeometry(0.6 * scale, 10, 8), new MeshBasicMaterial({ color: "#ff2030" }));
  beacon.position.set(cab.position.x, cab.position.y + 4 * scale, gate.z);
  group.add(cab, glass, beacon);

  if (withLamps) {
    // Warm lamps on posts along both railings.
    const lampPts = inrunPoints(8).map(([x, y]) => new Vector3(at.x + x, at.y + y, at.z));
    const lamps = new InstancedMesh(new SphereGeometry(0.22, 8, 6), new MeshBasicMaterial({ color: "#ffd9a0" }), lampPts.length * 2);
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

/** Floodlight towers down the far side of the landing hill. */
function floodlights(scene: Scene): void {
  const head = new MeshBasicMaterial({ color: "#fff4dc" });
  for (const d of [30, 75, 120, 165]) {
    const x = xAtDistance(d);
    const z = -22;
    const base = groundY(x, z);
    const pole = new Mesh(new CylinderGeometry(0.25, 0.4, 26, 8), steel);
    pole.position.set(x, base + 13, z);
    const frame = new Mesh(new BoxGeometry(3.2, 1.6, 0.6), steel);
    frame.position.set(x, base + 26.5, z + 0.3);
    frame.rotation.x = -0.4;
    const lamps = new Mesh(new BoxGeometry(2.8, 1.2, 0.1), head);
    lamps.position.set(x, base + 26.4, z + 0.62);
    lamps.rotation.x = -0.4;
    scene.add(pole, frame, lamps);
  }
}

export function buildStructures(scene: Scene): void {
  jump(scene, 1, new Vector3(0, 0, 0), true);
  // The smaller hill beside the big one, its lip set into the slope.
  const z = -46;
  jump(scene, 0.66, new Vector3(18, groundY(18, z) + 1.5, z), false);
  floodlights(scene);
}
