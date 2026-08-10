import * as sat from 'satellite.js';
import { S } from '../state.js';
import { esc } from '../utils.js';

export const infoEl = document.getElementById('info');

const TYPE_LABELS = { PAY: 'Payload', DEB: 'Debris', 'R/B': 'Rocket body', UNK: 'Unknown', TBA: 'TBA' };

function row(label, val) {
  return `<div class="row"><span class="lbl">${label}</span><span>${esc(val)}</span></div>`;
}

function liveRow(label, id, val) {
  return `<div class="row"><span class="lbl">${label}</span><span id="${id}">${esc(val)}</span></div>`;
}

function tleEpoch(l1) {
  const yy  = parseInt(l1.substring(18, 20), 10);
  const doy = parseFloat(l1.substring(20, 32));
  if (!isFinite(yy) || !isFinite(doy)) return null;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86400000);
  const p = n => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} `
              + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
  const ageH = (Date.now() - d.getTime()) / 3600000;
  const age  = ageH < 1  ? Math.max(0, Math.round(ageH * 60)) + ' min ago'
             : ageH < 48 ? ageH.toFixed(1) + ' h ago'
             :             (ageH / 24).toFixed(1) + ' d ago';
  return { stamp, age };
}

let liveEls = null;

export function renderInfo(s) {
  const m      = s.meta;
  const period = m.MEAN_MOTION > 0
    ? (1440 / Number(m.MEAN_MOTION)).toFixed(1) + ' min' : 'n/a';
  const ep = tleEpoch(m.TLE_LINE1);
  infoEl.classList.remove('expanded');
  infoEl.innerHTML =
    `<div class="sat-name">${esc(m.OBJECT_NAME)}</div>` +
    liveRow('Altitude', 'live-alt',   '…') +
    liveRow('Speed',    'live-speed', '…') +
    liveRow('Lat',      'live-lat',   '…') +
    liveRow('Lng',      'live-lng',   '…') +
    `<div class="info-extra">` +
      row('NORAD',        m.NORAD_CAT_ID) +
      row('Type',         TYPE_LABELS[m.OBJECT_TYPE] ?? m.OBJECT_TYPE ?? 'n/a') +
      row('Inclination',  Number(m.INCLINATION).toFixed(1) + '°') +
      row('Period',       period) +
      row('Eccentricity', Number(m.ECCENTRICITY).toFixed(5)) +
      row('Launched',     m.LAUNCH_DATE || 'n/a') +
      (ep ?
        `<div class="row tle-full"><span class="lbl">TLE epoch</span><span>${esc(ep.stamp)}</span></div>` +
        `<div class="row tle-full"><span class="lbl lbl-ghost">TLE epoch</span><span>${esc(ep.age)}</span></div>` +
        `<div class="row tle-mobile"><span class="lbl">TLE epoch</span><span>${esc(ep.age)}</span></div>`
        : '') +
      `<div class="tle">${esc(m.TLE_LINE1)}\n${esc(m.TLE_LINE2)}</div>` +
    `</div>` +
    `<button class="info-expand-btn">▾ More</button>`;

  infoEl.querySelector('.info-expand-btn').addEventListener('click', () => {
    const expanded = infoEl.classList.toggle('expanded');
    infoEl.querySelector('.info-expand-btn').textContent = expanded ? '▴ Less' : '▾ More';
  });

  liveEls = {
    alt:   infoEl.querySelector('#live-alt'),
    speed: infoEl.querySelector('#live-speed'),
    lat:   infoEl.querySelector('#live-lat'),
    lng:   infoEl.querySelector('#live-lng'),
  };
  infoEl.style.display = 'block';
  updateLiveInfo();
}

function updateLiveInfo() {
  if (S.selIdx < 0 || !liveEls) return;
  const e = S.validSats[S.selIdx];
  if (!e) return;

  const now = new Date();
  let pv;
  try { pv = sat.propagate(e.satrec, now); } catch { return; }
  const r = pv && pv.position, v = pv && pv.velocity;
  if (!r || !v || typeof r !== 'object' || typeof v !== 'object') return;

  const gmst  = sat.gstime(now);
  const geo   = sat.eciToGeodetic(r, gmst);
  const lat   = sat.degreesLat(geo.latitude);
  const lng   = sat.degreesLong(geo.longitude);
  const alt   = geo.height;
  const speed = Math.hypot(v.x, v.y, v.z);

  if (isFinite(lat) && isFinite(lng)) {
    liveEls.lat.textContent = lat.toFixed(4) + '°';
    liveEls.lng.textContent = lng.toFixed(4) + '°';
    e.lat = lat; e.lng = lng;
  }
  if (isFinite(alt)) {
    liveEls.alt.textContent = alt.toFixed(0) + ' km';
    e.altKm = alt;
  }
  if (isFinite(speed)) {
    const kmh = speed * 3600;
    const kmhStr = kmh.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' km/h';
    liveEls.speed.innerHTML =
      `<span class="speed-kms">${speed.toFixed(2)} km/s · </span>${kmhStr}`;
  }
}

let lastLiveMs = 0;
export function tickLiveInfo(tnow) {
  if (tnow - lastLiveMs >= 100) { lastLiveMs = tnow; updateLiveInfo(); }
}
