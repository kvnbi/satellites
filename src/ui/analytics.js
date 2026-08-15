import * as sat from 'satellite.js';
import { S } from '../state.js';

const anEl       = document.getElementById('analytics');
const anHead     = document.getElementById('an-head');
const anTabsEl   = document.getElementById('an-tabs');
const anReadEl   = document.getElementById('an-read');
const anDataEl   = document.getElementById('an-data');
const anWindowEl = document.getElementById('an-window');
const anCanvas   = document.getElementById('an-canvas');
const anCtx      = anCanvas.getContext('2d');
const anBackdrop  = document.getElementById('an-backdrop');
const anExpandBtn = document.getElementById('an-expand');
const panelStackEl = document.getElementById('panelStack');

let anOpen = false;
let anTab  = 'track';
let anWindowVal = 'orbit';
let anHoverX = -1, anHoverY = -1, anHovering = false;
let anNeedsDraw = false, anLastDraw = 0;

const AN_MAX = 2048;
let   anN    = 400;
const anT   = new Float64Array(AN_MAX);
const anAlt = new Float32Array(AN_MAX);
const anSpd = new Float32Array(AN_MAX);
const anLat = new Float32Array(AN_MAX);
const anLng = new Float32Array(AN_MAX);
let anT0 = 0, anPeriodMs = 0, anValid = false;
let anAltMin = 0, anAltMax = 0, anSpdMin = 0, anSpdMax = 0;

const anEarthImg = new Image();
anEarthImg.onload = () => { if (anOpen && anTab === 'track') { anNeedsDraw = true; } };
anEarthImg.src = '/earth-blue-marble.jpg';

const anRootStyle  = getComputedStyle(document.documentElement);
const AN_FONT_UI   = anRootStyle.getPropertyValue('--font-ui').trim();
const AN_FONT_MONO = anRootStyle.getPropertyValue('--font-mono').trim();

const AN_GRID = 'rgba(255,255,255,0.07)';
const AN_AXIS = '#5b616e';
const AN_LINE = '#9aa3b6';
const AN_MARK = '#33ff73';
const EARTH_EQ_KM = 6378.137;

function anPeriodMsFor(e) {
  const mm = e && e.meta && Number(e.meta.MEAN_MOTION);
  if (mm > 0) return 86400000 / mm;
  const no = e && e.satrec && (e.satrec.no || e.satrec.no_kozai);
  if (no > 0) return (2 * Math.PI / no) * 60000;
  return 0;
}
function anWindowMsFor(e) {
  if (anWindowVal === 'orbit') return anPeriodMsFor(e);
  const ms = Number(anWindowVal);
  return ms > 0 ? ms : anPeriodMsFor(e);
}
function anFmtOffset(ms) {
  const s = ms < 0 ? '-' : '+', a = Math.abs(ms);
  if (a < 5400000)   return s + Math.round(a / 60000) + 'm';
  if (a < 172800000) return s + (a / 3600000).toFixed(1) + 'h';
  return s + (a / 86400000).toFixed(1) + 'd';
}

function anComputeProfile() {
  anValid = false;
  if (S.selIdx < 0) return;
  const e = S.validSats[S.selIdx];
  if (!e || !e.satrec) return;
  const periodMs = anWindowMsFor(e);
  if (!(periodMs > 0)) return;
  const orbitMs = anPeriodMsFor(e) || periodMs;
  anN = Math.max(300, Math.min(AN_MAX, Math.round(periodMs / orbitMs * 20)));
  const t0 = Date.now() - periodMs / 2;
  let aMin = Infinity, aMax = -Infinity, sMin = Infinity, sMax = -Infinity, good = 0;
  for (let i = 0; i < anN; i++) {
    const dt = (i / (anN - 1)) * periodMs;
    const d  = new Date(t0 + dt);
    anT[i] = dt; anAlt[i] = NaN; anSpd[i] = NaN; anLat[i] = NaN; anLng[i] = NaN;
    let pv; try { pv = sat.propagate(e.satrec, d); } catch { continue; }
    const r = pv && pv.position, v = pv && pv.velocity;
    if (!r || !v || typeof r !== 'object' || typeof v !== 'object') continue;
    const gmst = sat.gstime(d);
    const geo  = sat.eciToGeodetic(r, gmst);
    const lat  = sat.degreesLat(geo.latitude);
    const lng  = sat.degreesLong(geo.longitude);
    const alt  = geo.height;
    const spd  = Math.hypot(v.x, v.y, v.z);
    if (isFinite(alt)) { anAlt[i] = alt; aMin = Math.min(aMin, alt); aMax = Math.max(aMax, alt); }
    if (isFinite(spd)) { anSpd[i] = spd; sMin = Math.min(sMin, spd); sMax = Math.max(sMax, spd); }
    if (isFinite(lat) && isFinite(lng)) { anLat[i] = lat; anLng[i] = lng; }
    good++;
  }
  if (good < 16 || !isFinite(aMin) || !isFinite(sMin)) return;
  const aPad = Math.max(1, (aMax - aMin) * 0.12), sPad = Math.max(0.01, (sMax - sMin) * 0.12);
  anAltMin = aMin - aPad; anAltMax = aMax + aPad;
  anSpdMin = sMin - sPad; anSpdMax = sMax + sPad;
  anT0 = t0; anPeriodMs = periodMs; anValid = true;
}

