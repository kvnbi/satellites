import { setTimeOffset } from '../core/time.js';
import { timeChanged } from '../core/propagation.js';
import { invalidateLiveLocation } from './info-panel.js';

const slider = document.getElementById('time-slider');
const readout = document.getElementById('time-readout');
const liveButton = document.getElementById('time-live');

function updateTime() {
  const minutes = -Number(slider.value);
  readout.textContent = minutes === 0 ? 'Now' :
    minutes < 60 ? `${minutes}m ago` :
    `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''} ago`;
  liveButton.disabled = minutes === 0;
  setTimeOffset(-minutes);
  timeChanged();
  invalidateLiveLocation();
}

slider.addEventListener('input', updateTime);
liveButton.addEventListener('click', () => {
  slider.value = '0';
  updateTime();
});

readout.textContent = 'Now';
