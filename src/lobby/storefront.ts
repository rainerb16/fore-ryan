// The outside of the arcade, where a visit starts: a brick shop front at night
// with the neon "Ryan Arcade" sign over the door, big windows looking into the
// real room (the cabinets and lights are the actual scene, not a picture), an
// OPEN sign, and "Click to enter" hanging in the glass door. In season there's
// a wreath on the door and snow falling in the street.
//
// It stands across the front of the room at FRONT_Z, facing the street (+z).
// The door is centred on x = 0, in line with the first game's cabinet.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  type Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  type Texture,
} from "three";
import type { Season } from "./season";
import { neonSign, paint } from "./textures";

/** Where the shop front stands: well in front of where the camera rides inside. */
export const FRONT_Z = 4.6;
const WIDTH = 36; // as wide as the room, so there's nothing to see round the sides
const HEIGHT = 4.8;

/** The door's opening, and the windows either side of it (x from, x to, y from, y to). */
const DOOR = { x0: -0.6, x1: 0.6, y0: 0, y1: 2.45 };
const WINDOWS = [
  { x0: -4.6, x1: -0.95, y0: 0.55, y1: 2.75 },
  { x0: 0.95, x1: 4.6, y0: 0.55, y1: 2.75 },
];

const NEON_FONT = `700 120px "Oswald", Impact, sans-serif`;

function bricks(): Texture {
  return paint(256, 256, (ctx) => {
    ctx.fillStyle = "#1b1016"; // mortar
    ctx.fillRect(0, 0, 256, 256);
    const rowH = 32;
    for (let row = 0; row < 8; row++) {
      const offset = row % 2 ? 32 : 0;
      for (let col = -1; col < 5; col++) {
        // Each brick a slightly different dark red.
        const shade = 0.75 + ((row * 7 + col * 13) % 10) / 40;
        ctx.fillStyle = `rgb(${Math.round(92 * shade)}, ${Math.round(34 * shade)}, ${Math.round(38 * shade)})`;
        ctx.fillRect(col * 64 + offset + 3, row * rowH + 3, 58, rowH - 6);
      }
    }
  });
}

/** A neon tube word, drawn glowing on black, for an additive plane. */
function neonWord(text: string, colour: string, width = 512, height = 192): CanvasTexture {
  return paint(width, height, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.font = NEON_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = colour;
    ctx.shadowBlur = 28;
    ctx.fillStyle = colour;
    for (let i = 0; i < 3; i++) ctx.fillText(text, width / 2, height / 2 + 6, width - 40);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff6fc";
    ctx.fillText(text, width / 2, height / 2 + 6, width - 40);
  });
}

