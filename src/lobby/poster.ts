// The Action Furnace poster on the back wall. Follows the brand guide: navy
// background (the logo must never sit on red or yellow), clear space around the
// logo with no effects on it, Oswald headline in the brand gold.

import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { paint } from "./textures";

const BRAND = {
  navy: "#081644",
  navyLight: "#0D2572",
  gold: "#FFB500",
  orange: "#FB6828",
};

const HEADLINE = `"Oswald", Impact, "Arial Narrow", sans-serif`;
const SUBHEAD = `"Poppins", "Segoe UI", system-ui, sans-serif`;

const W = 512;
const H = 768;

/** Draws `img` scaled to fit width `w`, centred on `cx`, top at `y`. Returns its height. */
function fitWidth(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, y: number, w: number): number {
  const h = (img.naturalHeight / img.naturalWidth) * w;
  ctx.drawImage(img, cx - w / 2, y, w, h);
  return h;
}

export function buildPoster(logo: HTMLImageElement | null, guy: HTMLImageElement | null): Group {
  const texture = paint(W, H, (ctx) => {
    ctx.fillStyle = BRAND.navy;
    ctx.fillRect(0, 0, W, H);

    // Diagonal stripes in the lighter navy, for texture without touching the logo.
    ctx.fillStyle = BRAND.navyLight;
    for (let x = -H; x < W; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 24, H);
      ctx.lineTo(x + 24 + H * 0.6, 260);
      ctx.lineTo(x + H * 0.6, 260);
      ctx.closePath();
      ctx.fill();
    }

    // The logo on clean navy, with clear space around it.
    if (logo) fitWidth(ctx, logo, W / 2, 34, 300);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = BRAND.gold;
    ctx.font = `700 92px ${HEADLINE}`;
    ctx.fillText("GAME", 230, 360);
    ctx.fillText("ON!", 230, 452);

    ctx.fillStyle = "#ffffff";
    ctx.font = `600 26px ${SUBHEAD}`;
    ctx.fillText("Heating.", 232, 510);
    ctx.fillText("Cooling.", 232, 546);
    ctx.fillText("High scores.", 232, 582);

    // The Action Furnace Guy, giving the arcade a thumbs up.
    if (guy) {
      const h = 470;
      const w = (guy.naturalWidth / guy.naturalHeight) * h;
      ctx.drawImage(guy, 20, 250, w, h);
    }

    // Footer band.
    ctx.fillStyle = BRAND.orange;
    ctx.fillRect(0, H - 56, W, 56);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 22px ${SUBHEAD}`;
    ctx.textAlign = "center";
    ctx.fillText("OFFICIAL SPONSOR OF THE RYAN ARCADE", W / 2, H - 20, W - 30);
  });

  const group = new Group();
  const frame = new Mesh(new BoxGeometry(1.08, 1.6, 0.04), new MeshStandardMaterial({ color: "#111", roughness: 0.5 }));
  // Printed paper: lit by the room, plus a soft glow as if under a picture light,
  // kept dim enough that bloom leaves it alone.
  const art = new Mesh(
    new PlaneGeometry(1.0, 1.5),
    new MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: "#ffffff", emissiveIntensity: 0.4, roughness: 0.6 }),
  );
  art.position.z = 0.021;
  group.add(frame, art);
  return group;
}
