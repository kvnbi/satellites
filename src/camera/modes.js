import * as THREE from 'three';
import { camera, controls, renderer, GLOBE_R, tuneRotateSpeed } from '../core/scene.js';
import { S, posArr, posA, posB } from '../state.js';
import { buildOrbit, updateNadirLine, hideSelectionOverlays, orbitSize } from '../core/overlays.js';
import { satMaterial } from '../core/sat-mesh.js';

const _trackPos = new THREE.Vector3();
const _S     = new THREE.Vector3();
const _up    = new THREE.Vector3();
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();
const _aim   = new THREE.Vector3();

let lookYaw = 0, lookPitch = 0;
let followDrag = false, followLastX = 0, followLastY = 0;
const LOOK_SENS = 0.005;
const followPointers = new Map();
let followPinchDist  = 0;

export const camOverridePos = new THREE.Vector3();

export const MODE_LIMITS = {
  earth: { min: 102, max: 2000 },
  orbit: { min: 5,   max: 3000 },
};

const modesEl      = document.getElementById('modes');
const panelStackEl = document.getElementById('panelStack');
const leftStackEl  = document.getElementById('leftStack');

function earthOccludesSegment(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dd = dx*dx + dy*dy + dz*dz;
  if (dd < 1e-12) return false;
  const t  = Math.max(0, Math.min(1, -(a.x*dx + a.y*dy + a.z*dz) / dd));
  const qx = a.x + t*dx, qy = a.y + t*dy, qz = a.z + t*dz;
  return qx*qx + qy*qy + qz*qz < GLOBE_R * GLOBE_R;
}

export function setCamMode(mode) {
  if ((mode === 'follow' || mode === 'orbit') && S.selIdx < 0) return;

  const fromFollow = (S.camMode === 'follow');
  S.camOverrideActive = false;
  S.camMode = mode;
  satMaterial.uniforms.uOutline.value = (mode === 'follow') ? 0.0 : 1.0;
  panelStackEl.classList.toggle('follow-active', mode === 'follow');
  leftStackEl.classList.toggle('follow-active',  mode === 'follow');

  if (mode === 'follow') S.followHideIdx = S.selIdx;
  else if (fromFollow && S.selIdx >= 0) S.followHideIdx = S.selIdx;
  else S.followHideIdx = -1;

  if (mode === 'follow') {
    hideSelectionOverlays();
    _S.set(posArr[S.selIdx*3], posArr[S.selIdx*3+1], posArr[S.selIdx*3+2]);
    lookYaw = 0;
    const dip = Math.acos(THREE.MathUtils.clamp(GLOBE_R / _S.length(), 0, 1));
    lookPitch = -Math.min(dip + 0.26, 1.40);
  } else if (mode === 'orbit') {
    buildOrbit(); updateNadirLine();
    _S.set(posArr[S.selIdx*3], posArr[S.selIdx*3+1], posArr[S.selIdx*3+2]);
    if (!fromFollow && earthOccludesSegment(camera.position, _S)) {
      const dist = THREE.MathUtils.clamp(orbitSize(_S) * 2.2, 120, 2000);
      const sLen = _S.length() || 1;
      camOverridePos.copy(_S).addScaledVector(_S, dist / sLen);
      S.camOverrideActive = true;
    }
  } else if (S.selIdx >= 0) {
    buildOrbit(); updateNadirLine();
  }

  startCamTransition(mode);

  if (fromFollow && S.selIdx >= 0 && (mode === 'earth' || mode === 'orbit')) {
    _S.set(posArr[S.selIdx*3], posArr[S.selIdx*3+1], posArr[S.selIdx*3+2]);
    const d = _S.length() || 1;
    const dist = (mode === 'earth')
      ? Math.min(Math.max(d, GLOBE_R * 3), MODE_LIMITS.earth.max)
      : d + THREE.MathUtils.clamp(orbitSize(_S) * 2.2, 150, 2000);
    camOverridePos.copy(_S).multiplyScalar(dist / d);
    S.camOverrideActive = true;
  }

  syncModeButtons();
}

function followState(outPos, outAim, outUp) {
  const i = S.selIdx;
  _S.set(posArr[i*3], posArr[i*3+1], posArr[i*3+2]);
  _up.copy(_S).normalize();
  _fwd.set(posB[i*3]-posA[i*3], posB[i*3+1]-posA[i*3+1], posB[i*3+2]-posA[i*3+2]);
  _fwd.addScaledVector(_up, -_fwd.dot(_up));
  if (_fwd.lengthSq() < 1e-9) {
    _fwd.set(0, 1, 0).cross(_up);
    if (_fwd.lengthSq() < 1e-9) _fwd.set(1, 0, 0);
  }
  _fwd.normalize();
  _right.copy(_up).cross(_fwd).normalize();
  const cy = Math.cos(lookYaw), sy = Math.sin(lookYaw);
  const cp = Math.cos(lookPitch), sp = Math.sin(lookPitch);
  _aim.copy(_fwd).multiplyScalar(cy).addScaledVector(_right, sy);
  _aim.multiplyScalar(cp).addScaledVector(_up, sp).add(_S);
  outPos.copy(_S); outAim.copy(_aim); outUp.copy(_up);
}

