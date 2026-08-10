import { S, visArr } from '../state.js';
import { deselectCurrent } from './selection.js';
import { renderFeatured } from './featured.js';

const filterState = {
  type:   { pay: true, rb: true, deb: true },
  regime: { leo: true, meo: true, geo: true, heo: true },
  altMin: -Infinity, altMax: Infinity,
  incMin: -Infinity, incMax: Infinity,
};
let filterActive = false;
const flEl    = document.getElementById('filters');
const flHead  = document.getElementById('fl-head');
const flStatus = document.getElementById('fl-status');

function altRegime(alt) {
  if (alt < 2000)   return 'leo';
  if (alt < 34000)  return 'meo';
  if (alt <= 37000) return 'geo';
  return 'heo';
}
function passesFilter(e) {
  const m = e.meta, t = m.OBJECT_TYPE;
  if (t === 'PAY' && !filterState.type.pay) return false;
  if (t === 'R/B' && !filterState.type.rb)  return false;
  if (t === 'DEB' && !filterState.type.deb) return false;
  if (!filterState.regime[altRegime(e.altKm)]) return false;
  if (e.altKm < filterState.altMin || e.altKm > filterState.altMax) return false;
  const inc = Number(m.INCLINATION);
  if (isFinite(inc) && (inc < filterState.incMin || inc > filterState.incMax)) return false;
  return true;
}
function recomputeFilterActive() {
  const s = filterState;
  filterActive = !(s.type.pay && s.type.rb && s.type.deb &&
                   s.regime.leo && s.regime.meo && s.regime.geo && s.regime.heo &&
                   s.altMin === -Infinity && s.altMax === Infinity &&
                   s.incMin === -Infinity && s.incMax === Infinity);
}
export function applyFilters() {
  recomputeFilterActive();
  let vis = 0;
  for (let i = 0; i < S.count; i++) {
    const ok = !filterActive || passesFilter(S.validSats[i]);
    visArr[i] = ok ? 1 : 0; if (ok) vis++;
  }
  const noun = S.count === 1 ? 'object' : 'objects';
  flStatus.innerHTML = filterActive
    ? '<b>' + vis.toLocaleString() + '</b> of ' + S.count.toLocaleString() + ' ' + noun + ' shown'
    : '<b>' + S.count.toLocaleString() + '</b> ' + noun + ' shown';
  if (S.selIdx >= 0 && !visArr[S.selIdx]) deselectCurrent();
  renderFeatured();
}

document.getElementById('fl-type').addEventListener('click', (e) => {
  const b = e.target.closest('.fl-chip'); if (!b) return;
  filterState.type[b.dataset.k] = !filterState.type[b.dataset.k];
  b.classList.toggle('on', filterState.type[b.dataset.k]); applyFilters();
});
document.getElementById('fl-regime').addEventListener('click', (e) => {
  const b = e.target.closest('.fl-chip'); if (!b) return;
  filterState.regime[b.dataset.k] = !filterState.regime[b.dataset.k];
  b.classList.toggle('on', filterState.regime[b.dataset.k]); applyFilters();
});
const flAltMin = document.getElementById('fl-alt-min'), flAltMax = document.getElementById('fl-alt-max');
const flIncMin = document.getElementById('fl-inc-min'), flIncMax = document.getElementById('fl-inc-max');
function flReadRanges() {
  const num = (el, dflt) => { const v = parseFloat(el.value); return isFinite(v) ? v : dflt; };
  filterState.altMin = num(flAltMin, -Infinity); filterState.altMax = num(flAltMax, Infinity);
  filterState.incMin = num(flIncMin, -Infinity); filterState.incMax = num(flIncMax, Infinity);
  applyFilters();
}
[flAltMin, flAltMax, flIncMin, flIncMax].forEach((el) => {
  el.addEventListener('input', flReadRanges);
  el.addEventListener('keydown', (ev) => ev.stopPropagation());
});
document.getElementById('fl-reset').addEventListener('click', () => {
  filterState.type   = { pay: true, rb: true, deb: true };
  filterState.regime = { leo: true, meo: true, geo: true, heo: true };
  filterState.altMin = -Infinity; filterState.altMax = Infinity;
  filterState.incMin = -Infinity; filterState.incMax = Infinity;
  flAltMin.value = flAltMax.value = flIncMin.value = flIncMax.value = '';
  flEl.querySelectorAll('.fl-chip').forEach((c) => c.classList.add('on'));
  applyFilters();
});
flHead.addEventListener('click', () => flEl.classList.toggle('open'));
