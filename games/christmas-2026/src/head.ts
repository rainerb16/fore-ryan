// Ryan's head: the cutout photo, feathered and bent into a face shape, under the
// shared Santa hat, with Santa's beard painted onto the same card, so it gives
// him a proper chin and stays pinned to his face from every angle. The
// group's origin is the neck (the chin), so it can pivot there like a real head.

import {
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import { santaHat } from "../../../shared/santa-hat";
import { seeded } from "./random";

/** Where the head sits inside the cutout PNG's transparent margins (same as the golf game). */
const HEAD_TRIM = { x: 67 / 300, y: 21 / 300, w: 189 / 300, h: 259 / 300 };
const HEAD_HEIGHT = 0.84;
/** The face's centre above the neck: puts the chin (about 85% down the photo) just on the collar. */
const CHIN_TO_CENTRE = HEAD_HEIGHT * 0.38;
/** How far the middle of the face bulges out from its edges (m). Gentle, so the photo never visibly stretches. */
const FACE_DEPTH = 0.2;

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
  // Fade the neck along a curve that follows the jaw, not a straight line: an
  // oval centred on the face whose edge runs just under the chin (about 0.88 down).
  m.globalCompositeOperation = "destination-in";
  const cx = w * 0.47;
  const cy = h * 0.42;
  const rx = w * 0.56;
  const ry = h * 0.57;
  m.setTransform(rx, 0, 0, ry, cx, cy);
  const fade = m.createRadialGradient(0, 0, 0, 0, 0, 1);
  fade.addColorStop(0.82, "#000");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  m.fillStyle = fade;
  m.fillRect(-cx / rx, -cy / ry, w / rx, h / ry); // the whole canvas, in the oval's units
  m.setTransform(1, 0, 0, 1, 0, 0);

  // The photo, kept only where the mask is: the edge softens inwards, with no halo.
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  return out;
}

/** A narrow bump around a point on the photo (u across, v down, both 0..1). */
const bump = (u: number, v: number, cu: number, cv: number, su: number, sv: number): number =>
  Math.exp(-(((u - cu) / su) ** 2) - ((v - cv) / sv) ** 2);

/**
 * The photo's card bent into a face: rounded like a head, the nose and chin
 * standing out and the eyes set in a little. Landmarks are where they sit in the trimmed photo.
 */
/** How far the face surface stands out at a point on the photo (u across, v down). */
function faceDepth(u: number, v: number): number {
  // An egg shape centred on the face, falling away towards the hair and jaw.
  // His face sits a little left of the photo's centre (nose and mouth at u 0.44).
  const nx = (u - 0.45) / 0.55;
  const ny = (v - 0.5) / 0.62;
  const round = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const nose = bump(u, v, 0.44, 0.6, 0.06, 0.1);
  const eyes = bump(u, v, 0.29, 0.5, 0.07, 0.04) + bump(u, v, 0.635, 0.5, 0.07, 0.04);
  const chin = bump(u, v, 0.44, 0.9, 0.1, 0.05);
  return FACE_DEPTH * round + 0.05 * nose + 0.04 * chin - 0.015 * eyes;
}

const FACE_WIDTH = HEAD_HEIGHT * (HEAD_TRIM.w / HEAD_TRIM.h);
/** Face depth at a point given in metres from the face's centre (x across, y up). */
const depthAt = (x: number, y: number): number => faceDepth(x / FACE_WIDTH + 0.5, 0.5 - y / HEAD_HEIGHT);


// The head is one card, in face-centred metres (x across, y up): the photo, with
// the beard painted onto the same texture, so the two can never drift apart.
// Landmarks in the photo: nose tip at about y -0.16, mouth -0.25, chin -0.38,
// all on a midline at x = MID, a little left of the photo's centre.
const MID = -0.037;
const CARD = { left: -0.39, right: 0.31, top: HEAD_HEIGHT / 2, bottom: -0.74 };
const BEARD = { top: 0.04, bottom: CARD.bottom };
/** Texture pixels per metre: the photo's own resolution (softHead draws it 256 wide). */
const PX_PER_M = 256 / (HEAD_HEIGHT * (HEAD_TRIM.w / HEAD_TRIM.h));

const smoothstep = (a: number, b: number, x: number): number => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * How much beard covers a point (0..1, soft at the edges): sideburns down the
 * jaw into a full beard with a rounded point, with the mouth and cheeks left clear.
 */
function beardCover(cardX: number, y: number): number {
  const x = cardX - MID;
  // A wavy outline, so the edge reads as hair rather than a cut-out.
  const wave = 1 + 0.05 * Math.sin(y * 70) + 0.03 * Math.sin(x * 90 + y * 40);
  const below = Math.max(0, -0.28 - y) / 0.44;
  const halfWidth = below >= 1 ? 0 : 0.32 * Math.sqrt(1 - below * below) * wave;
  const outline = 1 - smoothstep(halfWidth * 0.85, halfWidth, Math.abs(x));
  // Nothing above the ears.
  const top = 1 - smoothstep(-0.04, 0.02, y);
  // The mouth and cheeks: an oval hole, which the moustache then crosses.
  const hx = x / 0.215;
  const hy = (y + 0.13) / 0.175;
  const hole = smoothstep(0.85, 1.08, Math.sqrt(hx * hx + hy * hy));
  return outline * top * hole;
}

const cardPx = (x: number): number => (x - CARD.left) * PX_PER_M;
const cardPy = (y: number): number => (CARD.top - y) * PX_PER_M;