function anNowFrac() {
  if (!anValid || anPeriodMs <= 0) return 0.5;
  return Math.max(0, Math.min(1, (Date.now() - anT0) / anPeriodMs));
}
function anSampleAt(arr, frac) {
  const x = frac * (anN - 1);
  const i = Math.max(0, Math.min(anN - 2, Math.floor(x))), f = x - i;
  const a = arr[i], b = arr[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a + (b - a) * f;
}

function anResizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = anCanvas.clientWidth || 320, h = anCanvas.clientHeight || 168;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (anCanvas.width !== W || anCanvas.height !== H) { anCanvas.width = W; anCanvas.height = H; }
  anCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function anEmpty(w, h, msg) {
  anCtx.fillStyle = '#6a7180';
  anCtx.font = `11px ${AN_FONT_UI}`;
  anCtx.textAlign = 'center'; anCtx.textBaseline = 'middle';
  anCtx.fillText(msg, w / 2, h / 2);
}

function anDraw() {
  if (!anOpen) return;
  const { w, h } = anResizeCanvas();
  anCtx.clearRect(0, 0, w, h);
  if (S.selIdx < 0) { anEmpty(w, h, 'Select a satellite'); anReadEl.innerHTML = ''; return; }
  if (!anValid)   { anEmpty(w, h, 'No orbit data for this object'); anReadEl.innerHTML = ''; return; }
  if      (anTab === 'track') anDrawTrack(w, h);
  else if (anTab === 'alt')   anDrawSeries(w, h, anAlt, anAltMin, anAltMax, 'km',   0, { apo: true });
  else if (anTab === 'vel')   anDrawSeries(w, h, anSpd, anSpdMin, anSpdMax, 'km/s', 2, {});
  else if (anTab === 'lat')   anDrawSeries(w, h, anLat, -95,  95,  '°', 1, { fixed: true });
  else                        anDrawSeries(w, h, anLng, -190, 190, '°', 1, { fixed: true, wrap: true });
}

function anDrawSeries(w, h, arr, ymin, ymax, unit, dec, opts) {
  const padL = 46, padR = 10, padT = 12, padB = 18;
  const pw = w - padL - padR, ph = h - padT - padB;
  const span = (ymax - ymin) || 1;
  const X = (i) => padL + (i / (anN - 1)) * pw;
  const Y = (v) => padT + (1 - (v - ymin) / span) * ph;
  const nf = anNowFrac(), nowMs = Date.now();

  anCtx.fillStyle = 'rgba(255,255,255,0.028)';
  anCtx.fillRect(padL, padT, nf * pw, ph);

  anCtx.font = `9px ${AN_FONT_MONO}`;
  anCtx.lineWidth = 1; anCtx.textBaseline = 'middle'; anCtx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const val = ymax - (g / 4) * span, yy = Y(val);
    anCtx.strokeStyle = AN_GRID;
    anCtx.beginPath(); anCtx.moveTo(padL, yy); anCtx.lineTo(padL + pw, yy); anCtx.stroke();
    anCtx.fillStyle = AN_AXIS; anCtx.fillText(val.toFixed(dec), padL - 5, yy);
  }
  anCtx.textAlign = 'center'; anCtx.textBaseline = 'top';
  for (let g = 0; g <= 4; g++) {
    const fr = g / 4, xx = padL + fr * pw;
    anCtx.strokeStyle = AN_GRID;
    anCtx.beginPath(); anCtx.moveTo(xx, padT); anCtx.lineTo(xx, padT + ph); anCtx.stroke();
    anCtx.fillStyle = AN_AXIS;
    anCtx.fillText(anFmtOffset(anT0 + fr * anPeriodMs - nowMs), xx, padT + ph + 4);
  }

  anCtx.beginPath();
  let started = false, firstX = 0, lastX = 0, prev = null;
  for (let i = 0; i < anN; i++) {
    const v = arr[i]; if (!isFinite(v)) { prev = null; continue; }
    const x = X(i), y = Y(v);
    const brk = opts.wrap && prev !== null && Math.abs(v - prev) > 180;
    if (!started || brk) { anCtx.moveTo(x, y); if (!started) { started = true; firstX = x; } }
    else anCtx.lineTo(x, y);
    prev = v; lastX = x;
  }
  anCtx.strokeStyle = AN_LINE; anCtx.lineWidth = 1.6; anCtx.lineJoin = 'round'; anCtx.stroke();
  if (started && !opts.wrap) {
    const grad = anCtx.createLinearGradient(0, padT, 0, padT + ph);
    grad.addColorStop(0, 'rgba(154,163,182,0.22)'); grad.addColorStop(1, 'rgba(154,163,182,0)');
    anCtx.lineTo(lastX, padT + ph); anCtx.lineTo(firstX, padT + ph); anCtx.closePath();
    anCtx.fillStyle = grad; anCtx.fill();
  }

  let iMin = -1, iMax = -1, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < anN; i++) { const v = arr[i]; if (!isFinite(v)) continue;
    if (v < vMin) { vMin = v; iMin = i; } if (v > vMax) { vMax = v; iMax = i; } }
  if (!opts.fixed) {
    anCtx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const ix of [iMin, iMax]) { if (ix < 0) continue;
      anCtx.beginPath(); anCtx.arc(X(ix), Y(arr[ix]), 2.2, 0, 6.283); anCtx.fill(); }
  }

  const cv = anSampleAt(arr, nf), cx = padL + nf * pw;
  anCtx.strokeStyle = 'rgba(51,255,115,0.5)'; anCtx.lineWidth = 1;
  anCtx.beginPath(); anCtx.moveTo(cx, padT); anCtx.lineTo(cx, padT + ph); anCtx.stroke();
  if (isFinite(cv)) { anCtx.fillStyle = AN_MARK; anCtx.beginPath(); anCtx.arc(cx, Y(cv), 3.2, 0, 6.283); anCtx.fill(); }

  let hov = null;
  if (anHovering && anHoverX >= padL && anHoverX <= padL + pw && anHoverY >= padT && anHoverY <= padT + ph) {
    const i = Math.max(0, Math.min(anN - 1, Math.round((anHoverX - padL) / pw * (anN - 1))));
    const v = arr[i];
    if (isFinite(v)) {
      anCtx.strokeStyle = 'rgba(255,255,255,0.25)';
      anCtx.beginPath(); anCtx.moveTo(X(i), padT); anCtx.lineTo(X(i), padT + ph); anCtx.stroke();
      anCtx.fillStyle = '#e8ecf2'; anCtx.beginPath(); anCtx.arc(X(i), Y(v), 2.6, 0, 6.283); anCtx.fill();
      hov = { off: anT0 + anT[i] - nowMs, val: v };
    }
  }

  const nowS = isFinite(cv) ? cv.toFixed(dec) : 'n/a';
  let html = `now <b>${nowS} ${unit}</b>`;
  if (iMax >= 0) html += ` · ${opts.apo ? 'apogee' : 'max'} ${vMax.toFixed(dec)}`;
  if (iMin >= 0) html += ` · ${opts.apo ? 'perigee' : 'min'} ${vMin.toFixed(dec)}`;
  if (hov) html += ` · <span style="color:#aeb6c5">${anFmtOffset(hov.off)} ${hov.val.toFixed(dec)} ${unit}</span>`;
  anReadEl.innerHTML = html;
}

