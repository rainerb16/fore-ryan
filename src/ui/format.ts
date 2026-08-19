/** Display formatting shared by the HUD, the scorecard, and the standings. */

export const formatPoints = (n: number): string => n.toLocaleString("en-US");

export const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const mins = Math.floor(total / 60);
  return mins > 0 ? `${mins}m ${String(total % 60).padStart(2, "0")}s` : `${total}s`;
};
