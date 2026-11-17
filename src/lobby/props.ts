// The rest of the arcade floor, filling the room's empty ends so it reads as a
// real arcade through the shop windows: a claw machine full of plush toys (and
// a few Ryan plushies) at the far left, a pinball machine out on the floor, a
// prize counter at the far right, and neon art on the wall. All kept clear of
// the cabinet row and of the camera's path in from the door.

import {
  AdditiveBlending,
  BoxGeometry,
  type CanvasTexture,
  Color,
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

// --- the pinball machine ------------------------------------------------------------------

function pinball(): { group: Group; update: (time: number) => void } {
  const g = new Group();
  const W = 0.72;
  const L = 1.35;
  const body = matte("#1d1830", 0.4);
  const chrome = new MeshStandardMaterial({ color: "#cfd2dc", metalness: 0.95, roughness: 0.2 });
  // Legs, the cabinet, and the playfield tilted up towards the back.
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-L / 2 + 0.06, L / 2 - 0.06]) g.add(box(0.05, 0.75, 0.05, chrome, x, 0.375, z));
  const table = new Group();
  table.position.y = 0.88;
  table.rotation.x = -0.12; // higher at the back
  table.add(box(W, 0.26, L, body, 0, 0, 0));
  // The playfield art, bright and busy, with bumpers and lights.
  const field = paint(256, 480, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 480);
    sky.addColorStop(0, "#3a1670");
    sky.addColorStop(1, "#0f2a5c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 480);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = ["#ff4fb8", "#ffd23b", "#36e2ff", "#5ee6a8"][i % 4];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc((i * 97) % 256, (i * 53) % 400 + 20, 4 + (i % 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffd23b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(30, 400);
    ctx.lineTo(110, 450);
    ctx.moveTo(226, 400);
    ctx.lineTo(146, 450);
    ctx.stroke();
  });
  const playfield = new Mesh(new PlaneGeometry(W - 0.08, L - 0.08), new MeshBasicMaterial({ map: field, color: "#a0a0a0" }));
  playfield.rotation.x = -Math.PI / 2;
  playfield.position.y = 0.131;
  table.add(playfield);
  const lights: MeshBasicMaterial[] = [];
  for (const [x, z, c] of [[-0.15, -0.35, "#ff4fb8"], [0.12, -0.42, "#36e2ff"], [0, -0.2, "#ffd23b"]] as const) {
    const bumper = new Mesh(new CylinderGeometry(0.06, 0.06, 0.07, 16), lit(c, 1.2));
    bumper.position.set(x, 0.17, z);
    table.add(bumper);
    lights.push(bumper.material as MeshBasicMaterial);
  }
  const ball = new Mesh(new SphereGeometry(0.022, 12, 8), chrome);
  ball.position.set(0.1, 0.16, 0.25);
  table.add(ball);
  // Glass over the playfield.
  const glassTop = new Mesh(new PlaneGeometry(W - 0.04, L - 0.04), new MeshStandardMaterial({ color: "#000", transparent: true, opacity: 0.15, metalness: 1, roughness: 0.05, depthWrite: false }));
  glassTop.rotation.x = -Math.PI / 2;
  glassTop.position.y = 0.15;
  table.add(glassTop);
  g.add(table);

  // The backbox at the far end, its screen flashing RYAN.
  const backbox = box(W, 0.62, 0.16, body, 0, 1.36, -L / 2 - 0.02);
  g.add(backbox);
  const screen = paint(256, 200, (ctx) => {
    ctx.fillStyle = "#14062a";
    ctx.fillRect(0, 0, 256, 200);
    ctx.font = `bold 88px "Oswald", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd23b";
    ctx.shadowColor = "#ff4fb8";
    ctx.shadowBlur = 20;
    ctx.fillText("RYAN", 128, 86);
    ctx.font = `bold 26px "Courier New", monospace`;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#36e2ff";
    ctx.fillText("EXTRA BALL", 128, 158);
  });
  const backglass = new Mesh(new PlaneGeometry(W - 0.1, 0.5), new MeshBasicMaterial({ map: screen }));
  backglass.position.set(0, 1.36, -L / 2 + 0.065);
  g.add(backglass);
  const flash = backglass.material;

  grounding(g, W, L, "#7a4dff");
  return {
    group: g,
    update(time) {
      lights.forEach((m, i) => m.color.setScalar(Math.sin(time * 5 + i * 2) > 0 ? 1.4 : 0.35));
      flash.color.setScalar(Math.sin(time * 3) > -0.6 ? 1 : 0.55);
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

export function buildProps(scene: Scene, o: PropsOptions): Props {
  // The claw machine against the wall at the far left, past the poster.
  const claw = clawMachine(o.head);
  claw.group.position.set(o.leftX - 0.7, 0, o.wallZ + 0.55);
  scene.add(claw.group);
  const joystick = glow(neonJoystick(), 0.75, 0.75, 0.6);
  joystick.position.set(o.leftX - 0.7, 2.6, o.wallZ + 0.02);
  scene.add(joystick);

  // The pinball machine out on the floor at the front left, turned towards the
  // room, where the street can see it but the camera's rail can't.
  const table = pinball();
  table.group.position.set(o.leftX - 0.3, 0, o.wallZ + 2.9);
  table.group.rotation.y = 0.5;
  scene.add(table.group);

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

  // None of it is a tap target: only the cabinets and Ryan's graffiti are.
  for (const root of [claw.group, joystick, table.group, counter, shelves, prizes, highScore]) {
    root.traverse((node) => (node.raycast = () => {}));
  }

  return (time) => {
    claw.update(time);
    table.update(time);
    highScore.material.opacity = Math.sin(time * 19) > 0.97 ? 0.45 : 1;
  };
}
