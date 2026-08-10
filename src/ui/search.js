import { S, visArr } from '../state.js';
import { esc } from '../utils.js';
import { selectIndex } from './selection.js';
import { renderFeatured } from './featured.js';

const searchEl    = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchList  = document.getElementById('search-results');
const SEARCH_MAX  = 12;
let   searchHits  = [];
let   searchSel   = -1;

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchHits = []; searchSel = -1; renderResults();
  searchInput.focus();
});

function runSearch(raw) {
  const q = raw.trim().toUpperCase();
  if (!q) { searchHits = []; searchSel = -1; renderResults(); return; }
  const numeric = /^\d+$/.test(q);
  const hits = [];
  for (let i = 0; i < S.count; i++) {
    if (!visArr[i]) continue;
    const name = S.searchName[i], id = S.searchId[i];
    let score = -1;
    if (numeric) {
      if (id === q) score = 0;
      else if (id.startsWith(q)) score = 1;
      else if (id.includes(q)) score = 2;
      else if (name.includes(q)) score = 5;
    } else {
      const at = name.indexOf(q);
      if (at === 0) score = 3; else if (at > 0) score = 4;
    }
    if (score >= 0) hits.push({ i, score, name });
  }
  hits.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  searchHits = hits;
  searchSel  = hits.length ? 0 : -1;
  renderResults();
}

function renderResults() {
  const typed = searchInput.value.trim();
  if (searchHits.length === 0) {
    searchList.innerHTML = typed ? '<div class="sr-empty">No matches</div>' : '';
    searchList.style.display = typed ? 'block' : 'none';
    return;
  }
  let html = '';
  searchHits.slice(0, SEARCH_MAX).forEach((h, k) => {
    const s = S.validSats[h.i], m = s.meta;
    html += `<div class="sr-item${k === searchSel ? ' active' : ''}" data-i="${h.i}">`
          + `<span class="sr-name">${esc(m.OBJECT_NAME)}</span>`
          + `<span class="sr-id">#${m.NORAD_CAT_ID} · ${s.altKm.toFixed(0)} km</span></div>`;
  });
  if (searchHits.length > SEARCH_MAX)
    html += `<div class="sr-more">+${searchHits.length - SEARCH_MAX} more · refine search</div>`;
  searchList.innerHTML = html;
  searchList.style.display = 'block';
}

function pickIndex(i) {
  if (i < 0 || i >= S.count) return;
  selectIndex(i);
  renderFeatured();
  searchInput.value = S.validSats[i].meta.OBJECT_NAME;
  searchList.style.display = 'none';
  searchInput.blur();
}

searchInput.addEventListener('input', () => runSearch(searchInput.value));
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) runSearch(searchInput.value); });
searchInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  const n = Math.min(searchHits.length, SEARCH_MAX);
  if (e.key === 'ArrowDown')    { if (n) { searchSel = (searchSel + 1) % n; renderResults(); } e.preventDefault(); }
  else if (e.key === 'ArrowUp') { if (n) { searchSel = (searchSel - 1 + n) % n; renderResults(); } e.preventDefault(); }
  else if (e.key === 'Enter')   { if (searchSel >= 0 && searchSel < n) pickIndex(searchHits[searchSel].i); }
  else if (e.key === 'Escape')  { searchInput.value = ''; searchHits = []; searchSel = -1; renderResults(); searchInput.blur(); }
});
searchList.addEventListener('click', (e) => {
  const item = e.target.closest('.sr-item');
  if (item) pickIndex(parseInt(item.dataset.i, 10));
});
document.addEventListener('pointerdown', (e) => {
  if (!searchEl.contains(e.target)) searchList.style.display = 'none';
});
