// The 3D view of the jump. Simulation x/y map straight onto world x/y (metres,
// lip at the origin, downhill to +x); the track runs along z = 0, and the
// camera watches from the +z side.

import { DirectionalLight, Fog, HemisphereLight, MathUtils, PerspectiveCamera, Scene, Vector3 } from "three";
import { createBloom, createView, isLowPower } from "../../../shared/three";
import { hillY, inrunPosition, PHYSICS, type Jump } from "../rules";
import { buildCity } from "./city";
import { buildLipMarker } from "./lip";
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
   * `look` is how far the held pointer has been dragged, as a share of the screen.
   */
  render(j: Jump, dt: number, prev: Jump, blend: number, look: Readonly<{ x: number; y: number }>): void;
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

/**
 * How far the camera may swing round Ryan while gliding (radians): well round
 * to his front, a little behind (his face card would show edge-on from straight
 * behind), and up above him.
 */
const ORBIT = { front: 1.3, behind: 0.7, above: 0.8 };

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

  // Moonlit snow: a dim, cool sky light, and the moon from behind the left
  // shoulder casting shadows; the floodlights (see structure.ts) do the rest.
  scene.add(new HemisphereLight("#4a5f9c", "#9fb0d8", 0.5));
  const moon = new DirectionalLight("#c9d6ff", 0.8);
  moon.castShadow = true;
  // A tight shadow box that travels with Ryan, so his shadow is crisp on any device.
  moon.shadow.mapSize.setScalar(lowPower ? 1024 : 2048);
  const reach = 30;
  Object.assign(moon.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 400 });
  moon.shadow.bias = -0.0005;
  moon.shadow.normalBias = 0.04;
  scene.add(moon, moon.target);

  buildTerrain(scene, lowPower);
  buildStructures(scene, lowPower);
  buildLipMarker(scene);
  const world = buildWorld(scene, lowPower);
  const city = buildCity(scene, lowPower);
  const ryan = buildRyan(headImage);
  const jumper = ryan.group;
  scene.add(jumper, ryan.looseSkis);
  const sleigh = buildSleigh();
  scene.add(sleigh);
  const spill = presentSpill(scene);
  let spilled = false;

  const camera = new PerspectiveCamera(50, 1, 0.5, 4000); // out to the far mountains
  const renderer = createView(canvas, camera, (w, h) => bloom.resize(w, h));
  // Only things brighter than white glow (lamps, floodlights, the tower's
  // lights, lit windows; see `glowing`), never lit snow or white paint.
  const bloom = createBloom(renderer, scene, camera, { strength: 0.8, radius: 0.55, threshold: 1, lowPower });
  let time = 0;

  const camPos = new Vector3();
  const camLook = new Vector3();
  const wantPos = new Vector3();
  const wantLook = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  let first = true;
  /** The camera's swing round Ryan while gliding (radians). */
  const orbit = { yaw: 0, pitch: 0 };

  return {
    render(j, dt, prev, blend, look) {
      let { x, y, angle } = poseOf(j);
      if (prev.phase === j.phase) {
        // Between two steps of the same phase, draw the in-between position.
        const p = poseOf(prev);
        x = MathUtils.lerp(p.x, x, blend);
        y = MathUtils.lerp(p.y, y, blend);
        angle = MathUtils.lerp(p.angle, angle, blend);
      }
      jumper.position.set(x, y, 0);
      // The moon's shadow box follows him.
      moon.target.position.set(x, y, 0);
      moon.position.set(x - 60, y + 120, 80);
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
        // While gliding, dragging swings the camera round him (right: round to
        // his front; up: higher); letting go eases it back to the side for the landing.
        const steering = j.phase === "flight" && j.holding;
        orbit.yaw = MathUtils.damp(orbit.yaw, steering ? MathUtils.clamp(look.x * 2.6, -ORBIT.behind, ORBIT.front) : 0, 4, dt);
        orbit.pitch = MathUtils.damp(orbit.pitch, steering ? MathUtils.clamp(-look.y * 2, -0.25, ORBIT.above) : 0, 4, dt);
        const [ox, oy, oz] = flying ? [9, 4, 24] : [4, 3, 16];
        const [c, s] = [Math.cos(orbit.yaw), Math.sin(orbit.yaw)];
        wantPos.set(x + ox * c + oz * s, y + oy + 22 * orbit.pitch, oz * c - ox * s);
        // The further round, the more the camera looks at Ryan himself rather than ahead of him.
        const onRyan = Math.min(1, (Math.abs(orbit.yaw) + Math.abs(orbit.pitch)) / 0.8);
        wantLook.set(
          MathUtils.lerp(x + (flying ? 14 : 6), x, onRyan),
          MathUtils.lerp(y - (flying ? 6 : 1), y + 1, onRyan),
          0,
        );
      }
      if (first) {
        camPos.copy(wantPos);
        camLook.copy(wantLook);
        first = false;
      }
      const follow = sweep < 1 ? 8 : 5;
      const orbiting = Math.abs(orbit.yaw) > 0.02 || Math.abs(orbit.pitch) > 0.02;
      camPos.x = MathUtils.damp(camPos.x, wantPos.x, follow, dt);
      camPos.y = MathUtils.damp(camPos.y, wantPos.y, follow, dt);
      camPos.z = MathUtils.damp(camPos.z, wantPos.z, sweep < 1 ? 8 : orbiting ? 5 : 2, dt);
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
      city.update(time);
      bloom.render();
    },
    reset() {
      spilled = false;
      spill.clear();
      ryan.sack.visible = true;
      ryan.reset();
      orbit.yaw = 0;
      orbit.pitch = 0;
      jumper.rotation.set(0, 0, 0);
      sleigh.visible = false;
    },
  };
}
