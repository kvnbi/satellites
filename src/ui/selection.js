import { S, colArr, DOT_RGB, SELECT_RGB } from '../state.js';
import { GLOBE_R } from '../core/scene.js';
import { satMesh } from '../core/sat-mesh.js';
import { buildOrbit, updateNadirLine, hideSelectionOverlays } from '../core/overlays.js';
import { setCamMode, syncModeButtons, camTween, MODE_LIMITS, camOverridePos } from '../camera/modes.js';
import { renderInfo, infoEl } from './info-panel.js';
import { anOnSelect, anOnDeselect } from './analytics.js';

function restoreColour(idx) {
  if (idx < 0 || idx >= S.validSats.length) return;
  colArr[idx*3] = DOT_RGB[0]; colArr[idx*3+1] = DOT_RGB[1]; colArr[idx*3+2] = DOT_RGB[2];
}

export function selectIndex(idx) {
  if (idx < 0 || idx >= S.count) return;
  restoreColour(S.selIdx);
  S.selIdx = idx;
  colArr[idx*3] = SELECT_RGB[0]; colArr[idx*3+1] = SELECT_RGB[1]; colArr[idx*3+2] = SELECT_RGB[2];
  satMesh.instanceColor.needsUpdate = true;
  buildOrbit();
  updateNadirLine();
  renderInfo(S.validSats[idx]);
  anOnSelect();
  setCamMode(S.camMode === 'follow' ? 'follow' : 'orbit');
}

export function deselectCurrent() {
  if (S.selIdx < 0) return;
  const exitIdx = S.selIdx;
  restoreColour(S.selIdx);
  if (satMesh) satMesh.instanceColor.needsUpdate = true;
  S.selIdx = -1;
  infoEl.style.display = 'none';
  anOnDeselect();
  hideSelectionOverlays();
  const wasFollow = (S.camMode === 'follow');
  if (S.camMode !== 'earth') {
    setCamMode('earth');
    if (wasFollow) {
      S.followHideIdx = exitIdx;
      const p = camTween.startPos, d = Math.hypot(p.x, p.y, p.z) || 1;
      const dist = Math.min(Math.max(d, GLOBE_R * 3), MODE_LIMITS.earth.max);
      camOverridePos.set(p.x / d * dist, p.y / d * dist, p.z / d * dist);
      S.camOverrideActive = true;
    }
  } else {
    syncModeButtons();
  }
}
