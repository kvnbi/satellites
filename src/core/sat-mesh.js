import * as THREE from 'three';
import { scene, camera, renderer, GLOBE_R, HAS_COARSE_POINTER, viewportHeight } from './scene.js';
import { S, MAX_SATS, visArr, colArr, posArr } from '../state.js';

const SAT_BOUND_RADIUS = 0.42;
const SAT_MIN_PX       = 0.75;

const satGeometry = new THREE.PlaneGeometry(2, 2);
export const satMaterial = new THREE.ShaderMaterial({
  uniforms: { uOutline: { value: 1.0 } },
  vertexShader: `
    varying vec2 vUV;
    varying vec3 vCol;
    void main() {
      vec3  centre = instanceMatrix[3].xyz;
      float s      = instanceMatrix[0][0];
      vec4  cv     = viewMatrix * vec4(centre, 1.0);
      vUV          = position.xy;
      vCol         = instanceColor;
      gl_Position  = projectionMatrix * vec4(cv.xy + position.xy * s, cv.z, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uOutline;
    varying vec2  vUV;
    varying vec3  vCol;
    void main() {
      float dist = length(vUV);
      if (dist > 1.0) discard;
      float sN   = sqrt(1.0 - dist * dist);
      vec3  fill = vCol * (1.0 + 0.22 * sN * sN);
      float t    = clamp((1.0 - dist) / 0.50, 0.0, 1.0);
      float edge = cos(t * 1.5708) * uOutline;
      gl_FragColor = vec4(mix(fill, min(vCol + 0.32, vec3(1.0)), edge), 1.0);
    }
  `,
});
export let satMesh = null;

function minRadiusSlope() {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  return SAT_MIN_PX * 2 * tanHalf / viewportHeight();
}

export function initSatMesh() {
  satMesh = new THREE.InstancedMesh(satGeometry, satMaterial, MAX_SATS);
  satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  satMesh.frustumCulled = false;
  satMesh.instanceColor = new THREE.InstancedBufferAttribute(colArr, 3);
  satMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const m = satMesh.instanceMatrix.array;
  for (let i = 0; i < MAX_SATS; i++) m[i*16 + 15] = 1;

  satMesh.count = S.count;
  satMesh.instanceColor.needsUpdate = true;
  updateSatInstances();
  scene.add(satMesh);
  document.getElementById('loading').style.display = 'none';
}

export function updateSatInstances() {
  if (!satMesh || S.count === 0) return;
  const m = satMesh.instanceMatrix.array;
  const slope = minRadiusSlope();
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (let i = 0; i < S.count; i++) {
    const o = i*16;
    if (!visArr[i] || i === S.followHideIdx) { m[o] = 0; m[o+5] = 0; m[o+10] = 0; continue; }
    const px = posArr[i*3], py = posArr[i*3+1], pz = posArr[i*3+2];
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const s  = Math.max(SAT_BOUND_RADIUS, slope * Math.sqrt(dx*dx + dy*dy + dz*dz));
    m[o]    = s;  m[o+5]  = s;  m[o+10] = s;
    m[o+12] = px; m[o+13] = py; m[o+14] = pz;
  }
  satMesh.instanceMatrix.needsUpdate = true;
}

const _pick = new THREE.Vector3();
export function pickSatAt(clientX, clientY) {
  if (!satMesh || S.count === 0) return -1;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx   = clientX - rect.left;
  const my   = clientY - rect.top;

  const cam = camera.position;
  const gr2 = GLOBE_R * GLOBE_R;

  const halfH   = rect.height * 0.5;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  const slope   = SAT_MIN_PX * 2 * tanHalf / rect.height;
  const BASE_PX = HAS_COARSE_POINTER ? 22 : 8;

  let bestIdx = -1, bestD = Infinity;
  for (let i = 0; i < S.count; i++) {
    if (!visArr[i]) continue;
    const wx = posArr[i*3], wy = posArr[i*3+1], wz = posArr[i*3+2];

    const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
    const dd = dx*dx + dy*dy + dz*dz;
    const t  = Math.max(0, Math.min(1, -(cam.x*dx + cam.y*dy + cam.z*dz) / dd));
    const qx = cam.x + t*dx, qy = cam.y + t*dy, qz = cam.z + t*dz;
    if (qx*qx + qy*qy + qz*qz < gr2) continue;

    _pick.set(wx, wy, wz).project(camera);
    if (_pick.z > 1) continue;
    const sx = (_pick.x + 1) * 0.5 * rect.width;
    const sy = (1 - _pick.y) * 0.5 * rect.height;
    const d  = Math.hypot(sx - mx, sy - my);

    const dist    = Math.sqrt(dd);
    const worldR  = Math.max(SAT_BOUND_RADIUS, slope * dist);
    const screenR = worldR / (dist * tanHalf) * halfH;
    const allow   = Math.max(BASE_PX, screenR);
    if (d <= allow && d < bestD) { bestD = d; bestIdx = i; }
  }
  return bestIdx;
}
