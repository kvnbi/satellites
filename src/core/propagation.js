import * as THREE   from 'three';
import * as sat      from 'satellite.js';
import { globe, EARTH_R_KM } from './scene.js';
import { S, MAX_SATS, colArr, DOT_RGB, SELECT_RGB, posArr, posA, posB } from '../state.js';
import { applyFilters } from '../ui/filters.js';

const STEP_MS = 5000;
let tA = 0, tB = 0;

export function buildActiveSet() {
  const date = new Date();
  const gmst = sat.gstime(date);
  S.validSats = [];
  S.searchName = [];
  S.searchId = [];
  S.count = 0;
  for (const rec of S.satRecords) {
    let pv;
    try { pv = sat.propagate(rec.satrec, date); } catch { continue; }
    if (!pv?.position || typeof pv.position !== 'object') continue;
    const geo = sat.eciToGeodetic(pv.position, gmst);
    const lat = sat.degreesLat(geo.latitude);
    const lng = sat.degreesLong(geo.longitude);
    const alt = geo.height;
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(alt) || alt < -100) continue;
    if (S.count >= MAX_SATS) break;

    const i = S.count;
    const w = globe.getCoords(lat, lng, alt / EARTH_R_KM);
    posA[i*3] = posB[i*3] = w.x;
    posA[i*3+1] = posB[i*3+1] = w.y;
    posA[i*3+2] = posB[i*3+2] = w.z;
    colArr[i*3] = DOT_RGB[0]; colArr[i*3+1] = DOT_RGB[1]; colArr[i*3+2] = DOT_RGB[2];
    S.validSats.push({ meta: rec.meta, satrec: rec.satrec, lat, lng, altKm: alt });
    S.searchName.push((rec.meta.OBJECT_NAME || '').toUpperCase());
    S.searchId.push(String(rec.meta.NORAD_CAT_ID));
    S.count++;
  }
  tA = tB = Date.now();
  applyFilters();
}

function roll() {
  posA.set(posB.subarray(0, S.count * 3));
  tA = tB;
  tB = tA + STEP_MS;
  const date = new Date(tB);
  const gmst = sat.gstime(date);
  for (let i = 0; i < S.count; i++) {
    const e = S.validSats[i];
    posB[i*3] = posA[i*3]; posB[i*3+1] = posA[i*3+1]; posB[i*3+2] = posA[i*3+2];
    try {
      const pv = sat.propagate(e.satrec, date);
      if (pv?.position && typeof pv.position === 'object') {
        const geo = sat.eciToGeodetic(pv.position, gmst);
        const lat = sat.degreesLat(geo.latitude);
        const lng = sat.degreesLong(geo.longitude);
        const alt = geo.height;
        if (isFinite(lat) && isFinite(lng) && isFinite(alt)) {
          const w = globe.getCoords(lat, lng, alt / EARTH_R_KM);
          posB[i*3] = w.x; posB[i*3+1] = w.y; posB[i*3+2] = w.z;
          e.lat = lat; e.lng = lng; e.altKm = alt;
        }
      }
    } catch {}

    const c = (i === S.selIdx) ? SELECT_RGB : DOT_RGB;
    colArr[i*3] = c[0]; colArr[i*3+1] = c[1]; colArr[i*3+2] = c[2];
  }
}

export function interpolatePositions() {
  if (S.count === 0) return false;
  const now = Date.now();
  let rolled = false;
  if (now - tB > 30000) { buildActiveSet(); }
  else if (now >= tB)   { roll(); rolled = true; }
  const span = tB - tA;
  const a  = THREE.MathUtils.clamp(span > 0 ? (now - tA) / span : 0, 0, 1);
  const ia = 1 - a;
  const n  = S.count * 3;
  for (let i = 0; i < n; i++) posArr[i] = posA[i] * ia + posB[i] * a;
  return rolled;
}
