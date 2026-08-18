export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];
