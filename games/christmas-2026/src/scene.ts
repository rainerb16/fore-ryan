// The 3D view of the jump. Simulation x/y map straight onto world x/y (metres,
// lip at the origin, downhill to +x); the track runs along z = 0, and the
// camera watches from the +z side.

import { DirectionalLight, Fog, HemisphereLight, MathUtils, PerspectiveCamera, Scene, Vector3 } from "three";
import { createBloom, createView, isLowPower } from "../../../shared/three";
import { hillY, inrunPosition, PHYSICS, type Jump } from "../rules";
import { buildRyan, type Stance } from "./ryan";
import { buildSleigh, presentSpill } from "./sleigh";
import { buildStructures } from "./structure";
import { buildTerrain, groundY } from "./terrain";
import { buildWorld } from "./world";

/** Matches the sky at the horizon, so distant hills fade into it rather than into a band. */
const HAZE = "#17234a";

export interface JumpView {
  /**
   * Draws the jump `blend` of the way from `prev` (the state one simulation
   * step earlier) to `j`, so motion stays smooth whatever the display rate.
   */
  render(j: Jump, dt: number, prev: Jump, blend: number): void;
  /** Put everything back for a fresh jump. */
  reset(): void;
}

/** How long, in simulation seconds after take-off, the sleigh takes to cross. */
const SLEIGH_CROSSING = 2.2;

/** Where the jumper is, and which way the skis point. */
function poseOf(j: Jump): { x: number; y: number; angle: number } {
  if (j.phase === "ready" || j.phase === "inrun") {
    const p = inrunPosition(j.s);
    return { x: p.x, y: p.y, angle: -p.angle };
  }
  if (j.phase === "flight") return { x: j.x, y: j.y, angle: Math.atan2(j.vy, j.vx) * 0.6 };
  return { x: j.x, y: j.y, angle: Math.atan2(hillY(j.x + 0.5) - hillY(j.x - 0.5), 1) };
}

/** Simulation seconds Ryan holds the telemark after touching down. */
const TELEMARK_FOR = 1.2;

function stanceOf(j: Jump): Stance {
  if (j.phase === "ready" || j.phase === "inrun") return j.phase;
  if (j.phase === "flight") return j.holding ? "glide" : "flight";
  return j.time - j.landedTime < TELEMARK_FOR ? "landing" : "outrun";
}

