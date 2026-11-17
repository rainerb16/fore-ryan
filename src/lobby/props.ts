// The rest of the arcade floor, filling the room so it reads as a real arcade
// through the shop windows without looking like games you can't play: a claw
// machine full of plush toys (and a few Ryan plushies), a prize counter, a snack
// bar, café tables with food left on them, and neon art on the wall. All kept
// clear of the cabinet row and of the camera's path in from the door.

import {
  AdditiveBlending,
  BoxGeometry,
  type CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  type Texture,
} from "three";
import { contactShadow, lightPool, paint } from "./textures";

const NEON_FONT = `700 110px "Oswald", Impact, sans-serif`;

/** Advances the props' lights and the claw; called every frame. */
export type Props = (time: number) => void;

export interface PropsOptions {
  /** Ryan's head cutout, for the plushies; without it there are none. */
  head: HTMLImageElement | null;
  /** Where the wall is, and the open ends of the room either side of the cabinets. */
  wallZ: number;
  leftX: number;
  rightX: number;
  /** Where the shop front is: the strip just inside its windows gets the front-of-house machines. */
  frontZ: number;
}

const matte = (color: string, roughness = 0.8): MeshStandardMaterial => new MeshStandardMaterial({ color, roughness });
const lit = (color: string, power = 1.4): MeshBasicMaterial => new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power) });

function box(w: number, h: number, d: number, material: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A neon word or picture: glowing on black, for an additive plane. */
function neon(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  return paint(width, height, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    draw(ctx);
  });
}

function neonWord(text: string, colour: string): CanvasTexture {
  return neon(640, 180, (ctx) => {
    ctx.font = NEON_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = colour;
    ctx.shadowBlur = 26;
    ctx.fillStyle = colour;
    ctx.fillText(text, 320, 96, 600);
    ctx.fillText(text, 320, 96, 600);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff4fb";
    ctx.fillText(text, 320, 96, 600);
  });
}

/** A joystick drawn in neon tube: the base, the stick, and the ball. */
function neonJoystick(): CanvasTexture {
  return neon(320, 320, (ctx) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const tube = (colour: string, draw: () => void): void => {
      for (const [width, style, blur] of [[16, colour, 24], [6, "#fff4fb", 0]] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.shadowColor = colour;
        ctx.shadowBlur = blur;
        ctx.beginPath();
        draw();
        ctx.stroke();
      }
    };
    tube("#36e2ff", () => ctx.roundRect(60, 220, 200, 60, 18));
    tube("#36e2ff", () => {
      ctx.moveTo(160, 222);
      ctx.lineTo(196, 120);
    });
    tube("#ff3fd0", () => ctx.arc(206, 92, 34, 0, Math.PI * 2));
    tube("#ffd166", () => ctx.arc(110, 250, 10, 0, Math.PI * 2));
  });
}

function glow(map: Texture, w: number, h: number, power = 0.6): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  m.material.color.setScalar(power); // a halo under bloom, not a white-out
  return m;
}