function anDrawTrack(w, h) {
  const pad = 8, pw = w - pad * 2, ph = h - pad * 2;
  const MX = (lng) => pad + ((lng + 180) / 360) * pw;
  const MY = (lat) => pad + ((90 - lat) / 180) * ph;

  if (anEarthImg.complete && anEarthImg.naturalWidth > 0) {
    anCtx.save();
    anCtx.globalAlpha = 0.8;
    anCtx.drawImage(anEarthImg, pad, pad, pw, ph);
    anCtx.restore();
    anCtx.fillStyle = 'rgba(0,0,0,0.18)';
    anCtx.fillRect(pad, pad, pw, ph);
  }

  anCtx.strokeStyle = 'rgba(255,255,255,0.18)'; anCtx.lineWidth = 1;
  anCtx.strokeRect(pad, pad, pw, ph);
  anCtx.strokeStyle = 'rgba(255,255,255,0.10)';
  for (let lng = -120; lng <= 120; lng += 60) { const x = MX(lng);
    anCtx.beginPath(); anCtx.moveTo(x, pad); anCtx.lineTo(x, pad + ph); anCtx.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { const y = MY(lat);
    anCtx.beginPath(); anCtx.moveTo(pad, y); anCtx.lineTo(pad + pw, y); anCtx.stroke(); }
  anCtx.strokeStyle = 'rgba(255,255,255,0.22)';
  anCtx.beginPath(); anCtx.moveTo(pad, MY(0)); anCtx.lineTo(pad + pw, MY(0)); anCtx.stroke();

  const drawSeg = (lo, hi, style, width) => {
    anCtx.strokeStyle = style; anCtx.lineWidth = width; anCtx.lineJoin = 'round';
    anCtx.beginPath();
    let prevLng = null, pen = false;
    for (let i = lo; i <= hi; i++) {
      const lat = anLat[i], lng = anLng[i];
      if (!isFinite(lat) || !isFinite(lng)) { pen = false; continue; }
      const x = MX(lng), y = MY(lat);
      if (!pen || (prevLng !== null && Math.abs(lng - prevLng) > 180)) { anCtx.moveTo(x, y); pen = true; }
      else anCtx.lineTo(x, y);
      prevLng = lng;
    }
    anCtx.stroke();
  };
  const nf = anNowFrac(), mid = Math.max(0, Math.min(anN - 1, Math.round(nf * (anN - 1))));
  drawSeg(0, mid, 'rgba(154,163,182,0.40)', 1.2);
  drawSeg(mid, anN - 1, AN_LINE, 1.5);

  const clat = anSampleAt(anLat, nf), clng = anSampleAt(anLng, nf);
  if (isFinite(clat) && isFinite(clng)) {
    const x = MX(clng), y = MY(clat);
    anCtx.fillStyle = AN_MARK; anCtx.beginPath(); anCtx.arc(x, y, 3.2, 0, 6.283); anCtx.fill();
  }

  let hov = null;
  if (anHovering && anHoverX >= pad && anHoverX <= pad + pw && anHoverY >= pad && anHoverY <= pad + ph) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < anN; i++) { const lat = anLat[i], lng = anLng[i];
      if (!isFinite(lat) || !isFinite(lng)) continue;
      const dx = MX(lng) - anHoverX, dy = MY(lat) - anHoverY, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; } }
    if (best >= 0 && bestD < 18 * 18) {
      anCtx.strokeStyle = 'rgba(255,255,255,0.5)'; anCtx.lineWidth = 1;
      anCtx.beginPath(); anCtx.arc(MX(anLng[best]), MY(anLat[best]), 4, 0, 6.283); anCtx.stroke();
      hov = { lat: anLat[best], lng: anLng[best], off: anT0 + anT[best] - Date.now() };
    }
  }

  const m = S.validSats[S.selIdx] && S.validSats[S.selIdx].meta;
  const latS = isFinite(clat) ? clat.toFixed(1) : 'n/a', lngS = isFinite(clng) ? clng.toFixed(1) : 'n/a';
  let html = `lat <b>${latS}°</b> lng <b>${lngS}°</b> · ${anFmtOffset(-anPeriodMs / 2)}…${anFmtOffset(anPeriodMs / 2)}`;
  if (m) html += ` · incl ${Number(m.INCLINATION).toFixed(1)}°`;
  if (hov) html += ` · <span style="color:#aeb6c5">${anFmtOffset(hov.off)} ${hov.lat.toFixed(1)}°, ${hov.lng.toFixed(1)}°</span>`;
  anReadEl.innerHTML = html;
}

