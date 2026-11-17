// Calgary at night, as seen from Canada Olympic Park: rolling hills of
// neighbourhoods spread with house and street lights, and further off,
// downtown's towers with the landmarks people know (The Bow's crescent,
// Brookfield Place, Suncor's twin peaks, TELUS Sky's twist, Bankers Hall's
// crowns, and the Calgary Tower dressed as a Christmas tree), under the glow
// the city throws up into the sky.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  type CanvasTexture,
  type Scene,
} from "three";
import { glowing } from "./glow";
import { seeded } from "./random";
import { groundY } from "./terrain";
import { canvasTexture } from "./world";

/** Downtown's centre, across the valley to the right of the jump. */
const DOWNTOWN = { x: 900, z: -1650 };

// --- neighbourhoods ----------------------------------------------------------------

/**
 * Suburbs on the hills between the park and downtown: patches of streets on a
 * grid, each turned its own way, dotted with warm windows and orange streetlights.
 */
function neighbourhoods(scene: Scene, lowPower: boolean): void {
  const rand = seeded(812);
  const pts: number[] = [];
  const cols: number[] = [];
  const warm = new Color("#ffcf8a");
  const sodium = new Color("#ff9a3c");
  const cool = new Color("#cfe0ff");
  const patches = lowPower ? 9 : 16;
  for (let p = 0; p < patches; p++) {
    const cx = -250 + rand() * 1700;
    const cz = -420 - rand() * 1150;
    // Keep downtown itself clear for its towers.
    if (Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z) < 300) continue;
    const size = 220 + rand() * 260;
    const turn = rand() * Math.PI;
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    for (let u = -size / 2; u <= size / 2; u += 40) {
      for (let v = -size / 2; v <= size / 2; v += 14) {
        for (const [a, b] of [[u, v], [v, u]]) {
          if (rand() > 0.8) continue;
          // Softer edges: fewer houses towards the patch's rim.
          if (Math.hypot(a, b) > (size / 2) * (0.7 + rand() * 0.4)) continue;
          const x = cx + a * c - b * s;
          const z = cz + a * s + b * c;
          pts.push(x, groundY(x, z) + 3, z);
          const kind = rand();
          const color = kind < 0.18 ? sodium : kind < 0.9 ? warm : cool;
          const dim = 0.55 + rand() * 0.45;
          cols.push(color.r * dim, color.g * dim, color.b * dim);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(cols), 3));
  const dot = canvasTexture(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  const lights = new Points(
    geometry,
    new PointsMaterial({
      map: dot,
      size: 3.6,
      vertexColors: true,
      color: glowing("#ffffff", 1.8),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    }),
  );
  scene.add(lights);
}

// --- downtown -------------------------------------------------------------------------

/** Lit office windows: mostly warm, some cool, many dark, on a dark glass curtain wall. */
function windowTexture(seed: number, litShare: number): CanvasTexture {
  const rand = seeded(seed);
  const texture = canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 2; y < 128; y += 6) {
      // Whole floors tend to be on or off together.
      const floor = rand() < 0.7 ? litShare : litShare * 0.25;
      for (let x = 1; x < 64; x += 4) {
        if (rand() < floor) {
          ctx.fillStyle = rand() < 0.75 ? "#ffd89a" : "#cfe0ff";
          ctx.fillRect(x, y, 3, 4);
        }
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8; // keeps the window rows crisp on faces seen at an angle
  return texture;
}

const glass = new Color("#141a2b");

function tower(geometry: BufferGeometry, windows: CanvasTexture, repeat: [number, number], intensity = 0.85): Mesh {
  const map = windows.clone();
  map.repeat.set(...repeat);
  map.needsUpdate = true;
  return new Mesh(
    geometry,
    new MeshStandardMaterial({ color: glass, roughness: 0.4, metalness: 0.3, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: intensity, fog: false }),
  );
}

/** Windows about 2 m wide and 3 m floor to floor, on a face of this size. */
const grid = (w: number, h: number): [number, number] => [w / 32, h / 64];

/** The Bow: a 47-storey crescent, its curved glass face lit white. */
function theBow(windows: CanvasTexture): Mesh {
  const shape = new Shape();
  const [outer, inner, span] = [62, 40, (100 * Math.PI) / 180];
  shape.absarc(0, 0, outer, -span / 2, span / 2, false);
  shape.absarc(0, 0, inner, span / 2, -span / 2, true);
  const height = 190;
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 });
  geometry.rotateX(-Math.PI / 2); // extrude upwards
  geometry.translate(-50, 0, 0);
  const bow = tower(geometry, windows, [0.05, 0.03], 1);
  bow.rotation.y = -Math.PI / 2 - 0.3; // the hollow of the crescent towards the park
  return bow;
}

/** A box tower, its roof optionally sloped down to one side (Brookfield Place). */
function slab(w: number, h: number, d: number, windows: CanvasTexture, slope = 0): Mesh {
  const geometry = new BoxGeometry(w, h, d);
  if (slope) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0 && pos.getX(i) < 0) pos.setY(i, pos.getY(i) - slope);
    }
    geometry.computeVertexNormals();
  }
  geometry.translate(0, h / 2, 0);
  return tower(geometry, windows, grid(w, h));
}

