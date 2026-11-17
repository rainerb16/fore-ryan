// Three.js plumbing every 3D page needs, kept to what two pages actually share.

import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  Vector2,
  WebGLRenderer,
  type Camera,
  type PerspectiveCamera,
  type Scene,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Retina phones would otherwise render 3–4x the pixels for little visible gain. */
export const MAX_PIXEL_RATIO = 1.5;

/** Phones and small tablets get cheaper shadows and effects. */
export const isLowPower = (): boolean =>
  (window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
  Math.min(window.screen?.width ?? 1024, window.screen?.height ?? 1024) < 700;

/**
 * A renderer filling its canvas, with filmic tone mapping and soft shadows, and
 * a camera kept in step on resize. `onResize` runs after each resize, e.g. to
 * refit the camera or an effects composer.
 */
export function createView(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  onResize?: (width: number, height: number) => void,
): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const fit = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    onResize?.(width, height);
  };
  // After the caller has its renderer back, so onResize can use what it builds.
  queueMicrotask(fit);
  window.addEventListener("resize", fit);
  return renderer;
}

/** Calls `frame` every animation frame with seconds elapsed and the frame delta. */
export function runLoop(frame: (time: number, dt: number) => void): void {
  let last = performance.now();
  const tick = (now: number): void => {
    // Clamp, so a tab returning from the background does not jump the scene.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frame(now / 1000, dt);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface Bloom {
  render(): void;
  resize(width: number, height: number): void;
}

/**
 * Renders through a bloom pass, so anything brighter than `threshold` glows:
 * neon, lit windows, fairy lights. Call `resize` from createView's onResize.
 */
export function createBloom(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  opts: { strength: number; radius: number; threshold: number; lowPower: boolean },
): Bloom {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), opts.strength, opts.radius, opts.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    resize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      // Bloom is blurry by nature; phones can compute it at half size.
      if (opts.lowPower) bloom.resolution.set(width / 2, height / 2);
    },
  };
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
