// Ryan, ready for Christmas Eve: his head (see head.ts) on a jointed body in a
// Santa suit, with skis and a sack of presents. The body is a simple rig: legs
// bend at the knees by solving for where the hips are, so the boots stay on the
// skis, and the arms swing at the shoulders and elbows. Each phase of the jump
// has its own stance, and a crash throws him into a tumble, limbs flailing,
// until he slides to a stop on his back. The group sits at the boots, facing +x.

import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
} from "three";
import { fluff } from "../../../shared/santa-hat";
import { buildHead } from "./head";

export type Stance = "ready" | "inrun" | "flight" | "glide" | "landing" | "outrun";

export interface Ryan {
  /** At the boots on the skis; the scene moves it and tilts it to the slope. */
  group: Group;
  /** Skis left lying where he crashed, for the scene to add once. */
  looseSkis: Group;
  /** The sack, so a crash can hide it as the presents fly. */
  sack: Group;
  /** Moves the body towards the stance (or flails, in a crash). Call each frame. */
  animate(stance: Stance, crashed: boolean, speed: number, dt: number): void;
  /** Turns the head to the camera. Call after the body and camera have moved, each frame. */
  faceCamera(camera: Camera, crashed: boolean): void;
  reset(): void;
}

// --- proportions (metres) ----------------------------------------------------------

const ANKLE = 0.12;
const SHIN = 0.46;
const THIGH = 0.46;
const HIP_WIDTH = 0.12;
const SHOULDER = new Vector3(0, 0.6, 0.26);
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
/** The top of the torso, in the torso's frame: the head pivots here, like a neck. */
const NECK = new Vector3(0.03, 0.76, 0);
/** The tumble spins round about the waist, not the boots. */
const PIVOT = 1.0;
/** Full cartwheels in a crash before he slides the rest of the way. */
const CRASH_ROLLS = 2;

/** How far the face sits in front of the body, towards the camera, so the chest never cuts into it. */
const FACE_FORWARD = 0.45;
/**
 * How far the head turns towards the camera: 1 always faces it, 0 never turns.
 * Nearly all the way, so the beard below the chin never swings off to one side.
 */
const HEAD_TURN = 0.88;

// --- stances -----------------------------------------------------------------------

type Pair = [number, number];

/** A body position. Pairs are [far side, near side]; the camera watches from the near (+z) side. */
interface Pose {
  /** Hips, relative to the boots. */
  hipX: number;
  hipY: number;
  /** Torso lean from upright; negative leans forward. */
  pitch: number;
  /** Arm swing at the shoulder, forward positive; spread out to the side; bend at the elbow. */
  swing: Pair;
  spread: Pair;
  elbow: Pair;
  /** Feet: forward or back of their place on the skis, and lifted off them (crash only). */
  footX: Pair;
  footY: Pair;
}

const both = (v: number): Pair => [v, v];
const pose = (hipX: number, hipY: number, pitch: number, swing: number, spread: number, elbow: number, footX: Pair = [0, 0]): Pose => ({
  hipX,
  hipY,
  pitch,
  swing: both(swing),
  spread: both(spread),
  elbow: both(elbow),
  footX,
  footY: both(0),
});

const STANCES: Record<Stance, Pose> = {
  // Standing on the start bar.
  ready: pose(-0.05, 0.98, -0.25, 0.1, 0.15, 0.3),
  // The tuck: deep knee bend, chest down on the thighs, arms back along the body.
  inrun: pose(-0.28, 0.56, -1.35, -0.25, 0.1, 0.1),
  // In the air: legs straight, leaning out over the skis, arms back and slightly out.
  flight: pose(-0.05, 1.0, -0.9, -0.2, 0.25, 0),
  glide: pose(0, 1.02, -1.25, -0.15, 0.2, 0),
  // Telemark landing: one foot forward, knees bent, arms out for balance.
  landing: pose(0, 0.74, -0.2, 0.5, 1.1, 0.4, [-0.3, 0.3]),
  // Gliding to a stop, upright and relaxed.
  outrun: pose(0, 0.92, -0.15, 0.25, 0.5, 0.4),
};

const PAIRS = ["swing", "spread", "elbow", "footX", "footY"] as const;

function copyPose(to: Pose, from: Pose): void {
  to.hipX = from.hipX;
  to.hipY = from.hipY;
  to.pitch = from.pitch;
  for (const k of PAIRS) to[k] = [from[k][0], from[k][1]];
}

const clonePose = (p: Pose): Pose => {
  const c = { ...p };
  copyPose(c, p);
  return c;
};