/** TELUS Sky: a box whose upper floors twist as they rise. */
function telusSky(windows: CanvasTexture): Mesh {
  const [w, h] = [30, 178];
  const geometry = new BoxGeometry(w, h, w, 1, 30, 1);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, (pos.getY(i) + h / 2) / h - 0.6) / 0.4; // 0 below 60% height, 1 at the top
    const a = t * 0.5;
    const [x, z] = [pos.getX(i), pos.getZ(i)];
    pos.setX(i, x * Math.cos(a) - z * Math.sin(a));
    pos.setZ(i, x * Math.sin(a) + z * Math.cos(a));
  }
  geometry.computeVertexNormals();
  geometry.translate(0, h / 2, 0);
  return tower(geometry, windows, grid(w, h));
}

/** A tower with a pyramid roof (Suncor's peaks) or a gold crown (Bankers Hall). */
function peaked(w: number, h: number, windows: CanvasTexture, roof: number, crown: boolean): Group {
  const g = new Group();
  g.add(slab(w, h, w, windows));
  const top = new Mesh(
    new ConeGeometry(w * 0.72, roof, 4).rotateY(Math.PI / 4),
    crown
      ? new MeshBasicMaterial({ color: glowing("#ffc96a", 1.6), fog: false })
      : new MeshStandardMaterial({ color: glass, emissive: "#9fb6ff", emissiveIntensity: 0.25, roughness: 0.4, fog: false }),
  );
  top.position.y = h + roof / 2;
  g.add(top);
  return g;
}

/** Where the Calgary Tower stands in downtown: south of the core, nearer the park, so nothing hides it. */
const TOWER_AT = { x: 230, z: 200 };

/**
 * The Calgary Tower: a slender concrete shaft flaring at its foot, the wide
 * round observation pod with its curved underside and band of windows, a
 * stepped roof, and the spire with its torch. For Christmas the shaft is uplit
 * red and green and strings of bulbs hang from under the pod to a wide ring at
 * its foot, a tree of lights with the tower showing through, and a star on top.
 */
