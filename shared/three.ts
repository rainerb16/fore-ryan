// Three.js plumbing every 3D page needs, kept to what two pages actually share.

import { PerspectiveCamera, WebGLRenderer } from "three";

/** Retina phones would otherwise render 3–4x the pixels for little visible gain. */
export const MAX_PIXEL_RATIO = 1.5;

/**
 * A renderer filling its canvas, with a camera kept in step on resize.
 * `onResize` runs after each resize, e.g. to refit the camera for a phone.
 */
export function createView(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  onResize?: (width: number, height: number) => void,
): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));

  const fit = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    onResize?.(width, height);
  };
  fit();
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

export const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