function updateFollow() {
  followState(_fpPos, _fpAim, _fpUp);
  camera.up.copy(_fpUp);
  camera.position.copy(_fpPos);
  camera.lookAt(_fpAim);
}

export const camTween = {
  active: false, mode: null, t0: 0, dur: 0,
  startPos:  new THREE.Vector3(),
  startQuat: new THREE.Quaternion(),
  startFov:  50,
};
const _destPos = new THREE.Vector3(), _destTgt = new THREE.Vector3(), _destUp = new THREE.Vector3();
const _qDest   = new THREE.Quaternion();
const _mLook   = new THREE.Matrix4();
const _fpPos   = new THREE.Vector3(), _fpAim = new THREE.Vector3(), _fpUp = new THREE.Vector3();
const _arcA = new THREE.Vector3(), _arcB = new THREE.Vector3(), _arcDir = new THREE.Vector3();

const easeInOutCubic = (t) => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2);

function cinematicArc(start, end, t) {
  const sa = start.length() || 1, ea = end.length() || 1;
  _arcA.copy(start).divideScalar(sa);
  _arcB.copy(end).divideScalar(ea);
  const dot   = Math.max(-1, Math.min(1, _arcA.dot(_arcB)));
  const theta = Math.acos(dot);
  if (theta < 5e-4) {
    _arcDir.lerpVectors(_arcA, _arcB, t).normalize();
  } else {
    const s = Math.sin(theta);
    _arcDir.copy(_arcA).multiplyScalar(Math.sin((1 - t) * theta) / s)
           .addScaledVector(_arcB, Math.sin(t * theta) / s);
  }
  const dist = Math.max(THREE.MathUtils.lerp(sa, ea, t), GLOBE_R * 1.1);
  return _arcDir.multiplyScalar(dist);
}

function startCamTransition(mode, dur = 900) {
  camTween.active = true;
  camTween.mode   = mode;
  camTween.t0     = performance.now();
  camTween.dur    = dur;
  camTween.startPos.copy(camera.position);
  camTween.startQuat.copy(camera.quaternion);
  camTween.startFov = camera.fov;
  controls.enabled  = false;
}

const _md = new THREE.Vector3();
function minimalCamPos(startPos, target, minDist, maxDist, out) {
  _md.copy(startPos).sub(target);
  let d = _md.length();
  if (d < 1e-6) { _md.set(0, 0, 1); d = 1; }
  _md.divideScalar(d);
  out.copy(target).addScaledVector(_md, THREE.MathUtils.clamp(d, minDist, maxDist));
}

function desiredCamState(mode, outPos, outTgt, outUp) {
  if (mode === 'earth') {
    outTgt.set(0, 0, 0); outUp.set(0, 1, 0);
    if (S.camOverrideActive) outPos.copy(camOverridePos);
    else minimalCamPos(camTween.startPos, outTgt, MODE_LIMITS.earth.min, MODE_LIMITS.earth.max, outPos);
    return 50;
  }
  _S.set(posArr[S.selIdx*3], posArr[S.selIdx*3+1], posArr[S.selIdx*3+2]);
  if (mode === 'orbit') {
    outTgt.copy(_S); outUp.set(0, 1, 0);
    if (S.camOverrideActive) { outPos.copy(camOverridePos); return 50; }
    const maxD = THREE.MathUtils.clamp(orbitSize(_S) * 2.2, 120, 2000);
    minimalCamPos(camTween.startPos, _S, MODE_LIMITS.orbit.min, maxD, outPos);
    return 50;
  }
  followState(outPos, outTgt, outUp);
  return 50;
}

function updateCamTransition() {
  if (camTween.mode !== 'earth' && S.selIdx < 0) { setCamMode('earth'); return; }
  const raw = (performance.now() - camTween.t0) / camTween.dur;
  const e   = easeInOutCubic(THREE.MathUtils.clamp(raw, 0, 1));
  const fov = desiredCamState(camTween.mode, _destPos, _destTgt, _destUp);

  camera.position.copy(cinematicArc(camTween.startPos, _destPos, e));
  _mLook.lookAt(_destPos, _destTgt, _destUp);
  _qDest.setFromRotationMatrix(_mLook);
  camera.quaternion.copy(camTween.startQuat).slerp(_qDest, e);
  camera.fov = camTween.startFov + (fov - camTween.startFov) * e;
  camera.updateProjectionMatrix();

  if (raw >= 1) finishCamTransition();
}

