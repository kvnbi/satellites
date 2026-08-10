import { renderer, scene, camera, HAS_COARSE_POINTER } from './core/scene.js';
import { interpolatePositions } from './core/propagation.js';
import { updateNadirLine, tickOrbitSpin, buildOrbit } from './core/overlays.js';
import { pickSatAt, updateSatInstances } from './core/sat-mesh.js';
import { loadAll } from './data/catalogue.js';
import { tickCamera } from './camera/modes.js';
import { selectIndex, deselectCurrent } from './ui/selection.js';
import { tickTooltip } from './ui/tooltip.js';
import { tickLiveInfo } from './ui/info-panel.js';
import { tickAnalytics, isAnalyticsExpanded, collapseAnalyticsExpanded } from './ui/analytics.js';
import { renderFeatured } from './ui/featured.js';
import { S } from './state.js';

import './ui/filters.js';
import './ui/search.js';

let _downX = 0, _downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  _downX = e.clientX; _downY = e.clientY;
});
renderer.domElement.addEventListener('click', (e) => {
  if (Math.hypot(e.clientX - _downX, e.clientY - _downY) > (HAS_COARSE_POINTER ? 14 : 6)) return;
  const bestIdx = pickSatAt(e.clientX, e.clientY);
  if (bestIdx < 0) { deselectCurrent(); }
  else { selectIndex(bestIdx); }
  renderFeatured();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (isAnalyticsExpanded()) { collapseAnalyticsExpanded(); return; }
  if (S.selIdx >= 0) { deselectCurrent(); renderFeatured(); }
});

loadAll();

(function animate() {
  requestAnimationFrame(animate);
  const rolled = interpolatePositions();
  if (S.selIdx >= 0) {
    if (rolled) buildOrbit();
    updateNadirLine();
    tickOrbitSpin();
    const tnow = Date.now();
    tickLiveInfo(tnow);
    tickAnalytics(tnow);
  }
  tickCamera();
  tickTooltip();
  updateSatInstances();
  renderer.render(scene, camera);
})();
