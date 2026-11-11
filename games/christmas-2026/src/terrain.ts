// The land around the jump, modelled on Canada Olympic Park: the landing hill
// cut into a hillside, rolling snowy hills beyond, and spruce woods in clumps.
// Along the track (|z| < 8) the ground is exactly the simulation's landing
// profile; away from it, it blends into noise-driven hills.

import { BufferAttribute, Color, MathUtils, Mesh, PlaneGeometry, type Scene } from "three";
import { hillY, inrunPoints, LANDING } from "../rules";
import { snowMaterial } from "./snow";
import { plantForest, type TreeSpot } from "./trees";

// --- noise ----------------------------------------------------------------------

function hash(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth value noise in about -1..1. */
function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Layered noise: broad hills with smaller rolls on top. */
const fbm = (x: number, z: number): number =>
  noise(x / 260, z / 260) * 0.6 + noise(x / 110, z / 110) * 0.28 + noise(x / 40, z / 40) * 0.12;

// --- the ground ---------------------------------------------------------------------

const TOP = inrunPoints(4)[0]; // the start gate, [x, y]
/** The hilltop the jump tower stands on sits this far below the gate. */
const TOWER_HEIGHT = 34;

/** The natural ground along the jump's line: under the inrun, then the landing hill. */
export function lineY(x: number): number {
  if (x >= 0) return hillY(Math.min(x, LANDING.end));
  // Rises from just below the lip to the hilltop under the tower, then eases off behind it.
  const t = Math.min(1, x / TOP[0]);
  const rise = t * t * (3 - 2 * t);
  const hilltop = TOP[1] - TOWER_HEIGHT;
  const beyond = Math.max(0, TOP[0] - x);
  return hillY(0) + (hilltop - hillY(0)) * rise - beyond * 0.12;
}

/** Half-width of the flat, groomed strip either side of the track. */
const CORRIDOR = 24;
/**
 * How far the ground sits below the landing surface in that strip. The ground
 * mesh is coarse (~13 m between points), and between points it cuts corners;
 * this margin keeps it from ever rising through the landing hill Ryan lands on.
 */
const SINK = 1.2;

/** Ground height anywhere: the jump's line near the track, rolling hills away from it. */
export function groundY(x: number, z: number): number {
  const along = lineY(Math.max(-500, Math.min(x, LANDING.end + 200)));
  const away = Math.abs(z);
  const core = along - SINK;
  if (away <= CORRIDOR) return core;

  const w = Math.max(0, 1 - (away - CORRIDOR) / 80);
  const blend = w * w * (3 - 2 * w);
  // Hills grow with distance from the track, so the land beside the jump stays
  // near its level. Behind the track it rolls into hills; on the camera's side
  // it only falls gently away, so nothing rises between the camera and Ryan.
  const grow = Math.min(1, (away - CORRIDOR) / 220);
  const hills = z < 0
    ? core - 3 + fbm(x, z) * (6 + 60 * grow) + grow * 25
    : core - (away - CORRIDOR) * 0.25 + fbm(x, z) * 4 * grow;
  return core * blend + hills * (1 - blend);
}

const GROUND = { width: 2600, depth: 1500 };

function ground(lowPower: boolean): Mesh {
  // Fine enough that slopes read as smooth drifts rather than facets.
  const segs = lowPower ? [140, 90] : [320, 190];
  const geometry = new PlaneGeometry(GROUND.width, GROUND.depth, segs[0], segs[1]);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(350, 0, -620);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const snow = new Color("#e6edfb");
  const shade = new Color("#b9c6e3");
  const scrub = new Color("#5d6a80");
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundY(x, z);
    pos.setY(i, y);
    // Wind-scoured slopes and woodland floor show through the snow in patches.
    const patch = noise(x / 55 + 9, z / 55 - 3);
    const nearTrack = Math.abs(z) < 14 && x > -140 && x < LANDING.end + 60;
    c.copy(snow).lerp(shade, 0.5 + 0.5 * noise(x / 18, z / 18));
    if (!nearTrack && patch > 0.35) c.lerp(scrub, Math.min(1, (patch - 0.35) * 2.2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = snowMaterial({ color: "#ffffff", vertexColors: true, tile: 4 }, [GROUND.width, GROUND.depth]);
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Half-width of the landing hill's flat, groomed top. */
const HILL_HALF_WIDTH = 8;
/** Across the hill (metres from the centre line): the flat top, then rounded shoulders down into the snow. */
const ACROSS = [-15, -13, -11.5, -10.2, -9.2, -8.5, -8, -6, -3, 0, 3, 6, 8, 8.5, 9.2, 10.2, 11.5, 13, 15];

/** How far below the groomed top the hill's shoulder is, this far from the centre line. */
function shoulder(z: number): number {
  const t = MathUtils.clamp((Math.abs(z) - HILL_HALF_WIDTH) / 7, 0, 1);
  return -3 * t * t * (3 - 2 * t);
}

/**
 * The groomed landing hill itself: its top is the exact profile the simulation
 * lands on, so Ryan touches down on the surface you see, and its sides round
 * off into the surrounding snow rather than ending in a wall.
 */
function landingHill(): Mesh {
  const along: number[] = [];
  for (let x = -14; x <= LANDING.end + 120; x += 1.5) along.push(x);
  // Under the take-off table the hill's top end slopes away into the ground,
  // rather than ending in a block.
  const topAt = (x: number): number =>
    x >= 0
      ? hillY(Math.min(x, LANDING.end))
      : MathUtils.lerp(hillY(0), lineY(x) - SINK - 0.6, MathUtils.smoothstep(-x, 0, 12));
  const geometry = new PlaneGeometry(1, 1, along.length - 1, ACROSS.length - 1);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  // PlaneGeometry's rows run top to bottom; laying row r at ACROSS[r] keeps its faces pointing up.
  for (let r = 0; r < ACROSS.length; r++) {
    for (let c = 0; c < along.length; c++) {
      const i = r * along.length + c;
      const x = along[c];
      const z = ACROSS[r];
      pos.setXYZ(i, x, topAt(x) + shoulder(z), z);
      uv.setXY(i, x, z); // metres: u down the hill, v across, so grooming runs down the fall line
    }
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const hill = new Mesh(geometry, snowMaterial({ color: "#eef3ff", tile: 6, groomed: true }));
  hill.receiveShadow = true;
  return hill;
}

// --- woods ----------------------------------------------------------------------------

/** Spruce woods in clumps, kept clear of the jump. */
function forest(scene: Scene, lowPower: boolean): void {
  const wanted = lowPower ? 450 : 1100;
  const near: TreeSpot[] = [];
  const far: TreeSpot[] = [];
  for (let i = 0, placed = 0; placed < wanted && i < wanted * 12; i++) {
    const x = -450 + hash(i, 1) * 1700;
    const z = 20 - hash(i, 2) * 820;
    // Keep the jump clear: the track, the inrun corridor, and the run-out.
    if (Math.abs(z) < 16 && x > -160 && x < LANDING.end + 80) continue;
    // Woods grow in clumps: only where the clump noise is high.
    if (noise(x / 70 - 4, z / 70 + 2) < 0.1 + hash(i, 3) * 0.25) continue;
    const spot = { x, y: groundY(x, z), z, height: 9 + hash(i, 4) * 10 };
    // Full detail where the camera passes close; the far woods only need the shape.
    const close = z > -170 && x > -230 && x < LANDING.end + 160;
    (close ? near : far).push(spot);
    placed++;
  }
  plantForest(scene, near, far, lowPower);
}

export function buildTerrain(scene: Scene, lowPower: boolean): void {
  scene.add(ground(lowPower), landingHill());
  forest(scene, lowPower);
}