function calgaryTower(): { group: Group; update(time: number): void } {
  const tower = new Group();
  const SHAFT = 152;
  const POD = { bottom: SHAFT, rim: 18, band: [163, 171] as const };

  // Uplighting: alternating red and green bands round the shaft, brightest at the foot.
  const uplight = canvasTexture(64, 128, (ctx) => {
    for (let b = 0; b < 8; b++) {
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      const [r, gr, bl] = b % 2 ? [255, 48, 64] : [48, 255, 112];
      g.addColorStop(0, `rgba(${r},${gr},${bl},0.35)`);
      g.addColorStop(1, `rgba(${r},${gr},${bl},0.95)`);
      ctx.fillStyle = g;
      ctx.fillRect(b * 8, 0, 8, 128);
    }
  });
  const concrete = (emissive?: CanvasTexture, intensity = 1): MeshStandardMaterial =>
    new MeshStandardMaterial({
      color: "#cfc6b8",
      roughness: 0.8,
      emissive: emissive ? "#ffffff" : "#000000",
      emissiveMap: emissive ?? null,
      emissiveIntensity: intensity,
      fog: false,
    });

  // The shaft, in even height steps so the uplight fades evenly up it.
  const shaftProfile: Vector2[] = [];
  for (let k = 0; k <= 24; k++) {
    const y = (SHAFT * k) / 24;
    shaftProfile.push(new Vector2(7 + 4.5 * Math.exp(-y / 12), y));
  }
  tower.add(new Mesh(new LatheGeometry(shaftProfile, 48), concrete(uplight, 0.9)));

  // The pod's curved underside, flaring from the shaft out to the rim.
  const underside: Vector2[] = [];
  for (let a = 0; a <= 10; a++) {
    const t = (a / 10) * (Math.PI / 2);
    underside.push(new Vector2(7 + (POD.rim - 7) * Math.sin(t), POD.bottom + (POD.band[0] - POD.bottom) * (1 - Math.cos(t))));
  }
  tower.add(new Mesh(new LatheGeometry(underside, 48), concrete()));

  // The observation deck's band of windows, lit warm.
  const windows = canvasTexture(256, 32, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 256, 32);
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = (x / 8) % 5 === 0 ? "#b8d4ff" : "#ffd9a0";
      ctx.fillRect(x + 1, 6, 6, 20);
    }
  });
  windows.wrapS = RepeatWrapping;
  windows.repeat.set(3, 1);
  const bandH = POD.band[1] - POD.band[0];
  const band = new Mesh(
    new CylinderGeometry(POD.rim, POD.rim, bandH, 48, 1, true),
    new MeshStandardMaterial({ color: glass, emissive: "#ffffff", emissiveMap: windows, emissiveIntensity: 1.6, roughness: 0.3, fog: false }),
  );
  band.position.y = POD.band[0] + bandH / 2;
  tower.add(band);

  // The stepped roof, then the spire and torch.
  const roof = [
    new Vector2(POD.rim, POD.band[1]),
    new Vector2(POD.rim - 1.5, POD.band[1] + 1.5),
    new Vector2(12, POD.band[1] + 2),
    new Vector2(12, POD.band[1] + 7),
    new Vector2(8, POD.band[1] + 8),
    new Vector2(3, POD.band[1] + 9),
  ];
  tower.add(new Mesh(new LatheGeometry(roof, 48), concrete()));
  const spire = new Mesh(new CylinderGeometry(1.4, 2.4, 12, 16), concrete());
  spire.position.y = POD.band[1] + 15;
  const torch = new Mesh(new CylinderGeometry(3.2, 1.8, 2.5, 16), new MeshBasicMaterial({ color: glowing("#ff8a3c", 2.2), fog: false }));
  torch.position.y = POD.band[1] + 22;
  tower.add(spire, torch);

  // Strings of bulbs from just under the pod to a wide ring at the foot.
  const strands = 20;
  const perStrand = 18;
  const count = strands * perStrand;
  const bulbs = new InstancedMesh(new SphereGeometry(1.3, 10, 8), new MeshBasicMaterial({ fog: false }), count);
  const palette = ["#ff3b3b", "#3bff7a", "#ffd23b", "#3bb4ff", "#3bff7a"].map((c) => glowing(c, 3));
  const base = new Array<Color>(count);
  const dummy = new Object3D();
  for (let s = 0; s < strands; s++) {
    const angle = (s / strands) * Math.PI * 2;
    for (let k = 0; k < perStrand; k++) {
      const t = (k + 0.5) / perStrand; // 0 at the top, 1 at the foot
      const radius = POD.rim + 2 + t * 32;
      // A slight sag between the top and the foot.
      const y = (POD.bottom + 4) * (1 - t) - Math.sin(t * Math.PI) * 6;
      dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      dummy.updateMatrix();
      const i = s * perStrand + k;
      bulbs.setMatrixAt(i, dummy.matrix);
      base[i] = palette[(s + k) % palette.length];
      bulbs.setColorAt(i, base[i]);
    }
  }
  tower.add(bulbs);

  const star = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4 : 10;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starMesh = new Mesh(new ShapeGeometry(star), new MeshBasicMaterial({ color: glowing("#ffe066", 3), fog: false }));
  starMesh.position.y = POD.band[1] + 34;
  tower.add(starMesh);

  const c = new Color();
  let lastTick = -1;
  return {
    group: tower,
    update(time) {
      // A few times a second is plenty for a twinkle, and cheaper than every frame.
      const tick = Math.floor(time * 6);
      if (tick === lastTick) return;
      lastTick = tick;
      for (let i = 0; i < count; i++) {
        const on = Math.sin(tick * 0.9 + i * 1.7) > -0.4;
        bulbs.setColorAt(i, c.copy(base[i]).multiplyScalar(on ? 1 : 0.25));
      }
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    },
  };
}