/** A soft dark footprint and a coloured pool of light, to sit a prop on the carpet. */
function grounding(group: Group, w: number, d: number, colour: string | null): void {
  const shadow = new Mesh(new PlaneGeometry(w + 0.4, d + 0.4), new MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  group.add(shadow);
  if (!colour) return;
  const pool = new Mesh(
    new PlaneGeometry(w + 1, d + 1),
    new MeshBasicMaterial({ map: lightPool(), color: colour, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.005, d / 2 + 0.3);
  group.add(pool);
}

// --- the claw machine -------------------------------------------------------------------

function clawMachine(head: HTMLImageElement | null): { group: Group; update: (time: number) => void } {
  const g = new Group();
  const W = 0.9;
  const D = 0.8;
  const pink = "#ff4fb8";
  // The base, with a prize chute and a coin slot.
  g.add(box(W, 0.86, D, matte("#2a1240", 0.45), 0, 0.43, 0));
  g.add(box(W + 0.02, 0.05, D + 0.02, lit(pink, 0.9), 0, 0.88, 0)); // a lit trim round the top of the base
  g.add(box(0.26, 0.22, 0.02, matte("#0c0a12"), -0.2, 0.5, D / 2 + 0.005)); // the chute
  g.add(box(0.05, 0.08, 0.02, lit("#ff3b3b", 1), 0.25, 0.62, D / 2 + 0.005));
  // The control deck: a joystick and a button.
  g.add(box(W, 0.06, 0.18, matte("#1a1422", 0.5), 0, 0.9, D / 2 + 0.06));
  const stick = new Mesh(new SphereGeometry(0.03, 14, 10), matte("#d4142a", 0.2));
  stick.position.set(-0.12, 0.98, D / 2 + 0.06);
  g.add(stick);
  g.add(box(0.06, 0.02, 0.06, lit("#ffd23b", 1), 0.12, 0.94, D / 2 + 0.06));

  // The glass case: corner posts, a lit roof, and see-through panes.
  const caseH = 1.0;
  const post = matte("#1a1422", 0.4);
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) for (const z of [-D / 2 + 0.02, D / 2 - 0.02]) g.add(box(0.04, caseH, 0.04, post, x, 0.9 + caseH / 2, z));
  g.add(box(W, 0.1, D, matte("#2a1240", 0.45), 0, 0.9 + caseH + 0.05, 0));
  g.add(box(W - 0.1, 0.02, D - 0.1, lit("#fff1fb", 1.1), 0, 0.9 + caseH - 0.01, 0)); // the light inside the roof
  const glassMat = new MeshStandardMaterial({ color: "#a8d8ff", transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.9, depthWrite: false });
  for (const [w, x, z, ry] of [[W, 0, D / 2, 0], [W, 0, -D / 2, 0], [D, W / 2, 0, Math.PI / 2], [D, -W / 2, 0, Math.PI / 2]] as const) {
    const pane = new Mesh(new PlaneGeometry(w, caseH), glassMat);
    pane.position.set(x, 0.9 + caseH / 2, z);
    pane.rotation.y = ry;
    g.add(pane);
  }
  // The neon sign on top.
  const sign = glow(neonWord("CLAW", pink), W, W * 0.28, 0.7);
  sign.position.set(0, 0.9 + caseH + 0.24, D / 2 - 0.05);
  g.add(sign);

  // The pile of plush toys: soft balls in bright colours, heaped higher at the back...
  const colours = ["#ff6fa3", "#ffd23b", "#5ee6a8", "#4fb6ff", "#b48cff", "#ff8a3d", "#ff4f6a"];
  let n = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const x = -W / 2 + 0.12 + col * 0.13 + (row % 2) * 0.05;
      const z = -D / 2 + 0.14 + row * 0.16;
      if (x > W / 2 - 0.1) continue;
      const toy = new Mesh(new SphereGeometry(0.075, 14, 10), matte(colours[n++ % colours.length], 0.95));
      toy.position.set(x, 0.98 + (3 - row) * 0.04 + ((col * 7 + row) % 3) * 0.02, z);
      toy.scale.set(1, 0.85, 1);
      g.add(toy);
    }
  }
  // ...and a few Ryan plushies, his face peeking out of the pile, the prize everyone wants.
  if (head) {
    const face = paint(256, 256, (ctx) => ctx.drawImage(head, 67, 21, 189, 259, 40, 14, 176, 241));
    const plush = new SpriteMaterial({ map: face, color: "#d8d8d8" });
    for (const [x, y, z] of [[-0.22, 1.16, 0.05], [0.18, 1.12, -0.12], [0.05, 1.08, 0.2]] as const) {
      const ryan = new Sprite(plush);
      ryan.position.set(x, y, z);
      ryan.scale.setScalar(0.2);
      g.add(ryan);
    }
  }

  // The claw, hanging from its gantry, swaying a little as if someone's lining it up.
  const claw = new Group();
  const metal = new MeshStandardMaterial({ color: "#c9c9d4", metalness: 0.9, roughness: 0.3 });
  const cable = new Mesh(new CylinderGeometry(0.006, 0.006, 0.42, 6), metal);
  cable.position.y = -0.21;
  claw.add(cable);
  const hub = new Mesh(new CylinderGeometry(0.035, 0.045, 0.05, 12), metal);
  hub.position.y = -0.44;
  claw.add(hub);
  for (let i = 0; i < 3; i++) {
    const prong = new Mesh(new BoxGeometry(0.012, 0.13, 0.012), metal);
    const a = (i / 3) * Math.PI * 2;
    prong.position.set(Math.cos(a) * 0.04, -0.52, Math.sin(a) * 0.04);
    prong.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    claw.add(prong);
  }
  claw.position.set(0, 0.9 + caseH - 0.02, 0);
  g.add(claw);

  grounding(g, W, D, pink);
  return {
    group: g,
    update(time) {
      claw.position.x = Math.sin(time * 0.35) * 0.22;
      claw.position.z = Math.sin(time * 0.23 + 1) * 0.15;
      sign.material.opacity = Math.sin(time * 31) > 0.97 ? 0.5 : 1;
    },
  };
}

