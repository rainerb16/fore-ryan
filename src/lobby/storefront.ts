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
  ConeGeometry,
  CylinderGeometry,
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

/** A snowy-or-not evergreen: tiers of cones on a trunk, `h` metres tall. */
function evergreen(h: number, winter: boolean, lights: boolean): Group {
  const g = new Group();
  const trunk = new Mesh(new CylinderGeometry(h * 0.03, h * 0.04, h * 0.18, 8), new MeshStandardMaterial({ color: "#3b2618", roughness: 0.9 }));
  trunk.position.y = h * 0.09;
  g.add(trunk);
  const needles = new MeshStandardMaterial({ color: "#1c4a2c", roughness: 0.9 });
  // Grey, not white: under the door lamp, white snow glows like a light.
  const snowy = new MeshStandardMaterial({ color: "#8d909e", roughness: 1 });
  [[0.34, 0.42, 0.34], [0.27, 0.36, 0.58], [0.19, 0.3, 0.8]].forEach(([r, th, y]) => {
    const tier = new Mesh(new ConeGeometry(h * r, h * th, 14), needles);
    tier.position.y = h * y;
    g.add(tier);
    if (winter) {
      // Snow resting on the top of each tier.
      const cap = new Mesh(new ConeGeometry(h * r * 0.62, h * th * 0.42, 14), snowy);
      cap.position.y = h * (y + th * 0.3);
      g.add(cap);
    }
  });
  if (lights) {
    const colours = ["#ff3b3b", "#3bff7a", "#ffd23b", "#3bb4ff"];
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      const y = h * (0.22 + t * 0.7);
      const r = h * 0.3 * (1 - t * 0.85) + 0.02;
      const a = t * Math.PI * 7;
      const bulb = new Mesh(new SphereGeometry(0.016, 6, 4), new MeshBasicMaterial({ color: new Color(colours[i % 4]).multiplyScalar(0.7) }));
      bulb.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.add(bulb);
    }
  }
  return g;
}