/** The sign hanging inside the glass door. */
function doorSign(words: string): CanvasTexture {
  return paint(512, 320, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 512, 320);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 92px "Oswald", Impact, sans-serif`;
    const [first, second] = words.split(" to ");
    for (const [line, y, colour] of [[`${first.toUpperCase()} TO`, 108, "#36e2ff"], [second.toUpperCase(), 222, "#ff3fd0"]] as const) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 24;
      ctx.fillStyle = colour;
      ctx.fillText(line, 256, y, 470);
      ctx.fillText(line, 256, y, 470);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#f5fbff";
      ctx.fillText(line, 256, y, 470);
    }
  });
}

function glow(map: Texture, w: number, h: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  return new Mesh(
    new PlaneGeometry(w, h),
    new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false }),
  );
}

export interface Storefront {
  /** Swings the door open, 0 shut to 1 wide open. */
  openDoor(amount: number): void;
  /** Falling snow and the door sign's flicker; called every frame while it's in view. */
  update(time: number, dt: number): void;
}

export interface StorefrontOptions {
  season: Season;
  /** "Click to enter", or "Tap to enter" on a touch screen. */
  words: string;
  lowPower: boolean;
}

export function buildStorefront(scene: Scene, o: StorefrontOptions): Storefront {
  const front = new Group();
  front.position.z = FRONT_Z;
  scene.add(front);

  // --- the wall, with holes for the door and the windows --------------------------
  const outline = new Shape();
  outline.moveTo(-WIDTH / 2, 0);
  outline.lineTo(WIDTH / 2, 0);
  outline.lineTo(WIDTH / 2, HEIGHT);
  outline.lineTo(-WIDTH / 2, HEIGHT);
  outline.closePath();
  for (const hole of [DOOR, ...WINDOWS]) {
    const h = new Path();
    h.moveTo(hole.x0, hole.y0);
    h.lineTo(hole.x0, hole.y1);
    h.lineTo(hole.x1, hole.y1);
    h.lineTo(hole.x1, hole.y0);
    h.closePath();
    outline.holes.push(h);
  }
  const wallGeometry = new ShapeGeometry(outline);
  // Brick UVs in metres, so the texture repeats every metre.
  const uv = wallGeometry.getAttribute("uv");
  const pos = wallGeometry.getAttribute("position");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  const brick = bricks();
  brick.wrapS = brick.wrapT = RepeatWrapping;
  front.add(new Mesh(wallGeometry, new MeshStandardMaterial({ map: brick, roughness: 0.9 })));

  // Frames round the openings, and glass in the windows.
  const frame = new MeshStandardMaterial({ color: "#14121c", roughness: 0.4, metalness: 0.5 });
  const glass = new MeshStandardMaterial({
    color: "#0a0a12",
    roughness: 0.05,
    metalness: 1,
    transparent: true,
    opacity: 0.16,
    envMapIntensity: 3,
    depthWrite: false,
  });
  const bar = (w: number, h: number, x: number, y: number): void => {
    const m = new Mesh(new BoxGeometry(w, h, 0.12), frame);
    m.position.set(x, y, 0);
    front.add(m);
  };
  for (const win of WINDOWS) {
    const w = win.x1 - win.x0;
    const h = win.y1 - win.y0;
    const cx = (win.x0 + win.x1) / 2;
    const cy = (win.y0 + win.y1) / 2;
    bar(w + 0.12, 0.08, cx, win.y0);
    bar(w + 0.12, 0.08, cx, win.y1);
    bar(0.08, h, win.x0, cy);
    bar(0.08, h, win.x1, cy);
    const pane = new Mesh(new PlaneGeometry(w, h), glass);
    pane.position.set(cx, cy, 0);
    front.add(pane);
  }
  bar(0.1, DOOR.y1, DOOR.x0 - 0.05, DOOR.y1 / 2);
  bar(0.1, DOOR.y1, DOOR.x1 + 0.05, DOOR.y1 / 2);
  bar(DOOR.x1 - DOOR.x0 + 0.2, 0.1, 0, DOOR.y1 + 0.05);

  // --- the door: glass in a frame, hinged on its left, with the sign inside --------
  const doorW = DOOR.x1 - DOOR.x0;
  const door = new Group();
  door.position.set(DOOR.x0, 0, -0.02);
  front.add(door);
  const doorBar = (w: number, h: number, x: number, y: number): void => {
    const m = new Mesh(new BoxGeometry(w, h, 0.05), frame);
    m.position.set(x, y, 0);
    door.add(m);
  };
  doorBar(doorW, 0.14, doorW / 2, 0.07);
  doorBar(doorW, 0.1, doorW / 2, DOOR.y1 - 0.05);
  doorBar(0.08, DOOR.y1, 0.04, DOOR.y1 / 2);
  doorBar(0.08, DOOR.y1, doorW - 0.04, DOOR.y1 / 2);
  const doorGlass = new Mesh(new PlaneGeometry(doorW - 0.16, DOOR.y1 - 0.24), glass);
  doorGlass.position.set(doorW / 2, DOOR.y1 / 2, 0);
  door.add(doorGlass);
  const handle = new Mesh(new BoxGeometry(0.03, 0.42, 0.05), new MeshStandardMaterial({ color: "#b8b8c2", metalness: 0.9, roughness: 0.25 }));
  handle.position.set(doorW - 0.14, 1.05, 0.06);
  door.add(handle);
  // As big as the door's glass allows, and dimmed: bloom turns full-bright neon white.
  const sign = glow(doorSign(o.words), doorW - 0.2, (doorW - 0.2) * 0.625);
  sign.material.color.setScalar(0.6);
  sign.position.set(doorW / 2, 1.3, -0.01);
  door.add(sign);

  // --- neon over the door, and OPEN in the window -----------------------------------
  const name = glow(neonSign(), 3.4, 3.4 * (384 / 1024));
  name.material.color.setScalar(0.45); // a halo, not a white-out (the room's sign is dimmed the same way)
  name.position.set(0, 3.55, 0.05);
  front.add(name);
  const open = glow(neonWord("OPEN", "#ff3b4f"), 0.9, 0.34);
  open.material.color.setScalar(0.6);
  open.position.set(-2.6, 2.25, -0.05);
  front.add(open);

  // A warm lamp over the door, lighting the step and the pavement.
  const lamp = new PointLight("#ffd9a8", 10, 7, 1.6);
  lamp.position.set(0, 3.0, 0.8);
  front.add(lamp);
  const lampShade = new Mesh(new SphereGeometry(0.08, 14, 10), new MeshBasicMaterial({ color: new Color("#ffe2b8").multiplyScalar(1.4) }));
  lampShade.position.copy(lamp.position);
  front.add(lampShade);

  // --- the street ------------------------------------------------------------------------
  // Pavement and road over the room's carpet, which runs on under the front.
  const pavement = new Mesh(new PlaneGeometry(WIDTH, 3.2), new MeshStandardMaterial({ color: "#26252c", roughness: 0.95 }));
  pavement.rotation.x = -Math.PI / 2;
  pavement.position.set(0, 0.004, 1.6);
  front.add(pavement);
  const road = new Mesh(new PlaneGeometry(WIDTH, 30), new MeshStandardMaterial({ color: "#121117", roughness: 1 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.002, 18);
  front.add(road);
  const kerb = new Mesh(new BoxGeometry(WIDTH, 0.12, 0.2), new MeshStandardMaterial({ color: "#3a3942", roughness: 0.9 }));
  kerb.position.set(0, 0.06, 3.2);
  front.add(kerb);

  // --- the season ----------------------------------------------------------------------
  let snow: { points: Points; pos: Float32Array; drift: Float32Array } | null = null;
  if (o.season === "christmas") {
    // A wreath on the door, over the sign.
    // A small wreath high on the door, clear of the sign.
    const wreathY = 2.06;
    const wreath = new Mesh(new TorusGeometry(0.13, 0.045, 10, 28), new MeshStandardMaterial({ color: "#1f5a32", roughness: 0.9 }));
    wreath.position.set(doorW / 2, wreathY, 0.06);
    door.add(wreath);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const berry = new Mesh(new SphereGeometry(0.022, 8, 6), new MeshStandardMaterial({ color: "#c8102e", roughness: 0.3 }));
      berry.position.set(doorW / 2 + Math.cos(a) * 0.13, wreathY + Math.sin(a) * 0.13, 0.1);
      door.add(berry);
    }
    const bow = new Mesh(new BoxGeometry(0.12, 0.05, 0.04), new MeshStandardMaterial({ color: "#c8102e", roughness: 0.5 }));
    bow.position.set(doorW / 2, wreathY - 0.13, 0.1);
    door.add(bow);

    // Snow falling in the street, in front of the shop.
    const count = o.lowPower ? 350 : 700;
    const pos = new Float32Array(count * 3);
    const drift = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([(Math.random() - 0.5) * 12, Math.random() * 5.5, 0.2 + Math.random() * 9], i * 3);
      drift[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(pos, 3));
    const flake = paint(32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    });
    const points = new Points(geometry, new PointsMaterial({ map: flake, color: "#b9bdd0", size: 0.06, transparent: true, depthWrite: false }));
    points.frustumCulled = false;
    points.raycast = () => {};
    front.add(points);
    snow = { points, pos, drift };
  }

  // Everything out here belongs to the street, not to the arcade's tap targets.
  front.traverse((node) => {
    if (node !== front) node.raycast = () => {};
  });

  return {
    openDoor(amount) {
      // Inwards, into the arcade.
      door.rotation.y = amount * 1.7;
    },
    update(time, dt) {
      // The sign hums: steady, with a rare flicker.
      sign.material.opacity = Math.sin(time * 23) > 0.96 ? 0.6 : 0.85 + 0.15 * Math.sin(time * 2.2);
      if (!snow) return;
      const { pos, drift } = snow;
      for (let i = 0; i < drift.length; i++) {
        const k = i * 3;
        pos[k + 1] -= (0.5 + (i % 5) * 0.08) * dt;
        pos[k] += Math.sin(time * 0.7 + drift[i]) * 0.15 * dt;
        if (pos[k + 1] < 0) pos[k + 1] += 5.5;
      }
      snow.points.geometry.getAttribute("position").needsUpdate = true;
    },
  };
}
