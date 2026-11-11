// Everything around the jump: Christmas Eve at Canada Olympic Park. A night sky
// with stars and a moon, the Rockies, downtown Calgary with the Calgary Tower
// lit up like a Christmas tree, pines, falling snow, inrun lamps, and candy-cane
// distance markers. Low-poly and few draw calls, so phones keep up.

import {
  AdditiveBlending,
  PlaneGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
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
  SRGBColorSpace,
  TorusGeometry,
  BoxGeometry,
  type Scene,
  type Vector3,
} from "three";
import { hillY, xAtDistance } from "../rules";

/** Seeded, so the skyline and forest are the same every visit. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
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
  const moon = new Sprite(new SpriteMaterial({ map: glow, fog: false, depthWrite: false }));
  moon.position.set(-250, 420, -1100);
  moon.scale.setScalar(180);
  scene.add(moon);
}

// --- the Rockies ----------------------------------------------------------------

/**
 * The Rockies, painted like a theatre backdrop: two ridgelines with moonlit
 * snowcaps, the nearer one darker. Far enough away that a flat backdrop reads
 * as mountains, and one quad instead of hundreds of triangles.
 */
function rockies(scene: Scene): void {
  const W = 2048;
  const H = 512;
  const map = canvasTexture(W, H, (ctx) => {
    const layer = (seed: number, top: number, depth: number, rock: [string, string], snow: string): void => {
      const rand = seeded(seed);
      const pts: Array<[number, number]> = [];
      let h = 0.5;
      for (let x = 0; x <= W + 60; x += 30 + rand() * 50) {
        h = Math.min(1, Math.max(0.15, h + (rand() - 0.5) * 0.6));
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
    layer(7, 70, 230, ["#1a2446", "#0b1124"], "rgba(150,166,205,0.85)");
    layer(11, 180, 190, ["#121a36", "#070b18"], "rgba(118,134,176,0.7)");
  });
  const backdrop = new Mesh(
    new PlaneGeometry(9000, 2250),
    new MeshBasicMaterial({ map, transparent: true, fog: false, depthWrite: false }),
  );
  backdrop.position.set(400, -150, -2600);
  backdrop.renderOrder = -1;
  scene.add(backdrop);
}

// --- downtown Calgary ---------------------------------------------------------------

function windows(rand: () => number): CanvasTexture {
  const texture = canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 2; y < 128; y += 8) {
      for (let x = 2; x < 64; x += 8) {
        if (rand() < 0.32) {
          ctx.fillStyle = rand() < 0.8 ? "#ffd89a" : "#bcd6ff";
          ctx.fillRect(x, y, 4, 5);
        }
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

export interface Twinkle {
  update(time: number): void;
}

function skyline(scene: Scene): Twinkle {
  const rand = seeded(403);
  const city = new Group();
  const lit = windows(rand);
  const concrete = new Color("#1b2236");
  for (let i = 0; i < 34; i++) {
    const w = 14 + rand() * 18;
    const d = 14 + rand() * 14;
    const h = 40 + Math.pow(rand(), 1.6) * 150;
    const map = lit.clone();
    map.repeat.set(w / 32, h / 64); // windows about 4 m wide, floors about 4 m apart
    map.offset.set(rand(), rand());
    const tower = new Mesh(
      new BoxGeometry(w, h, d),
      new MeshStandardMaterial({ color: concrete, roughness: 0.9, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.55, fog: false }),
    );
    tower.position.set(260 + i * 13 + rand() * 10, -230 + h / 2, -520 - rand() * 120);
    city.add(tower);
  }
  scene.add(city);
  return calgaryTower(scene, 430, -230, -480);
}

/** The Calgary Tower, dressed as a Christmas tree: a cone of lights, a red-lit pod, and a star. */
function calgaryTower(scene: Scene, x: number, base: number, z: number): Twinkle {
  const tower = new Group();
  const shaftH = 150;
  const concrete = new MeshStandardMaterial({ color: "#3a4256", roughness: 0.9, fog: false });
  const shaft = new Mesh(new CylinderGeometry(5, 9, shaftH, 16), concrete);
  shaft.position.y = shaftH / 2;
  const pod = new Mesh(new CylinderGeometry(15, 12, 14, 24), concrete);
  pod.position.y = shaftH + 7;
  const band = new Mesh(new CylinderGeometry(15.4, 15.4, 3, 24, 1, true), new MeshBasicMaterial({ color: "#ff2a3c", fog: false }));
  band.position.y = shaftH + 7;
  const crown = new Mesh(new CylinderGeometry(6, 13, 8, 24), concrete);
  crown.position.y = shaftH + 18;
  tower.add(shaft, pod, band, crown);

  // A spiral of lights round the tower, widening to the base like a tree.
  const count = 260;
  const bulbs = new InstancedMesh(new SphereGeometry(1.5, 6, 4), new MeshBasicMaterial({ fog: false }), count);
  const palette = ["#ff3b3b", "#3bff7a", "#ffd23b", "#3bb4ff", "#ff8cf0"].map((c) => new Color(c));
  const base_ = new Array<Color>(count);
  const dummy = new Object3D();
  for (let i = 0; i < count; i++) {
    const t = i / count; // 0 at the top, 1 at the base
    const angle = t * Math.PI * 2 * 11;
    const radius = 12 + t * 46;
    dummy.position.set(Math.cos(angle) * radius, shaftH + 2 - t * (shaftH + 2), Math.sin(angle) * radius);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    base_[i] = palette[i % palette.length];
    bulbs.setColorAt(i, base_[i]);
  }
  tower.add(bulbs);

  const star = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.5 : 11;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starMesh = new Mesh(new ShapeGeometry(star), new MeshBasicMaterial({ color: "#ffe066", fog: false }));
  starMesh.position.y = shaftH + 36;
  tower.add(starMesh);

  tower.position.set(x, base, z);
  scene.add(tower);

  const c = new Color();
  let lastTick = -1;
  return {
    update(time) {
      // A few times a second is plenty for a twinkle, and cheaper than every frame.
      const tick = Math.floor(time * 6);
      if (tick === lastTick) return;
      lastTick = tick;
      for (let i = 0; i < count; i++) {
        const on = Math.sin(tick * 0.9 + i * 1.7) > -0.4;
        bulbs.setColorAt(i, c.copy(base_[i]).multiplyScalar(on ? 1 : 0.25));
      }
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    },
  };
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
  const stick = new CylinderGeometry(0.12, 0.12, 2.4, 10);
  const hook = new TorusGeometry(0.42, 0.12, 8, 16, Math.PI);

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
  tower: Twinkle;
}

export function buildWorld(scene: Scene, lowPower: boolean): World {
  sky(scene);
  rockies(scene);
  const tower = skyline(scene);
  candyCanes(scene);
  return { snow: snowfall(scene, lowPower ? 700 : 1500), tower };
}
