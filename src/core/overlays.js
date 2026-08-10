import * as THREE        from 'three';
import * as sat           from 'satellite.js';
import { Line2 }          from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry }   from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial }   from 'three/examples/jsm/lines/LineMaterial.js';
import { scene, globe, GLOBE_R, EARTH_R_KM, viewportHeight } from './scene.js';
import { S, posArr } from '../state.js';

const orbitGeom = new LineGeometry();
const orbitMat  = new LineMaterial({
  color: 0x22ff66, transparent: true, opacity: 0.7,
  linewidth: 2.0, worldUnits: false,
});
orbitMat.resolution.set(window.innerWidth, viewportHeight());
const orbitLine = new Line2(orbitGeom, orbitMat);
orbitLine.visible = false;
orbitLine.frustumCulled = false;
scene.add(orbitLine);

window.addEventListener('resize', () => {
  orbitMat.resolution.set(window.innerWidth, viewportHeight());
});

let orbitGmst0   = 0;
let orbitBasePts = null;

const nadirArr  = new Float32Array(6);
const nadirLine = new THREE.Line(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(nadirArr, 3)),
  new THREE.LineBasicMaterial({ color: 0x22ff66, transparent: true, opacity: 0.6 })
);
nadirLine.visible = false;
nadirLine.frustumCulled = false;
scene.add(nadirLine);

const ORBIT_STEPS = 256;
const MU_KM = 398600.8;

export function buildOrbit() {
  if (S.selIdx < 0 || S.selIdx >= S.count) { orbitLine.visible = false; return; }
  const satrec = S.validSats[S.selIdx].satrec;

  const t0    = Date.now();
  const gmst0 = sat.gstime(new Date(t0));
  let pv;
  try { pv = sat.propagate(satrec, new Date(t0)); } catch { orbitLine.visible = false; return; }
  const r = pv?.position, v = pv?.velocity;
  if (!r || !v || typeof r !== 'object' || typeof v !== 'object') { orbitLine.visible = false; return; }

  const rmag  = Math.hypot(r.x, r.y, r.z);
  const v2    = v.x*v.x + v.y*v.y + v.z*v.z;
  const rdotv = r.x*v.x + r.y*v.y + r.z*v.z;
  const a     = 1 / (2 / rmag - v2 / MU_KM);
  const k     = v2 - MU_KM / rmag;
  const ex = (k*r.x - rdotv*v.x) / MU_KM;
  const ey = (k*r.y - rdotv*v.y) / MU_KM;
  const ez = (k*r.z - rdotv*v.z) / MU_KM;
  const e  = Math.hypot(ex, ey, ez);
  if (!isFinite(a) || a <= 0 || !(e < 1)) { orbitLine.visible = false; return; }
  const b  = a * Math.sqrt(1 - e*e);

  const hx = r.y*v.z - r.z*v.y, hy = r.z*v.x - r.x*v.z, hz = r.x*v.y - r.y*v.x;
  const hmag = Math.hypot(hx, hy, hz);
  let Px, Py, Pz;
  if (e > 1e-8) { Px = ex/e; Py = ey/e; Pz = ez/e; }
  else          { Px = r.x/rmag; Py = r.y/rmag; Pz = r.z/rmag; }
  const Hx = hx/hmag, Hy = hy/hmag, Hz = hz/hmag;
  const Qx = Hy*Pz - Hz*Py, Qy = Hz*Px - Hx*Pz, Qz = Hx*Py - Hy*Px;

  const flat = [];
  let w0 = null;
  for (let i = 0; i < ORBIT_STEPS; i++) {
    const E  = (i / ORBIT_STEPS) * 2 * Math.PI;
    const xc = a * (Math.cos(E) - e);
    const yc = b * Math.sin(E);
    const X = xc*Px + yc*Qx, Y = xc*Py + yc*Qy, Z = xc*Pz + yc*Qz;
    const geo = sat.eciToGeodetic({ x: X, y: Y, z: Z }, gmst0);
    const lat = sat.degreesLat(geo.latitude);
    const lng = sat.degreesLong(geo.longitude);
    const alt = geo.height;
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(alt)) continue;
    const w = globe.getCoords(lat, lng, alt / EARTH_R_KM);
    if (!w0) w0 = w;
    flat.push(w.x, w.y, w.z);
  }
  if (flat.length < 6 || !w0) { orbitLine.visible = false; return; }
  flat.push(w0.x, w0.y, w0.z);

  orbitGeom.setPositions(flat);
  orbitBasePts = flat;
  orbitGmst0   = gmst0;
  orbitLine.rotation.y = 0;
  orbitLine.visible = (S.camMode !== 'follow');
}

export function updateNadirLine() {
  if (S.selIdx < 0 || S.selIdx >= S.count) { nadirLine.visible = false; return; }
  const i  = S.selIdx;
  const px = posArr[i*3], py = posArr[i*3+1], pz = posArr[i*3+2];
  const len = Math.hypot(px, py, pz) || 1;
  const s  = GLOBE_R / len;
  nadirArr[0] = px * s; nadirArr[1] = py * s; nadirArr[2] = pz * s;
  nadirArr[3] = px;     nadirArr[4] = py;     nadirArr[5] = pz;
  nadirLine.geometry.attributes.position.needsUpdate = true;
  nadirLine.visible = (S.camMode !== 'follow');
}

export function hideSelectionOverlays() {
  orbitLine.visible = false;
  nadirLine.visible = false;
}

export function tickOrbitSpin() {
  orbitLine.rotation.y = -(sat.gstime(new Date()) - orbitGmst0);
}

export function orbitSize(satPos) {
  if (!(orbitLine.visible && orbitBasePts && orbitBasePts.length >= 9)) return satPos.length();
  const ry = orbitLine.rotation.y, cs = Math.cos(ry), sn = Math.sin(ry);
  const n  = orbitBasePts.length / 3;
  const v  = new THREE.Vector3();
  const rot = (idx) => {
    const x = orbitBasePts[idx], y = orbitBasePts[idx+1], z = orbitBasePts[idx+2];
    return v.set(x*cs + z*sn, y, -x*sn + z*cs);
  };
  const C = new THREE.Vector3();
  for (let idx = 0; idx < orbitBasePts.length; idx += 3) C.add(rot(idx));
  C.divideScalar(n);
  let size = 0;
  for (let idx = 0; idx < orbitBasePts.length; idx += 3) size = Math.max(size, rot(idx).distanceTo(C));
  return size;
}