function dampPose(cur: Pose, want: Pose, rate: number, dt: number): void {
  cur.hipX = MathUtils.damp(cur.hipX, want.hipX, rate, dt);
  cur.hipY = MathUtils.damp(cur.hipY, want.hipY, rate, dt);
  cur.pitch = MathUtils.damp(cur.pitch, want.pitch, rate, dt);
  for (const k of PAIRS) for (const i of [0, 1]) cur[k][i] = MathUtils.damp(cur[k][i], want[k][i], rate, dt);
}

/** Thrashing limbs, fading to a sprawl as he slows. */
function flail(out: Pose, t: number, energy: number): void {
  const e = energy;
  out.hipX = 0.15 * Math.sin(t * 6) * e;
  out.hipY = 0.85 + 0.12 * Math.sin(t * 7.3) * e;
  out.pitch = -0.4 + 0.9 * Math.sin(t * 5.1) * e;
  for (const i of [0, 1]) {
    const p = i * 2.1;
    out.swing[i] = 0.6 + 1.9 * Math.sin(t * 9.7 + p) * e;
    out.spread[i] = 1.1 + 0.8 * Math.sin(t * 8.3 + p * 1.3) * e;
    out.elbow[i] = 0.5 + 0.6 * Math.sin(t * 12.1 + p) * e;
    out.footX[i] = (i ? 0.2 : -0.2) + 0.45 * Math.sin(t * 8.9 + p * 1.7) * e;
    out.footY[i] = 0.3 * (0.5 + 0.5 * Math.sin(t * 10.3 + p)) * e;
  }
}

// --- building ------------------------------------------------------------------------

