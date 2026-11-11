// Ryan, ready for Christmas Eve: his floating head (a billboard, so it keeps the
// cutout's look from any angle) in the shared Santa hat, on a Santa-suited body
// with skis and a sack of presents. The group pivots at the boots and faces +x.

import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  type Material,
} from "three";
import { santaHat } from "../../../shared/santa-hat";

/** Where the head sits inside the cutout PNG's transparent margins (same as the golf game). */
const HEAD_TRIM = { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };
const HEAD_HEIGHT = 0.95;

export interface Ryan {
  group: Group;
  /** Tilts forward from the boots: 0 upright, about 1.2 flat in a glide. */
  lean: Group;
  /** The sack, so a crash can hide it as the presents fly. */
  sack: Group;
}

function part(geometry: ConstructorParameters<typeof Mesh>[0], material: Material, x: number, y: number, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function head(image: HTMLImageElement | null): Group {
  const g = new Group();
  if (image) {
    const map = new Texture(image);
    map.colorSpace = SRGBColorSpace;
    map.offset.set(HEAD_TRIM.x, 1 - HEAD_TRIM.y - HEAD_TRIM.h);
    map.repeat.set(HEAD_TRIM.w, HEAD_TRIM.h);
    map.needsUpdate = true;
    const sprite = new Sprite(new SpriteMaterial({ map }));
    sprite.scale.set(HEAD_HEIGHT * (HEAD_TRIM.w / HEAD_TRIM.h), HEAD_HEIGHT, 1);
    g.add(sprite);
  } else {
    // No photo: a plain face-coloured ball keeps the game playable.
    g.add(part(new SphereGeometry(0.32, 16, 12), new MeshStandardMaterial({ color: "#f1c7a8" }), 0, 0));
  }
  const hat = santaHat("#e8e8e8");
  hat.scale.setScalar(2.0);
  hat.position.set(-0.04, HEAD_HEIGHT * 0.47, 0); // brim on the crown, clear of the face
  hat.rotation.set(0, Math.PI, 0.18); // flop trails back, away from the direction of travel
  g.add(hat);
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
  const h = head(image);
  h.position.set(0.04, 1.62, 0);
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

  return { group, lean, sack };
}
