// What makes the room read as real rather than flat: soft reflections from an
// environment map, and bloom so neon, screens and buttons glow into the dark.

import { PMREMGenerator, Vector2, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface Look {
  render(): void;
  resize(width: number, height: number): void;
}

export function applyLook(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, lowPower: boolean): Look {
  // A generic lit room as the reflection source, turned well down so the arcade
  // stays dark: it adds sheen to lacquer and glass, not light.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  renderer.toneMappingExposure = 1.1;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Only the brightest things bloom: neon, lit screens, marquees, buttons.
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.85, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    render: () => composer.render(),
    resize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      // Bloom is blurry by nature; phones can compute it at half size.
      if (lowPower) bloom.resolution.set(width / 2, height / 2);
    },
  };
}
