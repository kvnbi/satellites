import { S, visArr } from '../state.js';
import { esc } from '../utils.js';
import { selectIndex } from './selection.js';

const FEATURED = [
  { label: 'ISS',                    norad: 25544 },
  { label: 'CSS (Tiangong)',         norad: 48274 },
  { label: 'Hubble Space Telescope', norad: 20580 },
  { label: 'James Webb (JWST)',      norad: 50463 },
  { label: 'NOAA-20',               norad: 43013 },
  { label: 'GOES-18',               norad: 51850 },
];

export function renderFeatured() {
  const feBody = document.getElementById('fe-body');
  if (!feBody || !S.count) return;
  let html = '';
  for (const f of FEATURED) {
    const idx = S.searchId.indexOf(String(f.norad));
    if (idx >= 0 && visArr[idx]) {
      const active = (idx === S.selIdx);
      html += `<div class="fe-item${active ? ' fe-active' : ''}" data-i="${idx}">` +
              `<span class="fe-name">${esc(f.label)}</span>` +
              `<span class="fe-alt">${S.validSats[idx].altKm.toFixed(0)} km</span></div>`;
    } else {
      const inCat = S.searchId.includes(String(f.norad));
      html += `<div class="fe-item fe-miss">` +
              `<span class="fe-name">${esc(f.label)}</span>` +
              `<span class="fe-alt">${inCat ? 'filtered' : 'n/a'}</span></div>`;
    }
  }
  feBody.innerHTML = html;
}

document.getElementById('fe-head').addEventListener('click', () =>
  document.getElementById('featured').classList.toggle('open'));
document.getElementById('fe-body').addEventListener('click', (e) => {
  const item = e.target.closest('[data-i]');
  if (!item) return;
  selectIndex(parseInt(item.dataset.i, 10));
  renderFeatured();
});
