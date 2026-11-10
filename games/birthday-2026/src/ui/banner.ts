import { bannerEl, bannerSub, bannerTitle } from "./dom";

let hideTimer = 0;

/** Flash a level card over the play area. Purely cosmetic — the game keeps running. */
export function showBanner(title: string, sub: string): void {
  bannerTitle.textContent = title;
  bannerSub.textContent = sub;

  // Restart the animation even if a banner is already on screen.
  bannerEl.classList.remove("show");
  void bannerEl.offsetWidth;
  bannerEl.classList.add("show");

  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => bannerEl.classList.remove("show"), 1600);
}

export function hideBanner(): void {
  clearTimeout(hideTimer);
  bannerEl.classList.remove("show");
}
