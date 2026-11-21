// Kept apart from shared/three.ts so a page can check for WebGL before it pays
// for downloading Three.js.

/**
 * The context the 3D pages ask for. Everything else is left at WebGL's
 * defaults, which are also what Three.js asks for.
 */
export const CONTEXT = { antialias: true, powerPreference: "high-performance" } as const;

/**
 * Whether WebGL 2, which Three.js needs, works here. Pass the canvas the page
 * will draw on: the context made for the check is then the one Three.js picks
 * up, instead of making a second, which takes over a second on some GPUs.
 */
export function hasWebGL(canvas: HTMLCanvasElement = document.createElement("canvas")): boolean {
  try {
    return canvas.getContext("webgl2", CONTEXT) !== null;
  } catch {
    return false;
  }
}
