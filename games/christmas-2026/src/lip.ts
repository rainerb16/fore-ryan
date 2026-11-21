// Marks the lip, so players can see exactly when to tap: a glowing red and
// green line across the deck at the edge, and a sponsor board down each side of
// the take-off table reading "Happy Holidays from" and the Action Furnace logo,
// the way real jumps carry boards along the table. Also the Christmas line down
// the landing hill: land past it for the fireworks.

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  type Scene,
} from "three";
import { CHRISTMAS_LINE_M, hillY, INRUN, landingAngle, xAtDistance } from "../rules";
import { glowing } from "./glow";
import { canvasTexture } from "./world";

const LOGO_SRC = "/assets/af/af-logo.webp";
/** Brand navy, from the Action Furnace brand guide. */
const NAVY = "#081644";
const FONT = `600 76px "Poppins", "Segoe UI", system-ui, sans-serif`;

const DECK_HALF_WIDTH = 2.3;
const DECK_DEPTH = 0.7;
const BOARD = { length: 7, height: 1.3 };

/** The board's artwork: white, with the greeting in navy and the full-colour logo. */
function boardTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 260;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  let logo: HTMLImageElement | null = null;

  const draw = (): void => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // A navy rule along the top and bottom edges.
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, canvas.width, 10);
    ctx.fillRect(0, canvas.height - 10, canvas.width, 10);
    ctx.font = FONT;
    ctx.textBaseline = "middle";
    const text = "Happy Holidays from";
    const logoH = 248;
    const logoW = logo ? (logo.naturalWidth / logo.naturalHeight) * logoH : 0;
    const gap = 40;
    const textW = ctx.measureText(text).width;
    const left = (canvas.width - (textW + gap + logoW)) / 2;
    ctx.fillText(text, left, canvas.height / 2 + 4);
    if (logo) ctx.drawImage(logo, left + textW + gap, (canvas.height - logoH) / 2, logoW, logoH);
    texture.needsUpdate = true;
  };
  draw();
  // Redraw once the brand font and the logo have arrived.
  const image = new Image();
  image.onload = () => {
    logo = image;
    draw();
  };
  image.src = LOGO_SRC;
  void document.fonts?.load(FONT).then(draw, () => undefined);
  return texture;
}

export function buildLipMarker(scene: Scene): void {
  // The table runs down to the lip (the origin) at the table angle.
  const tilt = (-INRUN.tableDeg * Math.PI) / 180;
  const along = (back: number): [number, number] => [-back * Math.cos(tilt), back * Math.sin(-tilt)];

  // The line across the deck, just back from the edge: red, then green behind it.
  for (const [back, color] of [[0.15, glowing("#ff2a3c", 2.5)], [0.42, glowing("#2bd46a", 2)]] as const) {
    const strip = new Mesh(new BoxGeometry(0.24, 0.02, DECK_HALF_WIDTH * 2), new MeshBasicMaterial({ color }));
    const [x, y] = along(back);
    strip.position.set(x, y + 0.012, 0);
    strip.rotation.z = tilt;
    scene.add(strip);
  }

  // A board down each side of the table, just under the deck's edge.
  const art = boardTexture();
  // Lit by the floodlights, with a little light of its own so it reads at night.
  const material = new MeshStandardMaterial({ map: art, emissiveMap: art, emissive: "#ffffff", emissiveIntensity: 0.35, roughness: 0.6 });
  const [cx, cy] = along(BOARD.length / 2 + 0.3);
  for (const side of [-1, 1]) {
    const board = new Mesh(new PlaneGeometry(BOARD.length, BOARD.height), material);
    board.position.set(cx, cy - DECK_DEPTH / 2 - BOARD.height / 2 + 0.3, side * (DECK_HALF_WIDTH + 0.03));
    // Facing outwards, parallel to the table.
    board.rotation.set(0, side > 0 ? 0 : Math.PI, side * tilt);
    scene.add(board);
  }
}

/** A five-pointed star, `r` across its points. */
function star(r: number): ShapeGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.42 : r;
    if (i === 0) shape.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    else shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

/**
 * A glowing gold line across the landing hill at CHRISTMAS_LINE_M, with a lit
 * star on a pole beside it, on the camera's side, so it reads from the air.
 */
export function buildChristmasLine(scene: Scene): void {
  const x = xAtDistance(CHRISTMAS_LINE_M);
  const y = hillY(x);
  const gold = new MeshBasicMaterial({ color: glowing("#ffc93b", 2.6) });

  const line = new Mesh(new BoxGeometry(0.35, 0.02, 10), gold);
  line.position.set(x, y + 0.03, 0);
  line.rotation.z = -landingAngle(x);
  scene.add(line);

  const poleHeight = 3.2;
  const pole = new Mesh(new CylinderGeometry(0.06, 0.06, poleHeight, 10), new MeshStandardMaterial({ color: "#b8b8c2", metalness: 0.6, roughness: 0.4 }));
  pole.position.set(x, y + poleHeight / 2, 6.2);
  scene.add(pole);
  const top = new Mesh(star(0.6), new MeshBasicMaterial({ color: glowing("#ffd166", 3), side: DoubleSide }));
  top.position.set(x, y + poleHeight + 0.45, 6.2);
  scene.add(top);

  const label = new Sprite(new SpriteMaterial({
    map: canvasTexture(256, 64, (ctx) => {
      ctx.font = "bold 34px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(6, 11, 30, 0.85)";
      const text = `${CHRISTMAS_LINE_M} m`;
      ctx.strokeText(text, 128, 34);
      ctx.fillStyle = "#ffd166";
      ctx.fillText(text, 128, 34);
    }),
    depthWrite: false,
  }));
  label.scale.set(3.2, 0.8, 1);
  label.position.set(x, y + poleHeight + 1.45, 6.2);
  scene.add(label);
}
