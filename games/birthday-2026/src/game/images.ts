import { HEAD_IMAGE_SRC, HEAD_PARTY_IMAGE_SRC, HEAD_TRIM } from "./config";
import type { SrcRect } from "./types";

export let headImg: HTMLImageElement | null = null;
export let partyImg: HTMLImageElement | null = null;
export let headAspect = 1;

export function srcRect(img: HTMLImageElement, trimmed: boolean): SrcRect {
  if (trimmed && HEAD_TRIM) {
    return {
      sx: HEAD_TRIM.x * img.naturalWidth,
      sy: HEAD_TRIM.y * img.naturalHeight,
      sw: HEAD_TRIM.w * img.naturalWidth,
      sh: HEAD_TRIM.h * img.naturalHeight,
    };
  }
  return { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
}

function loadImage(src: string, onload: (img: HTMLImageElement) => void): void {
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth) onload(img);
  };
  img.src = src;
}

/**
 * Both loads are optional — with no image present the game falls back to a
 * drawn placeholder, so it always runs.
 */
export function initImages(onHead: () => void, onParty: () => void): void {
  loadImage(HEAD_IMAGE_SRC, (img) => {
    headImg = img;
    const s = srcRect(img, true);
    headAspect = s.sh / s.sw;
    onHead();
  });

  loadImage(HEAD_PARTY_IMAGE_SRC, (img) => {
    partyImg = img;
    onParty();
  });
}
