export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];

/** Pick from `list` using per-key weights. Levels use this to bias their hazard mix. */
export function pickWeighted<T extends string>(
  list: readonly T[],
  weights: Record<T, number>,
): T {
  let total = 0;
  for (const key of list) total += weights[key];
  let roll = Math.random() * total;
  for (const key of list) {
    roll -= weights[key];
    if (roll <= 0) return key;
  }
  return list[list.length - 1];
}