/**
 * The whole head's texture: the feathered photo, then Santa's beard of long
 * white hairs over the lower face, and a moustache swept out from under the nose.
 */
function headTexture(image: HTMLImageElement): HTMLCanvasElement | null {
  const photo = softHead(image);
  const w = Math.round((CARD.right - CARD.left) * PX_PER_M);
  const h = Math.round((CARD.top - CARD.bottom) * PX_PER_M);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const out = canvas.getContext("2d");
  const hairs = document.createElement("canvas");
  hairs.width = w;
  hairs.height = h;
  const ctx = hairs.getContext("2d");
  if (!photo || !out || !ctx) return null;
  out.drawImage(photo, cardPx(-FACE_WIDTH / 2), cardPy(HEAD_HEIGHT / 2));
  const px = cardPx;
  const py = cardPy;
  const random = seeded(11);
  const hair = (): string => {
    const l = 82 + random() * 15;
    return `hsla(215, 10%, ${l}%, ${0.35 + random() * 0.4})`;
  };

  // A soft base, then strands falling and fanning out a little from the middle.
  ctx.fillStyle = "#dde2ea";
  ctx.fillRect(0, py(BEARD.top), w, h);
  ctx.lineCap = "round";
  for (let i = 0; i < 1400; i++) {
    const x = CARD.left + random() * (CARD.right - CARD.left);
    const y = BEARD.top - random() * (BEARD.top - BEARD.bottom) * 0.85;
    const length = 0.08 + random() * 0.18;
    const drift = (x - MID) * 0.25 + (random() - 0.5) * 0.06;
    const curl = (random() - 0.5) * 0.08;
    ctx.strokeStyle = hair();
    ctx.lineWidth = 1 + random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(px(x), py(y));
    ctx.quadraticCurveTo(px(x + drift * 0.5 + curl), py(y - length * 0.5), px(x + drift), py(y - length));
    ctx.stroke();
  }

  // Keep only the beard's shape, with soft edges, and lay it over the photo.
  const shape = ctx.getImageData(0, 0, w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = beardCover(CARD.left + i / PX_PER_M, CARD.top - j / PX_PER_M);
      shape.data[(j * w + i) * 4 + 3] *= a;
    }
  }
  ctx.putImageData(shape, 0, 0);
  out.drawImage(hairs, 0, 0);

  // The moustache: two thick sweeps from under the nose, over the upper lip,
  // curling up at the ends.
  ctx.clearRect(0, 0, w, h);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 260; i++) {
      const t0 = random() * 0.3;
      const spread = (random() - 0.5) * 0.065;
      ctx.strokeStyle = hair();
      ctx.lineWidth = 2 + random() * 3;
      ctx.beginPath();
      ctx.moveTo(px(MID + side * (0.01 + t0 * 0.05)), py(-0.175 + spread * 0.5));
      ctx.quadraticCurveTo(
        px(MID + side * 0.1), py(-0.215 + spread),
        px(MID + side * (0.17 + random() * 0.04)), py(-0.17 + spread * 0.6 + random() * 0.03),
      );
      ctx.stroke();
    }
  }
  out.drawImage(hairs, 0, 0);
  return canvas;
}

/**
 * The card bent into a head: the face's curve (nose, chin, eyes) where the photo
 * is, and below the chin the beard filling out and hanging in a rounded curve.
 */
function headGeometry(): PlaneGeometry {
  const width = CARD.right - CARD.left;
  const height = CARD.top - CARD.bottom;
  const geometry = new PlaneGeometry(width, height, 40, 64);
  geometry.translate((CARD.left + CARD.right) / 2, (CARD.top + CARD.bottom) / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const skin = depthAt(x, y);
    const fromMid = x - MID;
    const hang = smoothstep(-0.3, -0.7, y);
    const full = 0.05 * (1 - Math.min(1, Math.abs(fromMid) / 0.33)) * (1 - hang * 0.5);
    const hanging = Math.max(skin, (0.2 - 0.12 * hang) * (1 - (fromMid / 0.4) ** 2) + 0.015 + full);
    const onFace = 1 - smoothstep(-0.28, -0.4, y);
    pos.setZ(i, MathUtils.lerp(hanging, skin, onFace));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The head, pivoting at its chin: the group's origin is the neck. */
export function buildHead(image: HTMLImageElement | null): Group {
  const g = new Group();
  const front = new Group();
  front.position.set(-MID, CHIN_TO_CENTRE, 0); // his face's midline over the neck
  g.add(front);
  const art = image && headTexture(image);
  if (art) {
    const map = new CanvasTexture(art);
    map.colorSpace = SRGBColorSpace;
    map.premultiplyAlpha = true;
    // Lit, so the moon and lamps shade it, with a little glow of its own so the
    // photo stays recognisable in the dark.
    const face = new Mesh(
      headGeometry(),
      new MeshStandardMaterial({
        map,
        emissiveMap: map,
        emissive: "#777777",
        roughness: 0.75,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
      }),
    );
    front.add(face);
  } else {
    // No photo: a plain face-coloured ball keeps the game playable.
    front.add(new Mesh(new SphereGeometry(0.32, 16, 12), new MeshStandardMaterial({ color: "#f1c7a8" })));
  }
  const hat = santaHat("#e8e8e8");
  hat.scale.setScalar(HEAD_HEIGHT * 2.1); // sized to the head
  hat.position.set(-0.02, HEAD_HEIGHT * 0.32, 0); // brim pulled down over the hairline
  hat.rotation.set(0, Math.PI, 0.18); // flop trails back, away from the direction of travel
  front.add(hat);
  return g;
}
