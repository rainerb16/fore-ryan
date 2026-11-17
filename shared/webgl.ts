// Kept apart from shared/three.ts so a page can check for WebGL before it pays
// for downloading Three.js.

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
