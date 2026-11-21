/**
 * A mirror ball with Ryan's face in its tiles, hanging over the result screen,
 * and the spots of light it throws. The ball is a real sphere drawn on a 2D
 * canvas: every tile is projected each frame, so his face turns away and comes
 * back round as it spins. Layout and the spots' orbit are CSS (styles.css).
 */

const SRC = "/assets/ryan/ryan-head-floating.png";
const ROWS = 32; // tile bands, pole to pole
const COLS = 64; // tiles around the equator
const TURN_SECONDS = 7;
/** The face is read at this resolution, a little finer than the tiles. */
const TEX = 96;
const SPOTS = 40;
const SPOT_COLOURS = ["#ff5a7a", "#7ac8ff", "#ffe08a", "#8cffb4", "#d29bff", "#ffffff"];

type Rgb = [number, number, number];
type Vec3 = [number, number, number];
type Tile = { rgb: Rgb; face: boolean };

/** Light from the upper left, in front. */
const LIGHT = norm([-0.5, 0.6, 0.65]);
/** Halfway between the light and the eye, for the glint. */
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** A steady pseudo-random number in [0, 1) for a tile, so each keeps its own look. */
const hash = (a: number, b: number, c = 0): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Each tile's colour: his face on the front of the ball, mirror everywhere else. */
function tileColours(face: ImageData | null): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < ROWS; i++) {
    const lat = -Math.PI / 2 + ((i + 0.5) * Math.PI) / ROWS;
    for (let j = 0; j < COLS; j++) {
      const lon = ((j + 0.5) * 2 * Math.PI) / COLS;
      const grey = 150 + hash(i, j) * 70;
      let tile: Tile = { rgb: [grey, grey, grey + 12], face: false };
      // The picture is laid straight onto the front half, as if seen head-on.
      if (face && Math.cos(lon) > 0) {
        const u = Math.min(TEX - 1, Math.floor(((Math.cos(lat) * Math.sin(lon) + 1) / 2) * TEX));
        const v = Math.min(TEX - 1, Math.floor(((1 - Math.sin(lat)) / 2) * TEX));
        const p = (v * TEX + u) * 4;
        if (face.data[p + 3] > 128) tile = { rgb: [face.data[p], face.data[p + 1], face.data[p + 2]], face: true };
      }
      tiles.push(tile);
    }
  }
  return tiles;
}

function readFace(): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = TEX;
      const g = c.getContext("2d");
      if (!g) return resolve(null);
      g.drawImage(img, 0, 0, TEX, TEX);
      resolve(g.getImageData(0, 0, TEX, TEX));
    };
    img.onerror = () => resolve(null);
    img.src = SRC;
  });
}

function draw(g: CanvasRenderingContext2D, size: number, tiles: Tile[], spin: number, t: number, still: boolean): void {
  const r = size / 2 - 1;
  g.clearRect(0, 0, size, size);
  // The grout between tiles.
  g.fillStyle = "#151827";
  g.beginPath();
  g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  g.fill();

  const at = (lat: number, lon: number): [number, number] => [
    size / 2 + r * Math.cos(lat) * Math.sin(lon),
    size / 2 - r * Math.sin(lat),
  ];
  const glintTick = Math.floor(t * 8);
  for (let i = 0; i < ROWS; i++) {
    const lat0 = -Math.PI / 2 + (i * Math.PI) / ROWS;
    const lat1 = lat0 + Math.PI / ROWS;
    const lat = (lat0 + lat1) / 2;
    for (let j = 0; j < COLS; j++) {
      const lon0 = (j * 2 * Math.PI) / COLS + spin;
      const lon1 = lon0 + (2 * Math.PI) / COLS;
      const lon = (lon0 + lon1) / 2;
      const n: Vec3 = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
      if (n[2] <= 0.01) continue; // round the back

      const diffuse = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      let glint = Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]) ** 40;
      if (!still && hash(i, j, glintTick) < 0.012) glint = 1;
      const tile = tiles[i * COLS + j];
      // His face gets less shading and fewer glints, so it still reads as him.
      const shade = tile.face ? 0.75 + 0.35 * diffuse : 0.45 + 0.7 * diffuse;
      if (tile.face) glint *= 0.3;
      const [cr, cg, cb] = tile.rgb;
      g.fillStyle = `rgb(${Math.min(255, cr * shade + 255 * glint)},${Math.min(255, cg * shade + 255 * glint)},${Math.min(255, cb * shade + 255 * glint)})`;

      // Each tile a little smaller than its cell, so the grout shows.
      const corners = [at(lat0, lon0), at(lat0, lon1), at(lat1, lon1), at(lat1, lon0)];
      const [mx, my] = at(lat, lon);
      g.beginPath();
      corners.forEach(([x, y], k) => {
        const px = mx + (x - mx) * 0.88;
        const py = my + (y - my) * 0.88;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.fill();
    }
  }
}

/** The spots of light the ball throws, each circling it on its own. */
function spots(): HTMLDivElement {
  const lights = document.createElement("div");
  lights.className = "disco-lights";
  for (let k = 0; k < SPOTS; k++) {
    const spot = document.createElement("i");
    const reach = 12 + hash(k, 1) * 100; // vmax from the ball
    spot.style.setProperty("--angle", `${hash(k, 2) * 360}deg`);
    spot.style.setProperty("--reach", `${reach}vmax`);
    spot.style.setProperty("--spot", `${6 + reach / 9}px`);
    spot.style.color = SPOT_COLOURS[k % SPOT_COLOURS.length];
    lights.append(spot);
  }
  return lights;
}

export function buildDisco(host: HTMLElement): void {
  const hang = document.createElement("div");
  hang.className = "disco-hang";
  const canvas = document.createElement("canvas");
  hang.append(canvas);
  host.replaceChildren(spots(), hang);

  const g = canvas.getContext("2d");
  if (!g) return;
  let tiles = tileColours(null);
  void readFace().then((face) => (tiles = tileColours(face)));
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    // Only while the result screen is up.
    if (canvas.getClientRects().length === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(canvas.clientWidth * dpr);
    if (size === 0) return;
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const t = now / 1000;
    const spin = still.matches ? 0 : ((t % TURN_SECONDS) / TURN_SECONDS) * Math.PI * 2;
    draw(g, size, tiles, spin, t, still.matches);
  };
  requestAnimationFrame(frame);
}