export interface Twinkle {
  update(time: number): void;
}

/** Downtown: the landmarks in among a few dozen ordinary office towers. */
function downtown(scene: Scene): Twinkle {
  const rand = seeded(403);
  const city = new Group();
  const base = groundY(DOWNTOWN.x, DOWNTOWN.z);
  city.position.set(DOWNTOWN.x, base - 4, DOWNTOWN.z);
  // Late on Christmas Eve: most offices dark, The Bow's face lit.
  const offices = windowTexture(5, 0.22);
  const bowGlass = windowTexture(9, 0.6);

  const place = (o: Object3D, x: number, z: number, turn = 0): void => {
    o.position.set(x, 0, z);
    o.rotation.y += turn;
    city.add(o);
  };
  // Landmarks, roughly where they stand relative to each other (metres, x east, z south).
  place(theBow(bowGlass), 40, -60);
  place(slab(45, 198, 30, offices, 16), -40, -10, 0.1); // Brookfield Place
  place(peaked(34, 172, offices, 28, false), 90, 30); // Suncor Energy Centre, west tower
  place(peaked(28, 104, offices, 20, false), 125, 45); // Suncor, east tower
  place(telusSky(offices), -10, 70, 0.2);
  place(peaked(30, 158, offices, 14, true), -110, 20); // Bankers Hall, east
  place(peaked(30, 158, offices, 14, true), -150, 45); // Bankers Hall, west
  const calgary = calgaryTower();
  // A touch larger than life, so it stands out over its neighbours from the park.
  calgary.group.scale.setScalar(1.15);
  place(calgary.group, TOWER_AT.x, TOWER_AT.z);

  // Ordinary office towers filling out the core, shorter towards its edges.
  for (let i = 0; i < 38; i++) {
    const a = rand() * Math.PI * 2;
    const r = 60 + Math.sqrt(rand()) * 260;
    const x = Math.cos(a) * r * 1.3;
    const z = Math.sin(a) * r * 0.7;
    // Leave the Calgary Tower standing clear.
    if (Math.hypot(x - TOWER_AT.x, z - TOWER_AT.z) < 75) continue;
    const edge = 1 - r / 340;
    // Well under the landmarks, so their shapes stand out on the skyline.
    const h = 25 + Math.pow(rand(), 1.6) * 105 * edge;
    const w = 14 + rand() * 16;
    const d = 14 + rand() * 14;
    place(slab(w, h, d, offices), x, z, (rand() - 0.5) * 0.3);
  }
  scene.add(city);
  return calgary;
}

/** The orange haze a city throws up into the night sky. */
function cityGlow(scene: Scene): void {
  const haze = canvasTexture(128, 64, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(255,190,120,0.5)");
    g.addColorStop(0.5, "rgba(255,170,110,0.15)");
    g.addColorStop(1, "rgba(255,170,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 64);
  });
  const sprite = new Sprite(new SpriteMaterial({ map: haze, blending: AdditiveBlending, depthWrite: false, fog: false, opacity: 0.22 }));
  sprite.position.set(DOWNTOWN.x, groundY(DOWNTOWN.x, DOWNTOWN.z) + 40, DOWNTOWN.z - 40);
  sprite.scale.set(1800, 420, 1);
  sprite.renderOrder = -1;
  scene.add(sprite);
}

export function buildCity(scene: Scene, lowPower: boolean): Twinkle {
  cityGlow(scene);
  neighbourhoods(scene, lowPower);
  return downtown(scene);
}