// --- the prize counter ----------------------------------------------------------------------

function prizeCounter(): Group {
  const g = new Group();
  const W = 1.5;
  const D = 0.55;
  // The counter: a glass display case on a dark base, lit inside.
  g.add(box(W, 0.45, D, matte("#24152f", 0.5), 0, 0.225, 0));
  g.add(box(W, 0.04, D, matte("#3a2a46", 0.3), 0, 1.0, 0));
  const glassMat = new MeshStandardMaterial({ color: "#a8d8ff", transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.9, depthWrite: false });
  const front = new Mesh(new PlaneGeometry(W, 0.53), glassMat);
  front.position.set(0, 0.715, D / 2);
  g.add(front);
  g.add(box(W - 0.06, 0.02, D - 0.06, lit("#ffe9f6", 0.5), 0, 0.97, 0)); // a soft light in the case, not a glare
  // Small prizes in the case: rings, sweets, little toys.
  const colours = ["#ff6fa3", "#ffd23b", "#5ee6a8", "#4fb6ff", "#b48cff", "#ff8a3d"];
  for (let i = 0; i < 14; i++) {
    const prize = new Mesh(i % 2 ? new SphereGeometry(0.04, 10, 8) : new BoxGeometry(0.07, 0.05, 0.07), matte(colours[i % colours.length], 0.6));
    prize.position.set(-W / 2 + 0.1 + (i % 7) * 0.21, 0.5 + Math.floor(i / 7) * 0.2, -0.05 + (i % 3) * 0.08);
    g.add(prize);
  }
  return g;
}

/** Shelves of bigger prizes on the wall behind the counter. */
function prizeShelves(): Group {
  const g = new Group();
  const W = 1.6;
  const wood = matte("#3a2a20", 0.7);
  const colours = ["#ff6fa3", "#ffd23b", "#5ee6a8", "#4fb6ff", "#b48cff", "#ff8a3d", "#ff4f6a"];
  [1.15, 1.5, 1.85].forEach((y, row) => {
    g.add(box(W, 0.03, 0.26, wood, 0, y, 0.13));
    for (let i = 0; i < 6; i++) {
      const c = colours[(i + row * 2) % colours.length];
      const x = -W / 2 + 0.15 + i * 0.26;
      if ((i + row) % 3 === 0) {
        // A plush bear: body, head and ears.
        const bear = new Group();
        bear.add(new Mesh(new SphereGeometry(0.075, 12, 10), matte(c, 0.95)));
        const headBall = new Mesh(new SphereGeometry(0.055, 12, 10), matte(c, 0.95));
        headBall.position.y = 0.1;
        bear.add(headBall);
        for (const ex of [-0.04, 0.04]) {
          const ear = new Mesh(new SphereGeometry(0.022, 8, 6), matte(c, 0.95));
          ear.position.set(ex, 0.15, 0);
          bear.add(ear);
        }
        bear.position.set(x, y + 0.09, 0.14);
        g.add(bear);
      } else {
        // A boxed prize with a contrasting band.
        const h = 0.12 + ((i * 3 + row) % 3) * 0.04;
        g.add(box(0.16, h, 0.14, matte(c, 0.6), x, y + 0.015 + h / 2, 0.14));
        g.add(box(0.162, 0.03, 0.142, matte("#f4f1ea", 0.6), x, y + 0.015 + h * 0.6, 0.14));
      }
    }
  });
  return g;
}

// --- the snack bar and seating: what you see first through the windows -----------------------

/** A painted sign or menu: a canvas shown lit, dimmed a touch so it doesn't bloom white. */
function screenMesh(w: number, h: number, art: CanvasTexture, power = 0.85): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: art }));
  m.material.color.setScalar(power);
  return m;
}