/** A street-name blade: white letters on green, as on a real signpost. */
function streetBlade(name: string): Mesh {
  const art = paint(512, 112, (ctx) => {
    ctx.fillStyle = "#11653a";
    ctx.fillRect(0, 0, 512, 112);
    ctx.strokeStyle = "#e9efe9";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 96);
    ctx.fillStyle = "#f4f7f2";
    ctx.font = `700 68px "Oswald", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 256, 60, 470);
  });
  const material = new MeshStandardMaterial({ map: art, emissiveMap: art, emissive: "#ffffff", emissiveIntensity: 0.05, roughness: 0.8 });
  // Two faces back to back, so it reads from either side.
  return new Mesh(new BoxGeometry(0.9, 0.2, 0.02), material);
}

/**
 * A street fire hydrant: a bolted base flange, a barrel with a raised band, a
 * domed bonnet with the five-sided valve nut on top, two side hose outlets with
 * chained caps, and the big pumper outlet on the front. Yellow, a little worn.
 */
function hydrant(winter: boolean): Group {
  const g = new Group();
  const paint_ = new MeshStandardMaterial({ color: "#e0a91c", roughness: 0.55, metalness: 0.25 });
  const worn = new MeshStandardMaterial({ color: "#b8871a", roughness: 0.7, metalness: 0.3 });
  const iron = new MeshStandardMaterial({ color: "#5a5652", roughness: 0.6, metalness: 0.6 });
  const add = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const ring = (r: number, h: number, y: number, m = paint_, seg = 24): Mesh => add(new Mesh(new CylinderGeometry(r, r, h, seg), m), 0, y, 0);

  // The ground flange, bolted down.
  ring(0.17, 0.05, 0.025, worn);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(new Mesh(new CylinderGeometry(0.014, 0.014, 0.03, 6), iron), Math.cos(a) * 0.145, 0.06, Math.sin(a) * 0.145);
  }
  // The barrel, slightly narrower at the top, with a raised band and an upper flange.
  add(new Mesh(new CylinderGeometry(0.105, 0.12, 0.46, 24), paint_), 0, 0.28, 0);
  ring(0.125, 0.035, 0.2);
  ring(0.13, 0.04, 0.52, worn);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    add(new Mesh(new CylinderGeometry(0.011, 0.011, 0.05, 6), iron), Math.cos(a) * 0.118, 0.54, Math.sin(a) * 0.118);
  }
  // The bonnet: a dome, then the valve nut, five-sided so only a hydrant wrench fits.
  add(new Mesh(new SphereGeometry(0.115, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint_), 0, 0.54, 0);
  ring(0.045, 0.04, 0.665, worn, 24);
  ring(0.032, 0.05, 0.705, iron, 5);

  // Two side hose outlets, each with a cap (a nut on its face) and a chain looping back.
  for (const side of [-1, 1]) {
    const outlet = new Mesh(new CylinderGeometry(0.042, 0.048, 0.1, 18), paint_);
    outlet.rotation.z = Math.PI / 2;
    add(outlet, side * 0.15, 0.38, 0);
    const cap = new Mesh(new CylinderGeometry(0.05, 0.05, 0.035, 18), worn);
    cap.rotation.z = Math.PI / 2;
    add(cap, side * 0.205, 0.38, 0);
    const nut = new Mesh(new CylinderGeometry(0.022, 0.022, 0.025, 5), iron);
    nut.rotation.z = Math.PI / 2;
    add(nut, side * 0.232, 0.38, 0);
    // The chain: a few small links hanging in a curve back to the barrel.
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      const link = new Mesh(new TorusGeometry(0.008, 0.0025, 4, 8), iron);
      link.rotation.y = k % 2 ? Math.PI / 2 : 0;
      add(link, side * (0.2 - t * 0.08), 0.34 - Math.sin(t * Math.PI) * 0.05, 0.03);
    }
  }
  // The pumper outlet on the front, bigger, with its own cap and nut.
  const pumper = new Mesh(new CylinderGeometry(0.06, 0.068, 0.09, 20), paint_);
  pumper.rotation.x = Math.PI / 2;
  add(pumper, 0, 0.34, 0.14);
  const pumperCap = new Mesh(new CylinderGeometry(0.072, 0.072, 0.04, 20), worn);
  pumperCap.rotation.x = Math.PI / 2;
  add(pumperCap, 0, 0.34, 0.2);
  const pumperNut = new Mesh(new CylinderGeometry(0.026, 0.026, 0.03, 5), iron);
  pumperNut.rotation.x = Math.PI / 2;
  add(pumperNut, 0, 0.34, 0.23);

  // A dusting of snow on the bonnet, in season.
  if (winter) {
    const snow = new Mesh(new SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: "#8d909e", roughness: 1 }));
    snow.scale.y = 0.45;
    add(snow, 0, 0.6, 0);
  }

  g.position.set(1.75, 0, 1.15); // in front of the right window, inside even a phone's view
  g.rotation.y = -0.4; // turned a little, so its side outlets show
  return g;
}

/** What stands on the pavement: potted trees by the door, a hydrant, and a signpost. */
function streetFurniture(winter: boolean): Group[] {
  const parts: Group[] = [];

  // A potted evergreen either side of the door, lit up in season.
  for (const side of [-1, 1]) {
    const g = new Group();
    const pot = new Mesh(new CylinderGeometry(0.2, 0.16, 0.36, 16), new MeshStandardMaterial({ color: "#3a3440", roughness: 0.7 }));
    pot.position.y = 0.18;
    g.add(pot);
    const tree = evergreen(1.25, winter, winter);
    tree.position.y = 0.32;
    g.add(tree);
    g.position.set(side * 0.86, 0, 0.32);
    parts.push(g);
  }

  // A yellow fire hydrant by the kerb, the classic three-outlet kind.
  parts.push(hydrant(winter));

  // A street-name signpost at the corner: Ryan Ave crossing Arcade St.
  {
    const g = new Group();
    const steel = new MeshStandardMaterial({ color: "#5a5d66", roughness: 0.5, metalness: 0.7 });
    const pole = new Mesh(new CylinderGeometry(0.035, 0.04, 2.9, 10), steel);
    pole.position.y = 1.45;
    g.add(pole);
    const ave = streetBlade("RYAN AVE");
    ave.position.set(0, 2.75, 0);
    g.add(ave);
    const st = streetBlade("ARCADE ST");
    st.position.set(0, 2.52, 0);
    st.rotation.y = Math.PI / 2;
    g.add(st);
    g.position.set(-2.55, 0, 1.0);
    g.rotation.y = -0.35; // turned so both names catch the eye
    parts.push(g);
  }

  return parts;
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
  // A dark board behind the sign, so it reads against the lit room behind the glass.
  const board = new Mesh(new PlaneGeometry(doorW - 0.12, (doorW - 0.2) * 0.625 + 0.1), new MeshBasicMaterial({ color: "#05030a", transparent: true, opacity: 0.88 }));
  board.position.set(doorW / 2, 1.3, -0.015);
  door.add(board);
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
  open.position.set(-1.55, 2.35, -0.05); // by the door, clear of the snack bar's neon behind
  front.add(open);

  // A warm lamp over the door, lighting the step and the pavement.
  const lamp = new PointLight("#ffd9a8", 4.5, 6, 1.6);
  lamp.position.set(0, 3.0, 0.8);
  front.add(lamp);
  const lampShade = new Mesh(new SphereGeometry(0.06, 14, 10), new MeshBasicMaterial({ color: new Color("#ffe2b8").multiplyScalar(0.85) }));
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

  // --- the street furniture ----------------------------------------------------------------
  const winter = o.season === "christmas";
  front.add(...streetFurniture(winter));

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
