// Kept apart from shared/three.ts so a page can check for WebGL before it pays
// for downloading Three.js.

/**
 * The context the 3D pages ask for. No antialiasing: the scene is drawn into
 * the bloom composer's buffer first, which smooths its own edges (see
 * createBloom), so the screen's would only cost memory. Everything else is left
 * at WebGL's defaults, which are also what Three.js asks for.
 */
export const CONTEXT = { antialias: false, powerPreference: "high-performance" } as const;

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

/**
 * `work`, unless the canvas's WebGL context is lost first, in which case it
 * fails. Three's shader compile waits on the GPU, and on a lost context it
 * would wait forever.
 */
export function unlessContextLost<T>(canvas: EventTarget, work: Promise<T>): Promise<T> {
  let onLost = (): void => undefined;
  const lost = new Promise<never>((_, reject) => {
    onLost = () => reject(new Error("The WebGL context was lost"));
    canvas.addEventListener("webglcontextlost", onLost, { once: true });
  });
  return Promise.race([work, lost]).finally(() => canvas.removeEventListener("webglcontextlost", onLost));
}

export interface ContextHandlers {
  /** The GPU took the context away: stop drawing. */
  lost(): void;
  /** It gave it back: rebuild what lived only on the GPU, then draw again. */
  restored(): void;
  /** It didn't give it back in time: show something that needs no GPU. */
  gaveUp(): void;
}

/**
 * Follows a canvas's WebGL context being lost and restored. Phones take it
 * away under memory pressure and may never give it back, so after `waitMs`
 * without it this gives up, for good. Returns a function that stops watching.
 */
export function watchContext(canvas: EventTarget, handlers: ContextHandlers, waitMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gaveUp = false;
  const onLost = (): void => {
    if (gaveUp) return;
    handlers.lost();
    clearTimeout(timer);
    timer = setTimeout(() => {
      gaveUp = true;
      handlers.gaveUp();
    }, waitMs);
  };
  const onRestored = (): void => {
    if (gaveUp) return;
    clearTimeout(timer);
    handlers.restored();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return () => {
    clearTimeout(timer);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
}
