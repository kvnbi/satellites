import { renderer } from '../core/scene.js';
import { pickSatAt } from '../core/sat-mesh.js';
import { S } from '../state.js';

const tooltipEl = document.getElementById('tooltip');
let hoverX = 0, hoverY = 0, hoverNeedsUpdate = false;
let pointerInside = false, hoverPointerDown = false;

function hideTooltip() {
  tooltipEl.style.display = 'none';
  renderer.domElement.style.cursor = '';
}

function updateTooltip() {
  const idx = pickSatAt(hoverX, hoverY);
  if (idx < 0) { hideTooltip(); return; }
  tooltipEl.textContent = S.validSats[idx].meta.OBJECT_NAME;
  tooltipEl.style.display = 'block';
  renderer.domElement.style.cursor = 'pointer';

  const pad = 14;
  const tw  = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
  let x = hoverX + pad, y = hoverY + pad;
  if (x + tw > window.innerWidth  - 4) x = hoverX - pad - tw;
  if (y + th > window.innerHeight - 4) y = hoverY - pad - th;
  tooltipEl.style.left = Math.max(4, x) + 'px';
  tooltipEl.style.top  = Math.max(4, y) + 'px';
}

renderer.domElement.addEventListener('pointermove', (e) => {
  hoverX = e.clientX; hoverY = e.clientY;
  pointerInside = true; hoverNeedsUpdate = true;
});
renderer.domElement.addEventListener('pointerleave', () => {
  pointerInside = false; hideTooltip();
});
renderer.domElement.addEventListener('pointerdown', () => { hoverPointerDown = true; hideTooltip(); });
window.addEventListener('pointerup',            () => { hoverPointerDown = false; });
renderer.domElement.addEventListener('pointercancel', () => { hoverPointerDown = false; });

export function tickTooltip() {
  if (!hoverPointerDown && pointerInside &&
      (hoverNeedsUpdate || tooltipEl.style.display !== 'none')) {
    hoverNeedsUpdate = false;
    updateTooltip();
  }
}