/** A snack counter: a popcorn machine and a soda fountain on top, a menu board and neon over it. */
function snackBar(): Group {
  const g = new Group();
  const W = 2.0;
  // The counter, its front striped like a cinema snack stand, with a lit edge.
  const stripes = paint(256, 64, (ctx) => {
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? "#f2e9dc" : "#c8202b";
      ctx.fillRect(x, 0, 32, 64);
    }
  });
  const front = new MeshStandardMaterial({ map: stripes, color: "#9a9a9a", roughness: 0.6 });
  g.add(box(W, 0.95, 0.6, front, 0, 0.475, 0));
  g.add(box(W + 0.06, 0.05, 0.66, matte("#2c2230", 0.3), 0, 0.975, 0));
  g.add(box(W, 0.03, 0.02, lit("#ffd166", 0.6), 0, 0.94, 0.31));

  // A popcorn machine: a glass box of popcorn under a red top.
  const pop = new Group();
  pop.add(box(0.42, 0.08, 0.36, matte("#c8202b", 0.4), 0, 0.04, 0));
  const glass = new MeshStandardMaterial({ color: "#fff6dc", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.6, depthWrite: false });
  const pane = new Mesh(new BoxGeometry(0.4, 0.42, 0.34), glass);
  pane.position.y = 0.29;
  pop.add(pane);
  const corn = matte("#f3d77a", 0.95);
  for (let i = 0; i < 40; i++) {
    const kernel = new Mesh(new SphereGeometry(0.022, 6, 5), corn);
    kernel.position.set(((i * 37) % 34) / 100 - 0.17, 0.1 + ((i * 13) % 12) / 100, ((i * 23) % 28) / 100 - 0.14);
    pop.add(kernel);
  }
  pop.add(box(0.42, 0.12, 0.36, matte("#c8202b", 0.4), 0, 0.56, 0));
  const popLight = new Mesh(new PlaneGeometry(0.36, 0.08), new MeshBasicMaterial({ map: neonWord("POPCORN", "#ffd166"), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  popLight.material.color.setScalar(0.6);
  popLight.position.set(0, 0.56, 0.185);
  pop.add(popLight);
  pop.position.set(-0.55, 1.0, -0.02);
  g.add(pop);

  // A soda fountain with its taps, and a stack of cups.
  g.add(box(0.5, 0.45, 0.3, matte("#20304a", 0.4), 0.5, 1.225, -0.08));
  const label = paint(200, 80, (ctx) => {
    ctx.fillStyle = "#1f5fd4";
    ctx.fillRect(0, 0, 200, 80);
    ctx.font = `bold 44px "Oswald", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("SODA", 100, 42);
  });
  const soda = screenMesh(0.4, 0.16, label, 0.7);
  soda.position.set(0.5, 1.32, 0.075);
  g.add(soda);
  for (let i = 0; i < 3; i++) g.add(box(0.03, 0.06, 0.04, matte("#bbbbc4", 0.3), 0.36 + i * 0.14, 1.1, 0.08));
  for (let i = 0; i < 4; i++) {
    const cup = new Mesh(new CylinderGeometry(0.045, 0.035, 0.1, 12), matte("#f2e9dc", 0.6));
    cup.position.set(0.88, 1.05 + i * 0.03, 0.05);
    g.add(cup);
  }

  // The menu board and the neon over the counter.
  const menu = paint(512, 256, (ctx) => {
    ctx.fillStyle = "#14101c";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 236);
    ctx.font = `bold 40px "Oswald", Impact, sans-serif`;
    ctx.textBaseline = "middle";
    const items = [["PIZZA", "$3"], ["HOT DOGS", "$2"], ["NACHOS", "$3"], ["SODA", "$1"]];
    items.forEach(([item, price], i) => {
      const y = 50 + i * 50;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f4f1ea";
      ctx.fillText(item, 40, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffd166";
      ctx.fillText(price, 472, y);
    });
  });
  const board = screenMesh(1.0, 0.5, menu, 0.6);
  board.position.set(0, 1.95, -0.25);
  g.add(board);
  const sign = glow(neonWord("SNACKS", "#ff7a3d"), 1.1, 0.31, 0.5);
  sign.position.set(0, 2.42, -0.25);
  g.add(sign);
  grounding(g, W, 0.6, "#ff7a3d");
  return g;
}

/** A café table and its stools, with somebody's food left on it. `menu` picks which food. */
function cafeTable(menu: number): Group {
  const g = new Group();
  const chrome = new MeshStandardMaterial({ color: "#cfd2dc", metalness: 0.9, roughness: 0.25 });
  // A round red-topped table on a single chrome pole.
  g.add(new Mesh(new CylinderGeometry(0.25, 0.3, 0.03, 20), chrome));
  const pole = new Mesh(new CylinderGeometry(0.035, 0.035, 0.72, 10), chrome);
  pole.position.y = 0.37;
  g.add(pole);
  const top = new Mesh(new CylinderGeometry(0.42, 0.42, 0.04, 28), matte("#c8202b", 0.35));
  top.position.y = 0.75;
  g.add(top);
  const rim = new Mesh(new TorusGeometry(0.42, 0.012, 6, 32), chrome);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.75;
  g.add(rim);
  // Stools round it, each a little turned out.
  [0.4, 2.5, 4.4].forEach((a, i) => {
    const stool = new Group();
    stool.add(new Mesh(new CylinderGeometry(0.03, 0.03, 0.45, 8), chrome));
    stool.children[0].position.y = 0.225;
    const seat = new Mesh(new CylinderGeometry(0.17, 0.17, 0.06, 18), matte(["#1f5fd4", "#f2c230", "#5ee6a8"][(i + menu) % 3], 0.4));
    seat.position.y = 0.47;
    stool.add(seat);
    stool.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    g.add(stool);
  });

  // The food: a pizza in its box, sodas with straws, popcorn, or nachos.
  const y = 0.77;
  const sodaCup = (x: number, z: number, colour: string): void => {
    const cup = new Mesh(new CylinderGeometry(0.045, 0.035, 0.13, 12), matte(colour, 0.5));
    cup.position.set(x, y + 0.065, z);
    g.add(cup);
    const straw = new Mesh(new CylinderGeometry(0.006, 0.006, 0.12, 6), matte("#f4f1ea", 0.4));
    straw.position.set(x + 0.01, y + 0.17, z);
    straw.rotation.z = 0.2;
    g.add(straw);
  };
  if (menu % 3 === 0) {
    // An open pizza box with a pizza missing two slices.
    g.add(box(0.36, 0.02, 0.36, matte("#c9a26b", 0.9), -0.05, y + 0.01, 0));
    const lid = box(0.36, 0.36, 0.02, matte("#c9a26b", 0.9), -0.05, y + 0.18, -0.18);
    lid.rotation.x = -0.3;
    g.add(lid);
    const pizza = new Mesh(new CylinderGeometry(0.15, 0.15, 0.015, 24, 1, false, 0, Math.PI * 1.55), matte("#e8b04a", 0.8));
    pizza.position.set(-0.05, y + 0.03, 0);
    g.add(pizza);
    for (let i = 0; i < 7; i++) {
      const pep = new Mesh(new CylinderGeometry(0.018, 0.018, 0.006, 10), matte("#b0262a", 0.6));
      const a = i * 0.7;
      pep.position.set(-0.05 + Math.cos(a) * 0.09, y + 0.04, Math.sin(a) * 0.09);
      g.add(pep);
    }
    sodaCup(0.22, 0.15, "#c8202b");
    sodaCup(0.25, -0.12, "#1f5fd4");
  } else if (menu % 3 === 1) {
    // A striped popcorn bucket, overflowing, and a soda.
    const bucket = new Mesh(new CylinderGeometry(0.09, 0.065, 0.2, 16), new MeshStandardMaterial({
      map: paint(64, 32, (ctx) => {
        for (let x = 0; x < 64; x += 8) {
          ctx.fillStyle = (x / 8) % 2 ? "#f2e9dc" : "#c8202b";
          ctx.fillRect(x, 0, 8, 32);
        }
      }),
      roughness: 0.7,
    }));
    bucket.position.set(-0.08, y + 0.1, 0.02);
    g.add(bucket);
    for (let i = 0; i < 12; i++) {
      const kernel = new Mesh(new SphereGeometry(0.022, 6, 5), matte("#f3d77a", 0.95));
      kernel.position.set(-0.08 + ((i * 37) % 14) / 100 - 0.07, y + 0.21 + ((i * 7) % 5) / 100, 0.02 + ((i * 23) % 14) / 100 - 0.07);
      g.add(kernel);
    }
    sodaCup(0.18, 0.05, "#5ee6a8");
  } else {
    // A basket of nachos with cheese, and two sodas.
    g.add(box(0.26, 0.05, 0.18, matte("#c8202b", 0.6), 0, y + 0.025, 0));
    for (let i = 0; i < 10; i++) {
      const chip = new Mesh(new ConeGeometry(0.035, 0.008, 3), matte("#e8b04a", 0.8));
      chip.position.set(((i * 37) % 20) / 100 - 0.1, y + 0.06 + (i % 3) * 0.008, ((i * 23) % 12) / 100 - 0.06);
      chip.rotation.set(Math.PI / 2, i, 0);
      g.add(chip);
    }
    const cheese = new Mesh(new SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), matte("#f2b51c", 0.4));
    cheese.scale.y = 0.4;
    cheese.position.set(0, y + 0.07, 0);
    g.add(cheese);
    sodaCup(-0.24, 0.1, "#f2c230");
    sodaCup(0.22, -0.1, "#c8202b");
  }

  // A warm pendant lamp hanging over the table.
  const cord = new Mesh(new CylinderGeometry(0.005, 0.005, 1.4, 6), matte("#111", 0.5));
  cord.position.y = 2.75;
  g.add(cord);
  const shade = new Mesh(new ConeGeometry(0.16, 0.14, 18, 1, true), new MeshStandardMaterial({ color: "#c8202b", roughness: 0.5, side: 2 }));
  shade.position.y = 2.0;
  g.add(shade);
  const bulb = new Mesh(new SphereGeometry(0.045, 12, 8), lit("#ffd9a8", 0.9));
  bulb.position.y = 1.95;
  g.add(bulb);
  grounding(g, 1.0, 1.0, "#ffb070");
  return g;
}

export function buildProps(scene: Scene, o: PropsOptions): Props {
  // The claw machine against the wall at the far left, past the poster.
  const claw = clawMachine(o.head);
  claw.group.position.set(o.leftX - 0.7, 0, o.wallZ + 0.55);
  scene.add(claw.group);
  const joystick = glow(neonJoystick(), 0.75, 0.75, 0.6);
  joystick.position.set(o.leftX - 0.7, 2.6, o.wallZ + 0.02);
  scene.add(joystick);

  // A café table out on the floor at the left, where the street can see it but the camera's rail can't.
  const sideTable = cafeTable(2);
  sideTable.position.set(o.leftX - 0.3, 0, o.wallZ + 2.7);
  scene.add(sideTable);

  // The prize counter at the far right, with its shelves and signs on the wall behind.
  const counter = prizeCounter();
  counter.position.set(o.rightX + 0.95, 0, o.wallZ + 0.7);
  scene.add(counter);
  const shelves = prizeShelves();
  shelves.position.set(o.rightX + 0.95, 0, o.wallZ);
  scene.add(shelves);
  const prizes = glow(neonWord("PRIZES", "#ffd166"), 1.1, 0.31, 0.4);
  prizes.position.set(o.rightX + 0.95, 1.06 + 0.17, o.wallZ + 0.7 + 0.28);
  scene.add(prizes);
  const highScore = glow(neonWord("HIGH SCORE", "#36e2ff"), 1.5, 0.42, 0.55);
  highScore.position.set(o.rightX + 2.45, 2.55, o.wallZ + 0.02);
  scene.add(highScore);

  // The snack bar and its tables, just inside the windows: seen from the street,
  // behind the camera once inside, and clear of the lane in from the door.
  const snacks = snackBar();
  snacks.position.set(-3.0, 0, o.frontZ - 1.55);
  scene.add(snacks);
  const tables = [
    [-1.75, o.frontZ - 0.95, 1],
    [2.0, o.frontZ - 1.0, 0],
    [3.75, o.frontZ - 1.45, 1],
  ].map(([x, z, menu]) => {
    const t = cafeTable(menu);
    t.position.set(x, 0, z);
    t.rotation.y = x * 0.7;
    scene.add(t);
    return t;
  });

  // None of it is a tap target: only the cabinets and Ryan's graffiti are.
  for (const root of [claw.group, joystick, sideTable, counter, shelves, prizes, highScore, snacks, ...tables]) {
    root.traverse((node) => (node.raycast = () => {}));
  }

  return (time) => {
    claw.update(time);
    highScore.material.opacity = Math.sin(time * 19) > 0.97 ? 0.45 : 1;
  };
}