function finishCamTransition() {
  const mode = camTween.mode;
  camTween.active = false;
  S.camOverrideActive = false;
  if (mode !== 'follow') S.followHideIdx = -1;
  if (mode === 'follow') {
    controls.enabled = false;
    controls.target.set(0, 0, 0);
  } else if (mode === 'orbit') {
    controls.enabled = true;
    camera.up.set(0, 1, 0);
    controls.minDistance = MODE_LIMITS.orbit.min;
    controls.maxDistance = MODE_LIMITS.orbit.max;
    _S.set(posArr[S.selIdx*3], posArr[S.selIdx*3+1], posArr[S.selIdx*3+2]);
    _trackPos.copy(_S);
    controls.target.copy(_S);
    controls.update();
  } else {
    controls.enabled = true;
    camera.up.set(0, 1, 0);
    controls.minDistance = MODE_LIMITS.earth.min;
    controls.maxDistance = MODE_LIMITS.earth.max;
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function updateOrbitTrack() {
  const i = S.selIdx;
  const cx = posArr[i*3], cy = posArr[i*3+1], cz = posArr[i*3+2];
  const dx = cx - _trackPos.x, dy = cy - _trackPos.y, dz = cz - _trackPos.z;
  _trackPos.set(cx, cy, cz);
  if (dx*dx + dy*dy + dz*dz > 2500) return;
  camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
  controls.target.x  += dx; controls.target.y  += dy; controls.target.z  += dz;
}

export function syncModeButtons() {
  modesEl.querySelectorAll('button').forEach((btn) => {
    const m = btn.dataset.mode;
    btn.disabled = (m !== 'earth' && S.selIdx < 0);
    btn.classList.toggle('active', m === S.camMode);
  });
}

modesEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && !btn.disabled) setCamMode(btn.dataset.mode);
});
window.addEventListener('keydown', (e) => {
  if      (e.key === '1') setCamMode('earth');
  else if (e.key === '2') setCamMode('follow');
  else if (e.key === '3') setCamMode('orbit');
});
syncModeButtons();

export function tickCamera() {
  if (S.camMode !== 'earth' && S.selIdx < 0 && !camTween.active) setCamMode('earth');
  if (camTween.active) {
    updateCamTransition();
  } else if (S.camMode === 'follow') {
    updateFollow();
  } else {
    if (S.camMode === 'orbit') updateOrbitTrack();
    tuneRotateSpeed();
    controls.update();
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (S.camMode === 'follow' && !camTween.active) {
    followPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    renderer.domElement.setPointerCapture(e.pointerId);
    if (followPointers.size === 1) {
      followDrag = true; followLastX = e.clientX; followLastY = e.clientY;
    } else {
      followDrag = false;
      const pts = [...followPointers.values()];
      followPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (S.camMode === 'follow' && !camTween.active && followPointers.has(e.pointerId)) {
    followPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (followPointers.size >= 2) {
      const pts = [...followPointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (followPinchDist > 0) {
        camera.fov = THREE.MathUtils.clamp(camera.fov + (followPinchDist - d) * 0.07, 20, 75);
        camera.updateProjectionMatrix();
      }
      followPinchDist = d;
      return;
    }
  }
  if (!followDrag) return;
  lookYaw  -= (e.clientX - followLastX) * LOOK_SENS;
  lookPitch = THREE.MathUtils.clamp(lookPitch - (e.clientY - followLastY) * LOOK_SENS, -1.5, 1.5);
  followLastX = e.clientX; followLastY = e.clientY;
});
const endFollowDrag = (e) => {
  followPointers.delete(e.pointerId);
  if (followPointers.size < 2) followPinchDist = 0;
  if (followPointers.size === 1) {
    const pt = [...followPointers.values()][0];
    followLastX = pt.x; followLastY = pt.y; followDrag = true;
  } else if (followPointers.size === 0) {
    followDrag = false;
  }
};
renderer.domElement.addEventListener('pointerup',     endFollowDrag);
renderer.domElement.addEventListener('pointercancel', endFollowDrag);
renderer.domElement.addEventListener('wheel', (e) => {
  if (S.camMode !== 'follow' || camTween.active) return;
  e.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(e.deltaY) * 2.5, 20, 75);
  camera.updateProjectionMatrix();
}, { passive: false });
