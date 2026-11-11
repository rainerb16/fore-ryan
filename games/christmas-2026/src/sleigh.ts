// Santa's sleigh and team, crossing the sky during the take-off slow motion,
// and the presents that spill from Ryan's sack when he crashes.

import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type Material,
  type Scene,
} from "three";
import { hillY } from "../rules";
import { glowing } from "./glow";

function block(w: number, h: number, d: number, material: Material, x: number, y: number, z = 0): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** Built at a scale that reads from a few hundred metres away, in silhouette against the sky. */
export function buildSleigh(): Group {
  const team = new Group();
  const red = new MeshStandardMaterial({ color: "#a3121f", roughness: 0.6, fog: false });
  const gold = new MeshStandardMaterial({ color: "#c9962a", roughness: 0.4, fog: false });
  const brown = new MeshStandardMaterial({ color: "#5a3a22", roughness: 0.9, fog: false });

  // The sleigh, Santa, and his sack.
  team.add(block(6, 2.2, 3, red, 0, 0));
  team.add(block(1.6, 3.2, 3, red, -2.4, 0.9));
  team.add(block(7, 0.3, 0.3, gold, 0.4, -1.4, 1.2), block(7, 0.3, 0.3, gold, 0.4, -1.4, -1.2));
  const santa = new Mesh(new CapsuleGeometry(0.9, 1.2, 4, 8), red);
  santa.position.set(0.3, 2, 0);
  const sack = new Mesh(new SphereGeometry(1.3, 10, 8), brown);
  sack.position.set(-1.6, 2.2, 0);
  team.add(santa, sack);

  // Four reindeer ahead, Rudolph leading with his nose aglow.
  for (let i = 0; i < 4; i++) {
    const deer = new Group();
    deer.add(block(3, 1.3, 1.1, brown, 0, 0));
    deer.add(block(1, 1, 0.8, brown, 1.8, 0.9));
    for (const [x, z] of [[-1, 0.35], [-1, -0.35], [1, 0.35], [1, -0.35]]) {
      const leg = block(0.3, 1.5, 0.3, brown, x, -1.2, z);
      leg.rotation.z = x > 0 ? -0.6 : 0.6; // mid-gallop
      deer.add(leg);
    }
    deer.add(block(0.15, 1.2, 0.15, brown, 1.6, 2, 0.3), block(0.15, 1.2, 0.15, brown, 1.6, 2, -0.3)); // antlers
    if (i === 3) {
      const nose = new Mesh(new SphereGeometry(0.4, 10, 8), new MeshBasicMaterial({ color: glowing("#ff2030", 3), fog: false }));
      nose.position.set(2.4, 0.9, 0);
      deer.add(nose);
    }
    deer.position.set(6 + i * 4.5, 1.5 + (i % 2) * 0.6, 0);
    team.add(deer);
  }
  team.scale.setScalar(2.2);
  team.visible = false;
  return team;
}

// --- spilled presents -------------------------------------------------------------

export interface Spill {
  /** Throw the presents out from (x, y), carrying some of the jumper's speed. */
  start(x: number, y: number, speed: number): void;
  update(dt: number): void;
  clear(): void;
}

export function presentSpill(scene: Scene): Spill {
  const colours = ["#d4142a", "#1f7a3e", "#ffc93b", "#3b6fd4", "#d43bb0", "#e8e8e8"];
  const boxes = colours.map((c) => {
    const m = new Mesh(new BoxGeometry(0.32, 0.26, 0.32), new MeshStandardMaterial({ color: c, roughness: 0.6 }));
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    return { m, vx: 0, vy: 0, vz: 0, spin: 0, resting: false };
  });

  return {
    start(x, y, speed) {
      boxes.forEach((b, i) => {
        const fan = (i / (boxes.length - 1)) * 2 - 1; // -1..1 across the burst
        b.m.position.set(x, y + 1.1, fan * 0.3);
        b.vx = speed * (0.35 + 0.25 * Math.abs(fan));
        b.vy = 4 + 2.5 * (1 - Math.abs(fan));
        b.vz = fan * 3;
        b.spin = 6 + i * 2;
        b.resting = false;
        b.m.visible = true;
      });
    },
    update(dt) {
      for (const b of boxes) {
        if (!b.m.visible || b.resting) continue;
        b.vy -= 9.81 * dt;
        b.m.position.x += b.vx * dt;
        b.m.position.y += b.vy * dt;
        b.m.position.z += b.vz * dt;
        b.m.rotation.x += b.spin * dt;
        b.m.rotation.z += b.spin * 0.7 * dt;
        const ground = hillY(b.m.position.x) + 0.13;
        if (b.m.position.y < ground) {
          b.m.position.y = ground;
          if (Math.abs(b.vy) < 1.5) {
            b.resting = true;
          } else {
            // Bounce, losing most of the energy to the snow.
            b.vy *= -0.35;
            b.vx *= 0.6;
            b.vz *= 0.6;
            b.spin *= 0.5;
          }
        }
      }
    },
    clear() {
      for (const b of boxes) b.m.visible = false;
    },
  };
}
