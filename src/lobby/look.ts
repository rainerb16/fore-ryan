// What makes the room read as real rather than flat: soft reflections from an
// environment map, and bloom so neon, screens and buttons glow into the dark.

import { PMREMGenerator, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createBloom, type Bloom } from "../../shared/three";

export function applyLook(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, lowPower: boolean): Bloom {
  // A generic lit room as the reflection source, turned well down so the arcade
  // stays dark: it adds sheen to lacquer and glass, not light.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  renderer.toneMappingExposure = 1.1;

  // Only the brightest things bloom: neon, lit screens, marquees, buttons.
  return createBloom(renderer, scene, camera, { strength: 0.85, radius: 0.55, threshold: 0.62, lowPower });
}
