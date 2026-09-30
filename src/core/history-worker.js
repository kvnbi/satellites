import * as sat from 'satellite.js';

let records = [];
let generation = 0;
let globeRadius = 100;
let earthRadiusKm = 6371;

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    records = data.records;
    generation = data.generation;
    globeRadius = data.globeRadius;
    earthRadiusKm = data.earthRadiusKm;
    self.postMessage({ type: 'ready', generation });
    return;
  }
  if (data.type !== 'positions' || data.generation !== generation) return;

  const date = new Date(data.time);
  const gmst = sat.gstime(date);
  const positions = new Float32Array(records.length * 3);
  const altitudes = new Float32Array(records.length);
  positions.fill(NaN);
  for (let i = 0; i < records.length; i++) {
    try {
      const pv = sat.propagate(records[i], date);
      if (!pv?.position || typeof pv.position !== 'object') continue;
      const geo = sat.eciToGeodetic(pv.position, gmst);
      const lat = geo.latitude, lng = geo.longitude, alt = geo.height;
      if (!isFinite(lat) || !isFinite(lng) || !isFinite(alt) || alt < -100) continue;
      const radius = globeRadius * (1 + alt / earthRadiusKm);
      const horizontal = radius * Math.cos(lat);
      const o = i * 3;
      positions[o] = horizontal * Math.sin(lng);
      positions[o + 1] = radius * Math.sin(lat);
      positions[o + 2] = horizontal * Math.cos(lng);
      altitudes[i] = alt;
    } catch {}
  }
  self.postMessage({ type: 'positions', generation, time: data.time, offset: data.offset,
    positions, altitudes }, [positions.buffer, altitudes.buffer]);
};