function part(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Points a capsule (built along y) from a to b, in the x-y plane. */
function span(mesh: Mesh, ax: number, ay: number, bx: number, by: number): void {
  mesh.position.x = (ax + bx) / 2;
  mesh.position.y = (ay + by) / 2;
  mesh.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
}

function sackOfPresents(): Group {
  const g = new Group();
  const burlap = new MeshStandardMaterial({ color: "#7a5230", roughness: 1 });
  const sack = part(new SphereGeometry(0.3, 14, 10), burlap);
  sack.scale.set(0.9, 1.15, 0.9);
  g.add(sack);
  g.add(part(new TorusGeometry(0.11, 0.04, 8, 14).rotateX(Math.PI / 2), burlap, 0, 0.32));
  // Presents poking out of the neck.
  [["#d4142a", -0.06, 0.43, 0.2], ["#1f7a3e", 0.07, 0.41, -0.15], ["#ffc93b", 0, 0.49, 0.35]].forEach(([c, x, y, r]) => {
    const box = part(new BoxGeometry(0.14, 0.14, 0.14), new MeshStandardMaterial({ color: c as string, roughness: 0.6 }), x as number, y as number);
    box.rotation.z = r as number;
    g.add(box);
  });
  return g;
}

/** A pair of skis, red with a white stripe and upturned tips, centred on the binding. */
function skiPair(z: number, ski: Material, stripe: Material): Group {
  const g = new Group();
  g.add(part(new BoxGeometry(2.4, 0.04, 0.1), ski, 0.3, 0, z));
  g.add(part(new BoxGeometry(2.3, 0.045, 0.03), stripe, 0.3, 0, z));
  const tip = part(new BoxGeometry(0.22, 0.04, 0.1), ski, 1.57, 0.06, z);
  tip.rotation.z = 0.5;
  g.add(tip);
  return g;
}

export function buildRyan(image: HTMLImageElement | null): Ryan {
  const suit = new MeshStandardMaterial({ color: "#b0122a", roughness: 0.8 });
  const fur = new MeshStandardMaterial({ color: "#e2e2e2", roughness: 1 });
  const black = new MeshStandardMaterial({ color: "#16161c", roughness: 0.4 });
  const sole = new MeshStandardMaterial({ color: "#2a2420", roughness: 0.9 });
  const gold = new MeshStandardMaterial({ color: "#e0b030", roughness: 0.35, metalness: 0.7 });
  const skiMat = new MeshStandardMaterial({ color: "#c8102e", roughness: 0.35 });
  const stripe = new MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.4 });

  const group = new Group();
  // Everything turns about the waist in a tumble; at rest this is a no-op.
  const tumble = new Group();
  tumble.position.y = PIVOT;
  const body = new Group();
  body.position.y = -PIVOT;
  tumble.add(body);
  group.add(tumble);

  // Legs: a foot (boot and ski) on each side, a shin and a thigh to the hip.
  const sides = [-HIP_WIDTH, HIP_WIDTH];
  const feet = sides.map((z) => {
    const foot = new Group();
    // Boot: a rounded foot with a domed toe, a round shaft up to the cuff, and a sole.
    foot.add(part(new CapsuleGeometry(0.068, 0.2, 6, 14).rotateZ(Math.PI / 2).scale(1, 1, 1.05), black, 0.06, 0.075, z));
    foot.add(part(new CapsuleGeometry(0.072, 0.07, 6, 14), black, -0.01, 0.14, z));
    foot.add(part(new CapsuleGeometry(0.062, 0.24, 6, 14).rotateZ(Math.PI / 2).scale(1, 0.28, 1.1), sole, 0.06, 0.016, z));
    foot.add(part(fluff(new TorusGeometry(0.08, 0.035, 10, 20).rotateX(Math.PI / 2), 0.05), fur, -0.01, 0.19, z)); // cuff
    const skis = skiPair(z, skiMat, stripe);
    foot.add(skis);
    body.add(foot);
    return { foot, skis };
  });
  const shins = sides.map((z) => part(new CapsuleGeometry(0.085, SHIN, 4, 10), suit, 0, 0, z));
  const thighs = sides.map((z) => part(new CapsuleGeometry(0.11, THIGH, 4, 10), suit, 0, 0, z));
  body.add(...shins, ...thighs);

  // Torso, from the hips up: a padded suit with Santa's belly, belt, and fur trim.
  const torso = new Group();
  body.add(torso);
  const trunk = part(new CapsuleGeometry(0.21, 0.4, 6, 14), suit, 0, 0.36);
  trunk.scale.set(1, 1, 1.15);
  const belly = part(new SphereGeometry(0.2, 16, 12), suit, 0.07, 0.27);
  const shoulders = part(new CapsuleGeometry(0.11, 0.34, 4, 10).rotateX(Math.PI / 2), suit, 0, SHOULDER.y);
  torso.add(trunk, belly, shoulders);
  torso.add(part(new CylinderGeometry(0.25, 0.25, 0.08, 18), black, 0.02, 0.17)); // belt
  torso.add(part(new BoxGeometry(0.05, 0.1, 0.12), gold, 0.27, 0.17)); // buckle
  torso.add(part(fluff(new TorusGeometry(0.23, 0.05, 8, 20).rotateX(Math.PI / 2), 0.05), fur, 0.01, -0.02)); // hem
  torso.add(part(fluff(new BoxGeometry(0.06, 0.42, 0.1), 0.04), fur, 0.25, 0.43)); // trim down the front
  torso.add(part(fluff(new TorusGeometry(0.15, 0.06, 8, 16).rotateX(Math.PI / 2), 0.05), fur, NECK.x, NECK.y - 0.04)); // collar

  // Arms: shoulder, elbow, a fur cuff and a mitten.
  const arms = sides.map((_, i) => {
    const shoulder = new Group();
    shoulder.position.set(SHOULDER.x, SHOULDER.y, (i ? 1 : -1) * SHOULDER.z);
    shoulder.add(part(new CapsuleGeometry(0.075, UPPER_ARM - 0.06, 4, 10), suit, 0, -UPPER_ARM / 2));
    const elbow = new Group();
    elbow.position.y = -UPPER_ARM;
    elbow.add(part(new CapsuleGeometry(0.065, FOREARM - 0.06, 4, 10), suit, 0, -FOREARM / 2));
    elbow.add(part(fluff(new TorusGeometry(0.06, 0.03, 10, 20).rotateX(Math.PI / 2), 0.05), fur, 0, -FOREARM + 0.02));
    // A mitten: a rounded paddle of a hand with the thumb set off to the front.
    elbow.add(part(new SphereGeometry(1, 16, 12).scale(0.055, 0.08, 0.045), black, 0, -FOREARM - 0.06));
    elbow.add(part(new SphereGeometry(1, 12, 10).scale(0.025, 0.04, 0.025), black, 0.045, -FOREARM - 0.04));
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  });

  const sack = sackOfPresents();
  sack.position.set(-0.32, 0.42, 0);
  sack.rotation.z = 0.2;
  torso.add(sack);

  const head = buildHead(image);
  torso.add(head);

  // Skis that come off in a crash and stay where he fell.
  const looseSkis = new Group();
  looseSkis.visible = false;
  const left = skiPair(0, skiMat, stripe);
  left.position.set(-0.4, 0.03, 0.7);
  left.rotation.y = 0.5;
  const right = skiPair(0, skiMat, stripe);
  right.position.set(0.5, 0.03, -0.6);
  right.rotation.y = -0.35;
  looseSkis.add(left, right);

  const cur = clonePose(STANCES.ready);
  const want = clonePose(STANCES.ready); // the crash's moving target
  let time = 0;
  let wasCrashed = false;
  /** In a crash: how far he has rolled so far (radians), and how hard he's still flailing (0..1). */
  let rolled = 0;
  let energy = 0;

  /** Places the legs, torso and arms for the current pose. */
  function apply(p: Pose): void {
    torso.position.set(p.hipX, p.hipY, 0);
    torso.rotation.z = p.pitch;
    for (const i of [0, 1]) {
      // The foot stays on its ski; solve the knee between it and the hip.
      const ax = p.footX[i];
      const ay = ANKLE + p.footY[i];
      feet[i].foot.position.set(p.footX[i], p.footY[i], 0);
      const dx = p.hipX - ax;
      const dy = p.hipY - ay;
      const d = MathUtils.clamp(Math.hypot(dx, dy), 0.05, SHIN + THIGH - 0.001);
      // Law of cosines for the angle at the ankle; the knee bends forward (+x).
      const atAnkle = Math.acos(MathUtils.clamp((SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d), -1, 1));
      const toHip = Math.atan2(dy, dx);
      const kx = ax + Math.cos(toHip - atAnkle) * SHIN;
      const ky = ay + Math.sin(toHip - atAnkle) * SHIN;
      span(shins[i], ax, ay, kx, ky);
      span(thighs[i], kx, ky, p.hipX, p.hipY);
      const side = i ? 1 : -1;
      arms[i].shoulder.rotation.set(-side * p.spread[i], 0, p.swing[i]);
      arms[i].elbow.rotation.z = p.elbow[i];
    }
  }
  apply(cur);

  const parentTurn = new Quaternion();
  const turn = new Quaternion();
  const neck = new Vector3();
  const toCamera = new Vector3();

  return {
    group,
    looseSkis,
    sack,
    animate(stance, crashed, speed, dt) {
      time += dt;
      if (crashed && !wasCrashed) {
        rolled = 0;
        energy = 1;
        // The skis come off where he goes down.
        for (const f of feet) f.skis.visible = false;
        looseSkis.position.copy(group.position);
        looseSkis.rotation.copy(group.rotation);
        looseSkis.visible = true;
      }
      wasCrashed = crashed;

      if (crashed) {
        // A couple of cartwheels about the waist, limbs thrashing, then he goes
        // limp and slides the rest of the way on his back.
        const rolling = speed > 2.5 && rolled < CRASH_ROLLS * Math.PI * 2;
        energy = MathUtils.damp(energy, rolling ? MathUtils.clamp(speed / 15, 0.5, 1) : 0, 2.5, dt);
        flail(want, time, energy);
        dampPose(cur, want, 14, dt);
        if (rolling) {
          const spin = dt * 7 * MathUtils.clamp(speed / 25, 0.4, 1);
          tumble.rotation.z -= spin;
          rolled += spin;
        } else {
          const rest = Math.PI / 2 + Math.PI * 2 * Math.round((tumble.rotation.z - Math.PI / 2) / (Math.PI * 2));
          tumble.rotation.z = MathUtils.damp(tumble.rotation.z, rest, 3, dt);
        }
        // Spinning clear of the snow while rolling; lying in it after.
        tumble.position.y = MathUtils.damp(tumble.position.y, MathUtils.lerp(0.35, PIVOT + 0.3, energy), 6, dt);
      } else {
        dampPose(cur, STANCES[stance], 8, dt);
      }
      apply(cur);
    },
    faceCamera(camera, crashed) {
      torso.updateWorldMatrix(true, false);
      // Pivot at the neck, moved straight towards the camera: on screen the chin
      // stays exactly on the collar, but nothing on the body can cut into the face.
      torso.localToWorld(neck.copy(NECK));
      toCamera.subVectors(camera.position, neck).normalize();
      neck.addScaledVector(toCamera, FACE_FORWARD);
      head.position.copy(torso.worldToLocal(neck));
      // Turn most of the way to the camera (face and hat together): enough to
      // keep the photo in view, little enough that its shape shows as the camera moves.
      torso.getWorldQuaternion(parentTurn).invert();
      turn.identity().slerp(camera.quaternion, HEAD_TURN);
      head.quaternion.copy(parentTurn).multiply(turn);
      // Upright while skiing, so the beard stays centred under his chin; in a
      // crash it tumbles with the body.
      if (crashed) head.rotateZ(group.rotation.z + tumble.rotation.z + cur.pitch);
    },
    reset() {
      time = 0;
      wasCrashed = false;
      rolled = 0;
      energy = 0;
      tumble.rotation.set(0, 0, 0);
      tumble.position.y = PIVOT;
      for (const f of feet) f.skis.visible = true;
      looseSkis.visible = false;
      copyPose(cur, STANCES.ready);
      apply(cur);
    },
  };
}
