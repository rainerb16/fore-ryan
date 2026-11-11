// Everything around the jump: Christmas Eve at Canada Olympic Park. A night sky
// with stars and a moon, the Rockies far off, candy-cane distance markers, and
// falling snow. (Calgary itself is in city.ts.)

import {
  AdditiveBlending,
  PlaneGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  type Scene,
  type Vector3,
} from "three";
import { hillY, xAtDistance } from "../rules";
import { glowing } from "./glow";
import { seeded } from "./random";

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}


// --- sky ------------------------------------------------------------------------

function sky(scene: Scene): void {
  scene.background = canvasTexture(2, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#02040f");
    g.addColorStop(0.55, "#0a1534");
    g.addColorStop(1, "#1d2c5c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 512);
  });

  const rand = seeded(24);
  const n = 700;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // A dome far behind everything, upper sky only.
    const a = rand() * Math.PI - Math.PI / 2;
    const e = 0.12 + rand() * 1.2;
    pos[i * 3] = Math.sin(a) * Math.cos(e) * 1400 + 200;
    pos[i * 3 + 1] = Math.sin(e) * 900;
    pos[i * 3 + 2] = -Math.cos(a) * Math.cos(e) * 1400;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  scene.add(new Points(geometry, new PointsMaterial({ color: "#dfe6ff", size: 1.6, sizeAttenuation: false, fog: false })));

  const glow = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0, "rgba(255,250,235,1)");
    g.addColorStop(0.32, "rgba(255,250,235,0.9)");
    g.addColorStop(0.36, "rgba(200,215,255,0.25)");
    g.addColorStop(1, "rgba(200,215,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const moon = new Sprite(new SpriteMaterial({ map: glow, color: glowing("#ffffff", 1.6), fog: false, depthWrite: false }));
  moon.position.set(-250, 420, -1100);
  moon.scale.setScalar(180);
  scene.add(moon);
}

// --- the Rockies ----------------------------------------------------------------

/**
 * The Rockies, painted like a theatre backdrop far beyond the foothills: two
 * low, hazy ridgelines with moonlit snowcaps, the nearer one darker. One quad
 * instead of hundreds of triangles.
 */
function rockies(scene: Scene): void {
  const W = 2048;
  const H = 512;
  const map = canvasTexture(W, H, (ctx) => {
    const layer = (seed: number, top: number, depth: number, rock: [string, string], snow: string): void => {
      // A smooth ridgeline: layered noise, broad ranges with smaller peaks on top,
      // sampled finely so slopes curve instead of zig-zagging.
      const rand = seeded(seed);
      const lattice = Array.from({ length: 64 }, () => rand());
      const smooth = (x: number): number => {
        const i = Math.floor(x);
        const f = x - i;
        const t = f * f * (3 - 2 * f);
        return lattice[i % 64] + (lattice[(i + 1) % 64] - lattice[i % 64]) * t;
      };
      const pts: Array<[number, number]> = [];
      for (let x = 0; x <= W; x += 4) {
        const h = smooth(x / 260) * 0.55 + smooth(x / 95 + 7) * 0.3 + smooth(x / 33 + 13) * 0.15;
        pts.push([x, top + (1 - h) * depth]);
      }
      const outline = (): void => {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(W, H);
        ctx.closePath();
      };
      outline();
      const g = ctx.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, rock[0]);
      g.addColorStop(1, rock[1]);
      ctx.fillStyle = g;
      ctx.fill();
      // Snow on the upper slopes only: clip to the mountains, paint the band above the snow line.
      ctx.save();
      outline();
      ctx.clip();
      const s = ctx.createLinearGradient(0, top, 0, top + depth * 0.55);
      s.addColorStop(0, snow);
      s.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = s;
      ctx.fillRect(0, top, W, depth * 0.55);
      ctx.restore();
    };
    // Only a few degrees above the horizon, as distant ranges are: the far one
    // paler with haze, the nearer one darker.
    layer(7, 150, 105, ["#26315a", "#141b36"], "rgba(175,190,225,0.7)");
    layer(11, 200, 80, ["#19223f", "#0c1226"], "rgba(130,146,188,0.5)");
  });
  const backdrop = new Mesh(
    new PlaneGeometry(9000, 2250),
    new MeshBasicMaterial({ map, transparent: true, fog: false, depthWrite: false }),
  );
  backdrop.position.set(400, -150, -3200);
  backdrop.renderOrder = -1;
  scene.add(backdrop);
}