function anUpdateData() {
  if (!anOpen || S.selIdx < 0) return;
  const e = S.validSats[S.selIdx]; if (!e || !e.satrec) { anDataEl.innerHTML = ''; return; }
  const sr = e.satrec, now = new Date();
  let pv; try { pv = sat.propagate(sr, now); } catch { return; }
  const r = pv && pv.position, v = pv && pv.velocity;
  if (!r || !v || typeof r !== 'object' || typeof v !== 'object') return;
  const gmst = sat.gstime(now), geo = sat.eciToGeodetic(r, gmst);
  const lat = sat.degreesLat(geo.latitude), lng = sat.degreesLong(geo.longitude), alt = geo.height;
  const spd = Math.hypot(v.x, v.y, v.z), rmag = Math.hypot(r.x, r.y, r.z);
  const climb = (r.x * v.x + r.y * v.y + r.z * v.z) / rmag;
  const Re = 6371, foot = alt > 0 ? Re * Math.acos(Re / (Re + alt)) : 0;
  const periodMin = anPeriodMsFor(e) / 60000, revs = periodMin > 0 ? 1440 / periodMin : 0;
  const deg = 180 / Math.PI;
  const incl = sr.inclo * deg, raan = sr.nodeo * deg, argp = sr.argpo * deg, ma = sr.mo * deg;
  const a = sr.a * EARTH_EQ_KM, apo = sr.alta * EARTH_EQ_KM, per = sr.altp * EARTH_EQ_KM;

  const cell = (l, val) => `<div class="an-cell"><span>${l}</span><b>${val}</b></div>`;
  anDataEl.innerHTML =
    cell('Latitude',    isFinite(lat) ? lat.toFixed(3) + '°' : 'n/a') +
    cell('Longitude',   isFinite(lng) ? lng.toFixed(3) + '°' : 'n/a') +
    cell('Altitude',    isFinite(alt) ? alt.toFixed(1) + ' km' : 'n/a') +
    cell('Geo range',   rmag.toFixed(0) + ' km') +
    cell('Speed',       spd.toFixed(3) + ' km/s') +
    cell('Climb',       (climb >= 0 ? '+' : '') + climb.toFixed(3) + ' km/s') +
    cell('Footprint',   foot.toFixed(0) + ' km') +
    cell('Revs/day',    revs.toFixed(2)) +
    cell('Apogee',      apo.toFixed(0) + ' km') +
    cell('Perigee',     per.toFixed(0) + ' km') +
    cell('Period',      periodMin.toFixed(1) + ' min') +
    cell('Semi-major',  a.toFixed(0) + ' km') +
    cell('Inclination', incl.toFixed(2) + '°') +
    cell('Eccentr.',    sr.ecco.toFixed(5)) +
    cell('RAAN',        raan.toFixed(2) + '°') +
    cell('Arg perigee', argp.toFixed(2) + '°') +
    cell('Mean anom',   ma.toFixed(2) + '°') +
    cell('Drag B*',     sr.bstar.toExponential(2));
}

