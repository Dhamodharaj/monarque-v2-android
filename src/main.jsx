import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Boundary from './Boundary.jsx';
import './arena-theme.css';
import './setup.css';
import './perf.css';
import './shop.css';
import './final-fixes.css';
import './story-header.css';
import './fixes-v13.css';
import { initMobileFit } from './utils/mobileFit.js';

initMobileFit();

// Art that is not shipped must never show a broken-image icon: hide it and let the designed fallback show.
document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG') t.style.visibility = 'hidden'; }, true);

console.log('%cMONARQUE: Cards of the Fallen%c\n(c) 2026 dhamo ss. All rights reserved. Copying, re-hosting or reusing the code, art or audio without written permission is prohibited.', 'font:700 14px serif;color:#c9a14a', 'font:12px sans-serif;color:#999');

// Pause CSS animations while the tab is hidden (see perf.css).
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('tab-hidden', document.hidden));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Boundary><App /></Boundary>
  </StrictMode>
);