// --- the landing hill ---------------------------------------------------------------

/** Candy canes every 10 m down the landing hill, with the distance every 20 m. */
function candyCanes(scene: Scene): void {
  const stripes = canvasTexture(32, 128, (ctx) => {
    ctx.fillStyle = "#f6f2ee";
    ctx.fillRect(0, 0, 32, 128);
    ctx.fillStyle = "#d4142a";
    for (let y = -32; y < 160; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(32, y - 14);
      ctx.lineTo(32, y - 2);
      ctx.lineTo(0, y + 12);
      ctx.fill();
    }
  });
  stripes.wrapS = stripes.wrapT = RepeatWrapping;
  const candy = new MeshStandardMaterial({ map: stripes, roughness: 0.35 });
  const hookMap = stripes.clone();
  hookMap.repeat.set(4, 1);
  const hookMat = new MeshStandardMaterial({ map: hookMap, roughness: 0.35 });
  const stick = new CylinderGeometry(0.12, 0.12, 2.4, 16);
  const hook = new TorusGeometry(0.42, 0.12, 12, 24, Math.PI);

  for (let d = 50; d <= 180; d += 10) {
    const x = xAtDistance(d);
    const y = hillY(x);
    const cane = new Group();
    const s = new Mesh(stick, candy);
    s.position.y = 1.2;
    const h = new Mesh(hook, hookMat);
    h.position.set(-0.42, 2.4, 0);
    cane.add(s, h);
    cane.position.set(x, y, 5.4);
    scene.add(cane);

    if (d % 20 === 0) {
      const label = new Sprite(new SpriteMaterial({
        map: canvasTexture(128, 64, (ctx) => {
          ctx.font = "bold 44px Trebuchet MS, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#c8102e";
          ctx.lineWidth = 6;
          ctx.strokeText(String(d), 64, 34);
          ctx.fillText(String(d), 64, 34);
        }),
        depthWrite: false,
      }));
      label.position.set(x, y + 3.6, 5.4);
      label.scale.set(2.6, 1.3, 1);
      scene.add(label);
    }
  }
}

// --- falling snow ------------------------------------------------------------------

export interface Snowfall {
  update(around: Vector3, dt: number): void;
}

function snowfall(scene: Scene, count: number): Snowfall {
  const rand = seeded(5);
  const box = { x: 80, y: 50, z: 50 };
  const pos = new Float32Array(count * 3);
  const drift = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * box.x;
    pos[i * 3 + 1] = (rand() - 0.5) * box.y;
    pos[i * 3 + 2] = (rand() - 0.5) * box.z;
    drift[i] = rand() * Math.PI * 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  const flake = canvasTexture(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  const points = new Points(geometry, new PointsMaterial({
    map: flake, size: 0.35, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.8,
  }));
  points.frustumCulled = false;
  scene.add(points);

  let t = 0;
  return {
    update(around, dt) {
      t += dt;
      // Flakes live in a box that follows the camera, wrapping at its edges.
      for (let i = 0; i < count; i++) {
        let y = pos[i * 3 + 1] - 1.4 * dt;
        if (y < -box.y / 2) y += box.y;
        pos[i * 3 + 1] = y;
        pos[i * 3] += Math.sin(t * 0.8 + drift[i]) * 0.3 * dt;
      }
      geometry.attributes.position.needsUpdate = true;
      // The box sits wholly in front of the camera (from 5 m out): a flake right at the
      // lens would be drawn huge and, being additive, wash out the whole screen.
      points.position.set(around.x, around.y, around.z - 5 - box.z / 2);
    },
  };
}

export interface World {
  snow: Snowfall;
}

export function buildWorld(scene: Scene, lowPower: boolean): World {
  sky(scene);
  rockies(scene);
  candyCanes(scene);
  return { snow: snowfall(scene, lowPower ? 700 : 1500) };
}
