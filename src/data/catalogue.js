import * as sat from 'satellite.js';
import { S, colArr, SELECT_RGB } from '../state.js';
import { buildActiveSet } from '../core/propagation.js';
import { satMesh, initSatMesh, updateSatInstances } from '../core/sat-mesh.js';
import { setCamMode, syncModeButtons } from '../camera/modes.js';

const BASE = 'https://celestrak.org/NORAD/elements/';
const gp  = (g) => `${BASE}gp.php?GROUP=${encodeURIComponent(g)}&FORMAT=TLE`;
const sup = (f) => `${BASE}supplemental/sup-gp.php?FILE=${encodeURIComponent(f)}&FORMAT=tle`;

const SOURCES = [
  sup('starlink'), sup('oneweb'), sup('kuiper'), sup('planet'),
  sup('intelsat'), sup('ses'), sup('telesat'), sup('iridium'),
  sup('orbcomm'), sup('cpf'),
  gp('stations'), gp('last-30-days'), gp('tle-new'), gp('analyst'), gp('visual'),
  gp('active'),
  gp('weather'), gp('goes'), gp('resource'), gp('sarsat'), gp('dmc'),
  gp('tdrss'), gp('argos'), gp('spire'), gp('planet'),
  gp('geo'), gp('intelsat'), gp('ses'), gp('telesat'), gp('eutelsat'),
  gp('iridium-NEXT'), gp('orbcomm'), gp('globalstar'), gp('amateur'),
  gp('x-comm'), gp('other-comm'), gp('satnogs'),
  gp('gnss'), gp('gps-ops'), gp('glo-ops'), gp('galileo'), gp('beidou'),
  gp('sbas'), gp('nnss'), gp('musson'),
  gp('science'), gp('geodetic'), gp('engineering'), gp('education'),
  gp('military'), gp('radar'), gp('cubesat'),
  gp('fengyun-1c-debris'), gp('cosmos-2251-debris'),
  gp('cosmos-1408-debris'), gp('iridium-33-debris'),
];

async function fetchSource(url) {
  const cacheKey = 'tle:' + url;
  let text = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const body = await r.text();
      if (body && body[0] !== '<' &&
          !body.startsWith('Invalid') &&
          !body.startsWith('GP data has not updated')) {
        text = body;
        try { localStorage.setItem(cacheKey, body); } catch {}
      }
    }
  } catch {}
  if (text === null) {
    try { text = localStorage.getItem(cacheKey); } catch {}
  }
  return text ? parseTLE(text) : [];
}

function parseTLE(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out   = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const l1   = lines[i + 1];
    const l2   = lines[i + 2];
    if (l1[0] !== '1' || l2[0] !== '2') continue;
    out.push(tleToMeta(name, l1, l2));
  }
  return out;
}

function tleToMeta(name, l1, l2) {
  const norad     = parseInt(l1.substring(2, 7), 10);
  const intlDesig = l1.substring(9, 17).trim();
  const yr2       = parseInt(intlDesig.substring(0, 2), 10);
  const launchYear = isNaN(yr2) ? 'n/a'
    : (yr2 > 56 ? '19' + String(yr2).padStart(2,'0') : '20' + String(yr2).padStart(2,'0'));

  const inclination  = parseFloat(l2.substring(8,  16));
  const eccentricity = parseFloat('0.' + l2.substring(26, 33));
  const meanMotion   = parseFloat(l2.substring(52, 63));

  const u    = name.toUpperCase();
  const type = u.includes('DEB') || u.includes('DEBRIS') ? 'DEB'
             : u.includes('R/B') || u.includes('ROCKET') ? 'R/B' : 'PAY';

  return {
    OBJECT_NAME:  name,
    NORAD_CAT_ID: norad,
    OBJECT_TYPE:  type,
    INCLINATION:  inclination,
    ECCENTRICITY: eccentricity,
    MEAN_MOTION:  meanMotion,
    LAUNCH_DATE:  launchYear,
    TLE_LINE1:    l1,
    TLE_LINE2:    l2,
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function buildCatalogue(groups) {
  const seen = new Set();
  const records = [];
  for (const group of groups) {
    for (const obj of group) {
      if (seen.has(obj.NORAD_CAT_ID)) continue;
      seen.add(obj.NORAD_CAT_ID);
      try {
        const satrec = sat.twoline2satrec(obj.TLE_LINE1, obj.TLE_LINE2);
        if (satrec.error === 0) records.push({ meta: obj, satrec });
      } catch {}
    }
  }
  if (records.length === 0) return false;
  const prevNorad = (S.selIdx >= 0 && S.validSats[S.selIdx])
    ? S.validSats[S.selIdx].meta.NORAD_CAT_ID : -1;
  S.satRecords = records;
  S.selIdx = -1;
  buildActiveSet();
  if (prevNorad >= 0) {
    const ni = S.searchId.indexOf(String(prevNorad));
    if (ni >= 0) {
      S.selIdx = ni;
      colArr[ni*3] = SELECT_RGB[0]; colArr[ni*3+1] = SELECT_RGB[1]; colArr[ni*3+2] = SELECT_RGB[2];
    }
  }
  if (!satMesh) initSatMesh();
  else { satMesh.count = S.count; satMesh.instanceColor.needsUpdate = true; updateSatInstances(); }
  if (S.selIdx >= 0) syncModeButtons();
  else if (S.camMode !== 'earth') setCamMode('earth'); else syncModeButtons();
  return true;
}

const REFRESH_MS = 6 * 3600 * 1000;
const STAMP_KEY  = 'tle:lastFetch';
const lastFetchAge = () => {
  try { return Date.now() - (parseInt(localStorage.getItem(STAMP_KEY), 10) || 0); }
  catch { return Infinity; }
};

export async function loadAll() {
  const el    = document.getElementById('loading');
  const stamp = () => { try { localStorage.setItem(STAMP_KEY, String(Date.now())); } catch {} };

  const cached = SOURCES.map(url => {
    try { const t = localStorage.getItem('tle:' + url); return t ? parseTLE(t) : []; }
    catch { return []; }
  });
  const haveCache = buildCatalogue(cached);
  if (haveCache) el.style.display = 'none';

  if (haveCache && lastFetchAge() < REFRESH_MS) return;

  if (haveCache) stamp();
  else el.textContent = `Fetching satellite data… (0/${SOURCES.length})`;
  let done = 0;
  const fresh = await mapLimit(SOURCES, 6, async (url) => {
    const r = await fetchSource(url);
    done++;
    if (!haveCache) el.textContent = `Fetching satellite data… (${done}/${SOURCES.length})`;
    return r;
  });

  const loaded = fresh.filter(g => g.length).length;
  if (loaded) buildCatalogue(fresh);
  if (loaded >= SOURCES.length * 0.8) stamp();

  if (satMesh) el.style.display = 'none';
  else {
    el.innerHTML = 'No satellite data available (offline, no cache). <button id="retry-load">Retry</button>';
    document.getElementById('retry-load').onclick = loadAll;
  }
}
