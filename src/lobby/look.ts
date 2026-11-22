// What makes the room read as real rather than flat: soft reflections from an
// environment map, and bloom so neon, screens and buttons glow into the dark.

import { PMREMGenerator, type PerspectiveCamera, type Scene, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createBloom, type Bloom } from "../../shared/three";

export interface Look extends Bloom {
  /**
   * Draws the reflections again. They are rendered on the GPU once, so a lost
   * WebGL context takes them with it; everything else three.js rebuilds itself.
   */
  restoreReflections(): void;
}

/** A generic lit room as the reflection source, rendered on the GPU. */
function reflections(renderer: WebGLRenderer): WebGLRenderTarget {
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
  pmrem.dispose();
  return target;
}

export function applyLook(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, lowPower: boolean): Look {
  // Turned well down so the arcade stays dark: it adds sheen to lacquer and glass, not light.
  let env = reflections(renderer);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.22;

  renderer.toneMappingExposure = 1.1;

  // Only the brightest things bloom: neon, lit screens, marquees, buttons.
  const bloom = createBloom(renderer, scene, camera, { strength: 0.85, radius: 0.55, threshold: 0.62, lowPower });
  return {
    ...bloom,
    restoreReflections() {
      env.dispose();
      env = reflections(renderer);
      scene.environment = env.texture;
    },
  };
}
