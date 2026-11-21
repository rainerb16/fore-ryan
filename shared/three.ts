// Three.js plumbing every 3D page needs, kept to what two pages actually share.

import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PCFShadowMap,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Camera,
  type PerspectiveCamera,
  type Scene,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CONTEXT } from "./webgl";

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
  // Same settings as hasWebGL(canvas), so the renderer reuses the context the check made.
  const renderer = new WebGLRenderer({ canvas, ...CONTEXT });
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

export interface Bloom {
  render(): void;
  resize(width: number, height: number): void;
  /**
   * Compiles the scene's shaders in the background, in parallel where the
   * browser can, rather than one by one inside the first frame. Resolves once
   * they are ready, so the first frame does not freeze the page.
   */
  compile(): Promise<void>;
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
  // The scene is drawn here, not on the screen, so this is where edges are
  // smoothed. Phones skip it: the cost is real and their pixels are small.
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: opts.lowPower ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), opts.strength, opts.radius, opts.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    async compile() {
      // The scene is drawn into the composer's buffer, not the screen, and three
      // builds different shaders for the two (tone mapping happens later, in
      // OutputPass). Compile for the buffer, or the first frame compiles again.
      const was = renderer.getRenderTarget();
      renderer.setRenderTarget(composer.readBuffer);
      const done = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(was);
      await done;
    },
    resize(width, height) {
      const pixelRatio = renderer.getPixelRatio();
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      // Bloom is blurry by nature; phones can compute it at half size. The pass
      // sizes itself from setSize alone, so this has to come after the composer's.
      if (opts.lowPower) bloom.setSize((width * pixelRatio) / 2, (height * pixelRatio) / 2);
    },
  };
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
