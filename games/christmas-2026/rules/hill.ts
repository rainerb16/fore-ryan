// The jump hill as a side profile, in metres. The take-off lip is the origin:
// x runs downhill, y up. The inrun climbs back up to the left of it, and the
// landing hill falls away to the right. The simulation, the renderer, and the
// server's plausibility limits all read this one profile.

const DEG = Math.PI / 180;

/** Inrun: a straight 35° ramp curving into an 11° take-off table. */
export const INRUN = {
  rampDeg: 35,
  tableDeg: 11,
  rampLength: 95,
  curveLength: 30,
  tableLength: 8,
} as const;

export const INRUN_LENGTH = INRUN.rampLength + INRUN.curveLength + INRUN.tableLength;

/** Landing hill: drops from the knoll to a 36° slope, then flattens into the run-out. */
export const LANDING = {
  /** How far below the lip the hill starts. */
  dropAtLip: 3,
  knollDeg: 8,
  steepDeg: 36,
  /** x where the slope reaches full steepness, starts easing out, and is flat. */
  steepFrom: 38,
  easeFrom: 110,
  flatFrom: 175,
  /** The run-out ends here; nothing lands past it. */
  end: 260,
} as const;

/** A smooth 0→1 ramp between a and b. */
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Inrun slope angle, in radians below horizontal, at distance s from the start gate. */
export function inrunAngle(s: number): number {
  const { rampDeg, tableDeg, rampLength, curveLength } = INRUN;
  const k = smooth(rampLength, rampLength + curveLength, s);
  return (rampDeg + (tableDeg - rampDeg) * k) * DEG;
}

/** Landing slope angle, in radians below horizontal, at x past the lip. */
export function landingAngle(x: number): number {
  const { knollDeg, steepDeg, steepFrom, easeFrom, flatFrom } = LANDING;
  const steep = knollDeg + (steepDeg - knollDeg) * smooth(0, steepFrom, x);
  return (x < easeFrom ? steep : steepDeg * (1 - smooth(easeFrom, flatFrom, x))) * DEG;
}

const STEP = 0.25;

/**
 * The landing hill sampled every STEP metres: height below the lip, and the
 * distance along the surface from the lip, which is how jumps are measured.
 */
const landing = (() => {
  const n = Math.ceil(LANDING.end / STEP) + 1;
  const y = new Float64Array(n);
  const s = new Float64Array(n);
  y[0] = -LANDING.dropAtLip;
  for (let i = 1; i < n; i++) {
    const a = landingAngle((i - 0.5) * STEP);
    y[i] = y[i - 1] - Math.tan(a) * STEP;
    s[i] = s[i - 1] + STEP / Math.cos(a);
  }
  return { y, s };
})();

function sample(table: Float64Array, x: number): number {
  const f = Math.min(Math.max(x, 0), LANDING.end) / STEP;
  const i = Math.min(Math.floor(f), table.length - 2);
  return table[i] + (table[i + 1] - table[i]) * (f - i);
}

/** Height of the landing hill at x (metres, relative to the lip). */
export const hillY = (x: number): number => sample(landing.y, x);

/** Distance measured along the landing hill from the lip to x. */
export const distanceAt = (x: number): number => sample(landing.s, x);

/**
 * The inrun as points from the start gate to the lip, for drawing it. Each is
 * [x, y] relative to the lip.
 */
export function inrunPoints(step = 1): Array<[number, number]> {
  const pts: Array<[number, number]> = [[0, 0]];
  let x = 0;
  let y = 0;
  // Walk back up from the lip.
  for (let s = INRUN_LENGTH; s > 0; s -= step) {
    const a = inrunAngle(s - step / 2);
    x -= Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts.reverse();
}
