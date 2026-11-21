// Fireworks over Calgary, for a jump past the Christmas line. Each shell is a
// cloud of glowing points: a trail as it climbs, then a burst that drifts down
// and fades. Shells go off in the upper part of whatever the camera is looking
// at, and draw over the hill like the sky would, so the show is always in view.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
  PointsMaterial,
  type Scene,
  type Texture,
  Vector3,
} from "three";

/** Christmas colours, and gold and silver. */
const COLOURS = ["#ff3346", "#3dff86", "#ffd166", "#ffffff", "#ff6fd8", "#8fd3ff"];
const GRAVITY = 6;
const CLIMB_FOR = 0.9;
const FADE_FOR = 2.2;

interface Shell {
  points: Points;
  material: PointsMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  /** Seconds since launch; bursts at CLIMB_FOR. */
  age: number;
  from: Vector3;
  to: Vector3;
  burst: boolean;
  /** 0 near to 1 far, for how loud it sounds. */
  far: number;
}

/** A soft round dot, so points are sparks rather than squares. */
function spark(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(canvas);
}

export interface Fireworks {
  /** Starts a show lasting `seconds`; `onBurst` hears each shell go off, 0 near to 1 far. */
  start(seconds: number, onBurst?: (far: number) => void): void;
  /** Ends the show and clears the sky. */
  stop(): void;
  /** Whether a show is on, or shells from one are still in the sky. */
  active(): boolean;
  /** Steps the show; the camera's position and axes (`up` is the screen's up) decide where new shells go. */
  update(dt: number, eye: Vector3, forward: Vector3, right: Vector3, up: Vector3): void;
}

export function buildFireworks(scene: Scene, lowPower: boolean): Fireworks {
  const perShell = lowPower ? 90 : 160;
  const texture = spark();
  const shells: Shell[] = [];
  let left = 0;
  let nextIn = 0;
  let onBurst: ((far: number) => void) | undefined;
  const trail = new Vector3();

  function launch(eye: Vector3, forward: Vector3, right: Vector3, up: Vector3): void {
    const far = Math.random();
    const distance = 120 + far * 60;
    // Half the view's height at that distance (50° field of view); kept to the
    // upper half, and narrow enough to stay on a portrait phone.
    const half = distance * 0.466;
    const to = eye
      .clone()
      .addScaledVector(forward, distance)
      .addScaledVector(right, (Math.random() - 0.5) * half * 1.1)
      .addScaledVector(up, half * (0.3 + Math.random() * 0.4));
    const from = to.clone().addScaledVector(up, -half * 0.45);
    const positions = new Float32Array(perShell * 3);
    for (let i = 0; i < perShell; i++) positions.set([from.x, from.y, from.z], i * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const colour = new Color(COLOURS[Math.floor(Math.random() * COLOURS.length)]).multiplyScalar(3); // past bloom's threshold
    const material = new PointsMaterial({
      color: colour,
      map: texture,
      size: 2.4,
      transparent: true,
      depthWrite: false,
      // In the sky, so never hidden behind the hill the camera happens to be facing.
      depthTest: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 10;
    scene.add(points);
    shells.push({ points, material, positions, velocities: new Float32Array(perShell * 3), age: 0, from, to, burst: false, far });
  }

  function explode(s: Shell): void {
    s.burst = true;
    const speed = 24 + Math.random() * 10;
    for (let i = 0; i < perShell; i++) {
      // Evenly round a sphere, with a little ragged variation.
      const y = 1 - (2 * (i + 0.5)) / perShell;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      const v = speed * (0.85 + Math.random() * 0.3);
      s.velocities.set([Math.cos(a) * r * v, y * v, Math.sin(a) * r * v], i * 3);
      s.positions.set([s.to.x, s.to.y, s.to.z], i * 3);
    }
    s.material.size = 3;
    onBurst?.(s.far);
  }

  function remove(s: Shell): void {
    scene.remove(s.points);
    s.points.geometry.dispose();
    s.material.dispose();
  }

  return {
    start(seconds, hear) {
      left = seconds;
      nextIn = 0;
      onBurst = hear;
    },
    stop() {
      left = 0;
      for (const s of shells) remove(s);
      shells.length = 0;
    },
    active: () => left > 0 || shells.length > 0,
    update(dt, eye, forward, right, up) {
      if (left > 0) {
        left -= dt;
        nextIn -= dt;
        if (nextIn <= 0) {
          launch(eye, forward, right, up);
          // Now and then two at once.
          if (Math.random() < 0.25) launch(eye, forward, right, up);
          nextIn = 0.45 + Math.random() * 0.5;
        }
      }
      for (let k = shells.length - 1; k >= 0; k--) {
        const s = shells[k];
        s.age += dt;
        if (!s.burst) {
          // Climbing: the points bunch into a short trail behind the shell.
          const t = Math.min(1, s.age / CLIMB_FOR);
          for (let i = 0; i < perShell; i++) {
            const lag = Math.max(0, t - (i / perShell) * 0.06);
            const ease = 1 - (1 - lag) * (1 - lag);
            const p = trail.lerpVectors(s.from, s.to, ease);
            s.positions.set([p.x, p.y, p.z], i * 3);
          }
          s.material.size = 1.2;
          if (t >= 1) explode(s);
        } else {
          const since = s.age - CLIMB_FOR;
          const dragK = Math.exp(-1.6 * dt);
          for (let i = 0; i < perShell * 3; i += 3) {
            s.velocities[i] *= dragK;
            s.velocities[i + 1] = s.velocities[i + 1] * dragK - GRAVITY * dt;
            s.velocities[i + 2] *= dragK;
            s.positions[i] += s.velocities[i] * dt;
            s.positions[i + 1] += s.velocities[i + 1] * dt;
            s.positions[i + 2] += s.velocities[i + 2] * dt;
          }
          // Fading out, with a last flicker as the sparks die.
          const fade = 1 - since / FADE_FOR;
          s.material.opacity = Math.max(0, fade) * (since > FADE_FOR * 0.6 && Math.random() < 0.3 ? 0.4 : 1);
          if (fade <= 0) {
            remove(s);
            shells.splice(k, 1);
            continue;
          }
        }
        (s.points.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      }
    },
  };
}