export function anOnSelect() {
  anEl.style.display = 'block';
  if (anOpen) { anComputeProfile(); anNeedsDraw = true; anDraw(); anUpdateData(); }
  else anValid = false;
}
export function anOnDeselect() {
  anEl.style.display = 'none';
  anValid = false;
  anHovering = false;
  anDataEl.innerHTML = '';
}

function anSetExpanded(on) {
  anEl.classList.toggle('expanded', on);
  anBackdrop.classList.toggle('active', on);
  if (on) {
    document.body.appendChild(anEl);
  } else {
    panelStackEl.appendChild(anEl);
  }
  anNeedsDraw = true; anDraw();
}

anExpandBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  anSetExpanded(!anEl.classList.contains('expanded'));
});
anBackdrop.addEventListener('click', () => anSetExpanded(false));

anHead.addEventListener('click', () => {
  anOpen = !anOpen;
  anEl.classList.toggle('open', anOpen);
  if (!anOpen) anSetExpanded(false);
  if (anOpen && S.selIdx >= 0) { anComputeProfile(); anNeedsDraw = true; anDraw(); anUpdateData(); }
});
anTabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.an-tab'); if (!b) return;
  anTab = b.dataset.tab;
  anTabsEl.querySelectorAll('.an-tab').forEach(t => t.classList.toggle('active', t === b));
  anNeedsDraw = true; anDraw();
});
anWindowEl.addEventListener('change', () => {
  anWindowVal = anWindowEl.value;
  if (anOpen && S.selIdx >= 0) { anComputeProfile(); anNeedsDraw = true; anDraw(); }
});
anCanvas.addEventListener('pointermove', (e) => {
  const r = anCanvas.getBoundingClientRect();
  anHoverX = e.clientX - r.left; anHoverY = e.clientY - r.top; anHovering = true; anNeedsDraw = true;
});
anCanvas.addEventListener('pointerleave', () => { anHovering = false; anNeedsDraw = true; });
window.addEventListener('resize', () => { if (anOpen) { anNeedsDraw = true; anDraw(); } });

export function isAnalyticsExpanded() {
  return anEl.classList.contains('expanded');
}
export function collapseAnalyticsExpanded() {
  anSetExpanded(false);
}

export function tickAnalytics(tnow) {
  if (!anOpen) return;
  if (anValid && tnow - anT0 >= anPeriodMs) anComputeProfile();
  if (anNeedsDraw || tnow - anLastDraw >= 200) {
    anLastDraw = tnow; anNeedsDraw = false; anDraw(); anUpdateData();
  }
}