export function createJumpView(canvas: HTMLCanvasElement, headImage: HTMLImageElement | null): JumpView {
  const scene = new Scene();
  scene.fog = new Fog(HAZE, 120, 760);
  const lowPower = isLowPower();

  // Moonlit snow: cool blue ambient, a soft moon from behind the left shoulder.
  scene.add(new HemisphereLight("#5c74b8", "#c9d6f2", 0.75));
  const moon = new DirectionalLight("#c9d6ff", 1.1);
  moon.position.set(-60, 120, 80);
  scene.add(moon);

  buildTerrain(scene, lowPower);
  buildStructures(scene);
  const world = buildWorld(scene, lowPower);
  const ryan = buildRyan(headImage);
  const jumper = ryan.group;
  scene.add(jumper, ryan.looseSkis);
  const sleigh = buildSleigh();
  scene.add(sleigh);
  const spill = presentSpill(scene);
  let spilled = false;

  const camera = new PerspectiveCamera(50, 1, 0.5, 3000);
  const renderer = createView(canvas, camera, (w, h) => bloom.resize(w, h));
  // Lamps, the tower's lights, and the star glow; the snow and sky do not.
  const bloom = createBloom(renderer, scene, camera, { strength: 0.7, radius: 0.5, threshold: 0.7, lowPower });
  let time = 0;

  const camPos = new Vector3();
  const camLook = new Vector3();
  const wantPos = new Vector3();
  const wantLook = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  let first = true;

  return {
    render(j, dt, prev, blend) {
      let { x, y, angle } = poseOf(j);
      if (prev.phase === j.phase) {
        // Between two steps of the same phase, draw the in-between position.
        const p = poseOf(prev);
        x = MathUtils.lerp(p.x, x, blend);
        y = MathUtils.lerp(p.y, y, blend);
        angle = MathUtils.lerp(p.angle, angle, blend);
      }
      jumper.position.set(x, y, 0);
      jumper.rotation.z = MathUtils.damp(jumper.rotation.z, angle, 10, dt);
      if (j.crashed && !spilled) {
        // The sack bursts as he goes down.
        spilled = true;
        ryan.sack.visible = false;
        spill.start(x, y, Math.hypot(j.vx, j.vy));
      }
      ryan.animate(stanceOf(j), j.crashed, j.speed, dt);
      spill.update(dt);

      // Santa crosses the sky behind the take-off.
      const sinceTakeoff = j.phase === "flight" || j.phase === "outrun" ? j.time - j.takeoffTime : -1;

      // Side-follow: close on the inrun, pulled back in the air to show the landing.
      const flying = j.phase === "flight" || j.phase === "outrun" || j.phase === "done";
      const sweep = j.phase === "flight" ? Math.min(1, sinceTakeoff / PHYSICS.slowmoFor) : 1;
      if (sweep < 1) {
        // The slow-motion moment: swing round in front of Ryan as he leaves the lip.
        const around = Math.sin(sweep * Math.PI) * 1.1;
        wantPos.set(x + Math.sin(around) * 8, y + 1.5, Math.cos(around) * 8);
        wantLook.set(x, y + 1, 0);
      } else if (j.phase === "outrun" || j.phase === "done") {
        // Landed (or crashed): settle in close on Ryan as he slides to a stop.
        wantPos.set(x + 4, y + 3.5, 13);
        wantLook.set(x + 1, y + 0.6, 0);
      } else {
        wantPos.set(x + (flying ? 9 : 4), y + (flying ? 4 : 3), flying ? 24 : 16);
        wantLook.set(x + (flying ? 14 : 6), y - (flying ? 6 : 1), 0);
      }
      if (first) {
        camPos.copy(wantPos);
        camLook.copy(wantLook);
        first = false;
      }
      const follow = sweep < 1 ? 8 : 5;
      camPos.x = MathUtils.damp(camPos.x, wantPos.x, follow, dt);
      camPos.y = MathUtils.damp(camPos.y, wantPos.y, follow, dt);
      camPos.z = MathUtils.damp(camPos.z, wantPos.z, sweep < 1 ? 8 : 2, dt);
      camLook.x = MathUtils.damp(camLook.x, wantLook.x, 6, dt);
      camLook.y = MathUtils.damp(camLook.y, wantLook.y, 6, dt);
      // Never below the snow.
      camPos.y = Math.max(camPos.y, groundY(camPos.x, camPos.z) + 2.5);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      ryan.faceCamera(camera, j.crashed);

      // Santa crosses the sky in the upper part of whatever the camera is looking at.
      const q = sinceTakeoff / SLEIGH_CROSSING;
      sleigh.visible = q > 0 && q < 1;
      if (sleigh.visible) {
        camera.getWorldDirection(forward);
        right.crossVectors(forward, camera.up).normalize();
        sleigh.position
          .copy(camPos)
          .addScaledVector(forward, 240)
          .addScaledVector(right, -170 + 340 * q)
          .add(up.set(0, 55 + Math.sin(q * 6) * 4, 0));
        sleigh.rotation.y = Math.atan2(-right.z, right.x);
      }

      time += dt;
      world.snow.update(camPos, dt);
      world.tower.update(time);
      bloom.render();
    },
    reset() {
      spilled = false;
      spill.clear();
      ryan.sack.visible = true;
      ryan.reset();
      jumper.rotation.set(0, 0, 0);
      sleigh.visible = false;
    },
  };
}
