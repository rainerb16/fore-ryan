// Single entry so the shared 3D setup and the three.js classes it uses come
// from one bundle, and a test can watch those classes.
export { createBloom } from "../shared/three";
export { CONTEXT } from "../shared/webgl";
export { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
export { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
export { PerspectiveCamera, Scene } from "three";
