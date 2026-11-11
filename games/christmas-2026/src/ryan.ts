// Ryan, ready for Christmas Eve: his floating head (a camera-facing card, so it
// keeps the cutout's look from any angle) in the shared Santa hat, on a Santa-suited body
// with skis and a sack of presents. The group pivots at the boots and faces +x.

import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Camera,
  type Material,
} from "three";
import { santaHat } from "../../../shared/santa-hat";

/** Where the head sits inside the cutout PNG's transparent margins (same as the golf game). */
const HEAD_TRIM = { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };
const HEAD_HEIGHT = 0.84;

export interface Ryan {
  group: Group;
  /** Tilts forward from the boots: 0 upright, about 1.2 flat in a glide. */
  lean: Group;
  /** The sack, so a crash can hide it as the presents fly. */
  sack: Group;
  /** Turns the head (face and hat together) to the camera. Call after the body and camera have moved, each frame. */
  faceCamera(camera: Camera, crashed: boolean): void;
}

function part(geometry: ConstructorParameters<typeof Mesh>[0], material: Material, x: number, y: number, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * The cutout, cropped to the head, with its hard edge feathered and the
 * straight cut across the neck faded out below the chin.
 */
function softHead(image: HTMLImageElement): HTMLCanvasElement | null {
  const sx = HEAD_TRIM.x * image.width;
  const sy = HEAD_TRIM.y * image.height;
  const sw = HEAD_TRIM.w * image.width;
  const sh = HEAD_TRIM.h * image.height;
  const w = 256;
  const h = Math.round((w * sh) / sw);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  // A soft mask: the cutout drawn tiny and scaled back up blurs its outline
  // (works in every browser, unlike ctx.filter), then fades out at the neck.
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const m = mask.getContext("2d");
  const tiny = document.createElement("canvas");
  tiny.width = Math.round(w / 4);
  tiny.height = Math.round(h / 4);
  const t = tiny.getContext("2d");
  if (!m || !t) return null;
  t.drawImage(image, sx, sy, sw, sh, 0, 0, tiny.width, tiny.height);
  m.imageSmoothingQuality = "high";
  m.drawImage(tiny, 0, 0, w, h);
  m.globalCompositeOperation = "destination-in";
  const fade = m.createLinearGradient(0, 0, 0, h);
  // The chin is at about 0.85; only the neck below it fades.
  fade.addColorStop(0.9, "#000");
  fade.addColorStop(0.99, "rgba(0,0,0,0)");
  m.fillStyle = fade;
  m.fillRect(0, 0, w, h);

  // The photo, kept only where the mask is: the edge softens inwards, with no halo.
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  return out;
}

/** How far the face sits in front of the body, towards the camera, so the chest never cuts into it. */
const FACE_FORWARD = 0.45;
/** The top of the torso, in the lean frame: the head pivots here, like a neck. */
const NECK = new Vector3(0.02, 1.52, 0);
/** The face's centre above the neck: puts the chin (about 85% down the photo) just on the collar. */
const CHIN_TO_CENTRE = HEAD_HEIGHT * 0.38;
/** How much the head follows the body's tilt, and the most it ever tilts (radians). */
const HEAD_FOLLOW = 0.2;
const HEAD_MAX_TILT = 0.3;

/** The head, pivoting at its chin: the group's origin is the neck. */
function head(image: HTMLImageElement | null): Group {
  const g = new Group();
  const front = new Group();
  front.position.y = CHIN_TO_CENTRE;
  g.add(front);
  const art = image && softHead(image);
  if (art) {
    const map = new CanvasTexture(art);
    map.colorSpace = SRGBColorSpace;
    map.premultiplyAlpha = true;
    const face = new Mesh(
      new PlaneGeometry(HEAD_HEIGHT * (HEAD_TRIM.w / HEAD_TRIM.h), HEAD_HEIGHT),
      new MeshBasicMaterial({ map, transparent: true, premultipliedAlpha: true, depthWrite: false }),
    );
    front.add(face);
  } else {
    // No photo: a plain face-coloured ball keeps the game playable.
    front.add(part(new SphereGeometry(0.32, 16, 12), new MeshStandardMaterial({ color: "#f1c7a8" }), 0, 0));
  }
  const hat = santaHat("#e8e8e8");
  hat.scale.setScalar(HEAD_HEIGHT * 2.1); // sized to the head
  hat.position.set(-0.02, HEAD_HEIGHT * 0.32, 0); // brim pulled down over the hairline
  hat.rotation.set(0, Math.PI, 0.18); // flop trails back, away from the direction of travel
  front.add(hat);
  return g;
}

function sackOfPresents(): Group {
  const g = new Group();
  const burlap = new MeshStandardMaterial({ color: "#7a5230", roughness: 1 });
  const sack = part(new SphereGeometry(0.34, 14, 10), burlap, 0, 0);
  sack.scale.set(0.9, 1.15, 0.9);
  g.add(sack);
  g.add(part(new TorusGeometry(0.12, 0.04, 8, 14).rotateX(Math.PI / 2), burlap, 0, 0.36));
  // Presents poking out of the neck.
  [["#d4142a", -0.06, 0.48, 0.2], ["#1f7a3e", 0.08, 0.46, -0.15], ["#ffc93b", 0, 0.54, 0.35]].forEach(([c, x, y, r]) => {
    const box = part(new BoxGeometry(0.16, 0.16, 0.16), new MeshStandardMaterial({ color: c as string, roughness: 0.6 }), x as number, y as number);
    box.rotation.z = r as number;
    g.add(box);
  });
  return g;
}

export function buildRyan(image: HTMLImageElement | null): Ryan {
  const group = new Group();
  const lean = new Group();

  const suit = new MeshStandardMaterial({ color: "#b0122a", roughness: 0.75 });
  const fur = new MeshStandardMaterial({ color: "#e8e8e8", roughness: 1 });
  const black = new MeshStandardMaterial({ color: "#16161c", roughness: 0.5 });

  // Legs and boots stay with the skis; everything above the hips leans.
  for (const z of [-0.13, 0.13]) {
    lean.add(part(new CapsuleGeometry(0.1, 0.5, 4, 8), suit, 0, 0.42, z));
    group.add(part(new BoxGeometry(0.3, 0.14, 0.14), black, 0.04, 0.08, z));
  }
  const torso = part(new CapsuleGeometry(0.24, 0.42, 6, 12), suit, 0, 1.05);
  lean.add(torso);
  lean.add(part(new CylinderGeometry(0.255, 0.255, 0.08, 14), black, 0, 0.86)); // belt
  lean.add(part(new BoxGeometry(0.1, 0.09, 0.1), new MeshStandardMaterial({ color: "#e0b030" }), 0.24, 0.86)); // buckle
  lean.add(part(new TorusGeometry(0.25, 0.05, 8, 18).rotateX(Math.PI / 2), fur, 0, 0.7)); // hem
  // Arms swept back along the body, ski-jumper style.
  for (const z of [-0.3, 0.3]) {
    const arm = part(new CapsuleGeometry(0.075, 0.5, 4, 8), suit, -0.12, 1.0, z);
    arm.rotation.z = 0.35;
    lean.add(arm);
  }
  // Fur collar, which the faded-out neck sits in.
  lean.add(part(new TorusGeometry(0.17, 0.07, 8, 16).rotateX(Math.PI / 2), fur, NECK.x, NECK.y));
  const h = head(image);
  lean.add(h);

  const sack = sackOfPresents();
  sack.position.set(-0.36, 1.1, 0);
  lean.add(sack);

  group.add(lean);

  // Skis: long, with upturned tips, red with a white stripe.
  const ski = new MeshStandardMaterial({ color: "#c8102e", roughness: 0.35 });
  const stripe = new MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.4 });
  for (const z of [-0.12, 0.12]) {
    group.add(part(new BoxGeometry(2.4, 0.04, 0.1), ski, 0.35, 0.0, z));
    group.add(part(new BoxGeometry(2.3, 0.045, 0.03), stripe, 0.35, 0.0, z));
    const tip = part(new BoxGeometry(0.22, 0.04, 0.1), ski, 1.62, 0.06, z);
    tip.rotation.z = 0.5;
    group.add(tip);
  }

  const parentTurn = new Quaternion();
  const neck = new Vector3();
  const toCamera = new Vector3();
  return {
    group,
    lean,
    sack,
    faceCamera(camera, crashed) {
      lean.updateWorldMatrix(true, false);
      // Pivot at the neck, moved straight towards the camera: on screen the chin
      // stays exactly on the collar, but nothing on the body can cut into the face.
      lean.localToWorld(neck.copy(NECK));
      toCamera.subVectors(camera.position, neck).normalize();
      neck.addScaledVector(toCamera, FACE_FORWARD);
      h.position.copy(lean.worldToLocal(neck));
      // Face the camera, so the photo and the hat always turn together.
      lean.getWorldQuaternion(parentTurn).invert();
      h.quaternion.copy(parentTurn).multiply(camera.quaternion);
      // Lean a little with the body; tumble with it in a crash.
      const tilt = group.rotation.z + lean.rotation.z;
      h.rotateZ(crashed ? tilt : MathUtils.clamp(tilt * HEAD_FOLLOW, -HEAD_MAX_TILT, HEAD_MAX_TILT));
    },
  };
}
