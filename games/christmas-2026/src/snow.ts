// Snow's surface, made once in code: a normal map of soft wind-blown bumps
// (optionally with groomed corduroy lines, for the landing hill) and a roughness
// map with scattered ice crystals that glint as the light catches them.

import { CanvasTexture, MeshStandardMaterial, NoColorSpace, RepeatWrapping, type Color, type Texture } from "three";

const SIZE = 256;

/** Smooth value noise that tiles across the texture's edges, in 0..1. */
function tilingNoise(cells: number, seed: number): (x: number, y: number) => number {
  const lattice = new Float32Array(cells * cells);
  let s = seed;
  for (let i = 0; i < lattice.length; i++) {
    s = (s * 16807) % 2147483647;
    lattice[i] = s / 2147483647;
  }
  const at = (i: number, j: number): number => lattice[((j + cells) % cells) * cells + ((i + cells) % cells)];
  return (x, y) => {
    const fx = (x / SIZE) * cells;
    const fy = (y / SIZE) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return top + (bottom - top) * sv;
  };
}

function texture(pixels: (x: number, y: number) => [number, number, number]): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = pixels(x, y);
      const i = (y * SIZE + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const t = new CanvasTexture(canvas);
  t.colorSpace = NoColorSpace; // data, not colour
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A normal map from a height field, sampled with wrap-around so it tiles. */
function normalMap(height: (x: number, y: number) => number, strength: number): CanvasTexture | null {
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = height(x, y);
  const at = (x: number, y: number): number => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  return texture((x, y) => {
    const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
    const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    return [((dx / len) * 0.5 + 0.5) * 255, ((dy / len) * 0.5 + 0.5) * 255, ((1 / len) * 0.5 + 0.5) * 255];
  });
}

export interface SnowOptions {
  color: Color | string;
  /** Metres one tile of texture covers, given UVs in metres. */
  tile: number;
  /** Corduroy from the grooming machine, running along the texture's u direction. */
  groomed?: boolean;
  vertexColors?: boolean;
}

/** A snow material; `uvScale` is how many metres one UV unit spans (u, v) on the mesh it goes on. */
export function snowMaterial(opts: SnowOptions, uvScale: [number, number] = [1, 1]): MeshStandardMaterial {
  const broad = tilingNoise(8, 3);
  const fine = tilingNoise(32, 9);
  const bumps = (x: number, y: number): number => broad(x, y) * 0.7 + fine(x, y) * 0.3;
  // Fine, shallow ridges from the grooming machine's comb, about 10 cm apart.
  const height = opts.groomed
    ? (x: number, y: number): number => bumps(x, y) * 0.8 + 0.2 * Math.abs(Math.sin((y / SIZE) * Math.PI * 60))
    : bumps;
  const normal = normalMap(height, opts.groomed ? 2 : 4);

  // Mostly matt, with scattered crystals that catch the light.
  const sparkle = tilingNoise(64, 17);
  let s = 41;
  const rough = texture((x, y) => {
    s = (s * 16807) % 2147483647;
    const glint = s / 2147483647 > 0.996 && sparkle(x, y) > 0.45;
    const v = glint ? 20 : 215 + sparkle(x, y) * 40;
    return [v, v, v];
  });

  for (const t of [normal, rough] as Array<Texture | null>) t?.repeat.set(uvScale[0] / opts.tile, uvScale[1] / opts.tile);
  return new MeshStandardMaterial({
    color: opts.color,
    vertexColors: opts.vertexColors ?? false,
    roughness: 1,
    roughnessMap: rough,
    normalMap: normal,
    metalness: 0,
  });
}
