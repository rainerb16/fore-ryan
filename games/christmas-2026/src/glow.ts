import { Color } from "three";

/**
 * A colour brighter than white, for things that give off light. Bloom's
 * threshold is 1, so only these glow, never lit snow or white paint.
 */
export const glowing = (color: string, power: number): Color => new Color(color).multiplyScalar(power);
