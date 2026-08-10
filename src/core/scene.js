import * as THREE        from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import ThreeGlobe        from 'three-globe';

export const EARTH_R_KM = 6371;

const container = document.getElementById('globe');
const headerEl  = document.getElementById('header');
export function viewportHeight() {
  return window.innerHeight - headerEl.offsetHeight;
}

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, viewportHeight());
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 3.0));

export const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / viewportHeight(), 0.1, 1e5
);

export const globe = new ThreeGlobe({ animateIn: false })
  .globeImageUrl('/earth-blue-marble.jpg')
  .bumpImageUrl('/earth-topology.png')
  .showAtmosphere(false);
scene.add(globe);

const maxAniso = renderer.capabilities.getMaxAnisotropy();
(function applyAniso() {
  const map = globe.globeMaterial().map;
  if (map) { map.anisotropy = maxAniso; map.needsUpdate = true; }
  else setTimeout(applyAniso, 100);
})();

export const GLOBE_R = globe.getGlobeRadius();

export const HAS_COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan     = false;
controls.minDistance   = 102;
controls.maxDistance   = 2000;
controls.zoomSpeed     = 4.5;
controls.rotateSpeed   = 1.0;
controls.touches.TWO   = THREE.TOUCH.DOLLY_ROTATE;

const startPos = globe.getCoords(51.1657, 10.4515, 1.9);
camera.position.set(startPos.x, startPos.y, startPos.z);
controls.target.set(0, 0, 0);
controls.update();

export function tuneRotateSpeed() {
  const ratio = controls.getDistance() / GLOBE_R;
  const t = THREE.MathUtils.clamp((ratio - 1.0) / 5.0, 0, 1);
  controls.rotateSpeed = 0.3 + t * 0.7;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / viewportHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, viewportHeight());
});
