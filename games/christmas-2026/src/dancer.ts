/**
 * Ryan the elf as a cardboard standee for the result screen: the photo with
 * real thickness, a plain cardboard back, and his head cut off at the chin so
 * it can bobble. The dancing itself is CSS (styles.css, "Ryan the elf").
 */

const SRC = "/assets/ryan/ryan-elf.png";
/** Edge layers behind the photo, 1px apart, that make up the cardboard's thickness. */
const THICKNESS = 8;

const div = (className: string): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = className;
  return el;
};

/** One cut piece of the standee: photo in front, edge layers, cardboard back. */
function piece(name: "body" | "head"): HTMLDivElement {
  const part = div(`part ${name}`);
  for (let z = 1; z <= THICKNESS; z++) {
    const edge = div("slab edge");
    edge.style.transform = `translateZ(${-z}px)`;
    part.append(edge);
  }
  // Turned to face backwards; its card is mirrored back so the outline matches the front.
  const back = div("back");
  back.style.transform = `translateZ(${-THICKNESS - 1}px) rotateY(180deg)`;
  back.append(div("card"));
  if (name === "body") {
    const stamp = div("stamp");
    stamp.textContent = "FRAGILE · ELF INSIDE";
    back.append(stamp);
  }
  const front = document.createElement("img");
  front.className = "slab front";
  front.src = SRC;
  front.alt = "";
  part.append(back, front);
  return part;
}

export function buildDancer(host: HTMLElement): void {
  host.style.setProperty("--elf", `url("${SRC}")`);
  const rig = div("rig");
  const groove = div("groove");
  const hop = div("hop");
  hop.append(piece("body"), piece("head"));
  groove.append(hop);
  rig.append(groove);
  host.replaceChildren(div("shadow"), rig);
}
