// A Santa hat in soft fabric, shared by the lobby's Christmas cabinet and the
// ski jump's Ryan. It rises from a fur brim, then flops over to +x with the
// pompom hanging. Built as a tube along that bent path whose radius tapers to
// the tip, with gentle bulges and creases for the folds. About 0.25 m across
// the brim, which sits at the origin; scale it to fit.

import {
  CatmullRomCurve3,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";

/** Nudges every vertex in or out a little, deterministically, so fur reads as fluffy. */
export function fluff<G extends BufferGeometry>(geometry: G, amount: number): G {
  const pos = geometry.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 91 + v.y * 57) * Math.cos(v.z * 73 - v.x * 31);
    v.multiplyScalar(1 + n * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param fur Fur colour. Kept grey-white rather than white where a bright light
 *   falls on it, or bloom makes it glow.
 */
export function santaHat(fur = "#9c9c9c"): Group {
  const path = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0, 0.09, 0),
    new Vector3(0.02, 0.17, 0.01),
    new Vector3(0.09, 0.22, 0.02),
    new Vector3(0.16, 0.19, 0.03),
    new Vector3(0.2, 0.12, 0.03),
  ]);
  const rings = 40;
  const sides = 20;
  const body = new TubeGeometry(path, rings, 1, sides, false);

  // TubeGeometry lays vertices out ring by ring; reshape each ring around its centre.
  const pos = body.attributes.position;
  const centre = new Vector3();
  const v = new Vector3();
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    path.getPointAt(t, centre);
    const taper = 0.12 * Math.pow(1 - t, 0.85) + 0.012;
    for (let side = 0; side <= sides; side++) {
      const i = ring * (sides + 1) + side;
      const angle = (side / sides) * Math.PI * 2;
      const folds = 1 + 0.07 * Math.sin(t * 13) + 0.05 * Math.sin(angle * 3 + t * 7);
      v.fromBufferAttribute(pos, i).sub(centre).normalize().multiplyScalar(taper * folds).add(centre);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  body.computeVertexNormals();

  const velvet = new MeshPhysicalMaterial({
    color: "#9e0f26",
    roughness: 0.85,
    sheen: 1,
    sheenRoughness: 0.4,
    sheenColor: "#ff5a6e",
  });
  const furMat = new MeshStandardMaterial({ color: fur, roughness: 1 });

  const hat = new Group();
  const tip = path.getPointAt(1);
  const pompom = new Mesh(fluff(new IcosahedronGeometry(0.04, 2), 0.12), furMat);
  pompom.position.set(tip.x, tip.y - 0.03, tip.z);
  hat.add(
    new Mesh(body, velvet),
    new Mesh(fluff(new TorusGeometry(0.122, 0.038, 12, 36).rotateX(Math.PI / 2), 0.05), furMat).translateY(0.01),
    pompom,
  );
  hat.traverse((n) => (n.castShadow = true));
  return hat;
}
