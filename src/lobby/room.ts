// The room around the cabinets: carpet, back wall, neon sign, and ceiling spots.
// Light pools are painted onto the floor instead of being real lights, which
// keeps the scene cheap enough for a phone. One real spotlight follows focus.

import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
  SpotLight,
  type Texture,
} from "three";
import { carpet, lightPool, neon } from "./textures";

export const WALL_Z = -1.2;
const NIGHT = "#07040f";

const SIGN_WIDTH = 3.6;

export interface Room {
  spot: SpotLight;
  /** Shrinks the neon sign to fit a narrow (portrait) view of the wall. */
  fitSign(visibleWidth: number): void;
  /** Neon flicker, called each frame. */
  update(time: number): void;
}

export function buildRoom(scene: Scene, spotXs: number[]): Room {
  scene.background = new Color(NIGHT);
  scene.fog = new Fog(NIGHT, 5, 14);

  scene.add(new HemisphereLight("#7a68c0", "#150b28", 1.1));

  const carpetTexture = carpet();
  carpetTexture.repeat.set(12, 5);
  const floor = new Mesh(
    new PlaneGeometry(36, 15),
    new MeshStandardMaterial({ map: carpetTexture, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = WALL_Z + 7.5;
  scene.add(floor);

  const wall = new Mesh(new PlaneGeometry(36, 6), new MeshStandardMaterial({ color: "#1c1033", roughness: 0.9 }));
  wall.position.set(0, 3, WALL_Z);
  scene.add(wall);

  /** An additive, unlit quad: neon, or a light pool when laid flat. */
  const glow = (map: Texture, w: number, h: number, x: number, y: number, z: number, flat = false) => {
    const material = new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const mesh = new Mesh(new PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    return mesh;
  };

  // Just above the cabinet tops (1.92 m), so it stays in frame.
  const sign = glow(neon("RYAN ARCADE", "#ff3fd0"), SIGN_WIDTH, 0.9, 0, 2.5, WALL_Z + 0.02);

  // Neon tube trims running along the wall.
  for (const [y, colour] of [[3.1, "#36e2ff"], [2.0, "#8a5cff"]] as const) {
    const tube = new Mesh(new CylinderGeometry(0.018, 0.018, 36, 6), new MeshBasicMaterial({ color: colour }));
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, y, WALL_Z + 0.03);
    scene.add(tube);
  }

  // A ceiling can over each cabinet, and the pool of light it throws.
  const pool = lightPool();
  const can = new MeshBasicMaterial({ color: "#fff3e0" });
  for (const x of spotXs) {
    const lamp = new Mesh(new CylinderGeometry(0.12, 0.16, 0.12, 12), can);
    lamp.position.set(x, 3.4, -0.2);
    scene.add(lamp);
    glow(pool, 1.9, 1.9, x, 0.004, -0.1, true);
  }

  const spot = new SpotLight("#ffe9d0", 28, 7, 0.45, 0.6, 1.6);
  spot.position.set(0, 3.4, 0.6);
  scene.add(spot, spot.target);

  return {
    spot,
    fitSign(visibleWidth) {
      sign.scale.setScalar(Math.min(1, (visibleWidth * 0.92) / SIGN_WIDTH));
    },
    update(time) {
      // Mostly steady, with the odd stutter of an ageing tube.
      const stutter = Math.sin(time * 37) > 0.97 && Math.sin(time * 1.3) > 0.6;
      sign.material.opacity = stutter ? 0.55 : 1;
    },
  };
}
