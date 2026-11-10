// The 3D view of the jump. Simulation x/y map straight onto world x/y (metres,
// lip at the origin, downhill to +x); the hill is extruded along z, and the
// camera watches from the +z side.

import {
  BoxGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  SphereGeometry,
  Vector3,
} from "three";
import { createView } from "../../../shared/three";
import { hillY, inrunPoints, inrunPosition, LANDING, type Jump } from "../rules";

const HILL_WIDTH = 12;
const NIGHT = "#0a1230";

function buildHill(): Mesh {
  const shape = new Shape();
  const top = inrunPoints(2);
  const base = -LANDING.end;
  shape.moveTo(top[0][0], base);
  for (const [x, y] of top) shape.lineTo(x, y);
  // The table ends at the lip; the landing hill starts a few metres below it.
  for (let x = 0; x <= LANDING.end; x += 2) shape.lineTo(x, hillY(x));
  shape.lineTo(LANDING.end + 80, hillY(LANDING.end));
  shape.lineTo(LANDING.end + 80, base);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, { depth: HILL_WIDTH, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -HILL_WIDTH / 2);
  const hill = new Mesh(geometry, new MeshStandardMaterial({ color: "#e8eefc", roughness: 0.9 }));
  hill.receiveShadow = true;
  return hill;
}

/** A stand-in jumper: body, head, and a pair of skis, pivoting at the boots. */
function buildJumper(): Group {
  const jumper = new Group();
  const suit = new MeshStandardMaterial({ color: "#c8102e", roughness: 0.6 });
  const body = new Mesh(new BoxGeometry(0.45, 1.3, 0.4), suit);
  body.position.y = 0.75;
  const head = new Mesh(new SphereGeometry(0.22, 16, 12), new MeshStandardMaterial({ color: "#f1c7a8" }));
  head.position.y = 1.6;
  const lean = new Group(); // tips forward when gliding
  lean.name = "lean";
  lean.add(body, head);
  const skiMaterial = new MeshStandardMaterial({ color: "#1b1b24", roughness: 0.4 });
  for (const z of [-0.14, 0.14]) {
    const ski = new Mesh(new BoxGeometry(2.4, 0.05, 0.1), skiMaterial);
    ski.position.set(0.3, 0.02, z);
    jumper.add(ski);
  }
  jumper.add(lean);
  jumper.traverse((n) => (n.castShadow = true));
  return jumper;
}

export interface JumpView {
  render(j: Jump, dt: number): void;
}

export function createJumpView(canvas: HTMLCanvasElement): JumpView {
  const scene = new Scene();
  scene.background = new Color(NIGHT);
  scene.fog = new Fog(NIGHT, 60, 320);

  scene.add(new HemisphereLight("#6f86c9", "#dfe8ff", 0.9));
  const moon = new DirectionalLight("#cdd8ff", 1.4);
  moon.position.set(-60, 120, 80);
  scene.add(moon);

  scene.add(buildHill());
  const jumper = buildJumper();
  const lean = jumper.getObjectByName("lean")!;
  scene.add(jumper);

  const camera = new PerspectiveCamera(50, 1, 0.5, 900);
  const renderer = createView(canvas, camera);

  const camPos = new Vector3();
  const camLook = new Vector3();
  const wantPos = new Vector3();
  const wantLook = new Vector3();
  let first = true;

  return {
    render(j, dt) {
      // Where the jumper is, and which way the skis point.
      let x: number;
      let y: number;
      let angle: number;
      if (j.phase === "ready" || j.phase === "inrun") {
        const p = inrunPosition(j.s);
        x = p.x;
        y = p.y;
        angle = -p.angle;
      } else if (j.phase === "flight") {
        x = j.x;
        y = j.y;
        angle = Math.atan2(j.vy, j.vx) * 0.6;
      } else {
        x = j.x;
        y = j.y;
        angle = Math.atan2(hillY(x + 0.5) - hillY(x - 0.5), 1);
      }
      jumper.position.set(x, y, 0);
      jumper.rotation.z = MathUtils.damp(jumper.rotation.z, angle, 10, dt);
      lean.rotation.z = MathUtils.damp(lean.rotation.z, j.holding ? -1.1 : -0.25, 8, dt);
      // A crash tumbles the jumper over.
      jumper.rotation.x = j.crashed ? MathUtils.damp(jumper.rotation.x, Math.PI / 2, 4, dt) : 0;

      // Side-follow: close on the inrun, pulled back in the air to show the landing.
      const flying = j.phase === "flight" || j.phase === "outrun" || j.phase === "done";
      wantPos.set(x + (flying ? 10 : 4), y + (flying ? 5 : 3), flying ? 32 : 16);
      wantLook.set(x + (flying ? 14 : 6), y - (flying ? 6 : 1), 0);
      if (first) {
        camPos.copy(wantPos);
        camLook.copy(wantLook);
        first = false;
      }
      camPos.x = MathUtils.damp(camPos.x, wantPos.x, 5, dt);
      camPos.y = MathUtils.damp(camPos.y, wantPos.y, 5, dt);
      camPos.z = MathUtils.damp(camPos.z, wantPos.z, 2, dt);
      camLook.x = MathUtils.damp(camLook.x, wantLook.x, 6, dt);
      camLook.y = MathUtils.damp(camLook.y, wantLook.y, 6, dt);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      renderer.render(scene, camera);
    },
  };
}
