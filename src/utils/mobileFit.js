/**
 * Phones: play the PC layout, just smaller.
 * - The viewport meta is switched to a wide fixed width (~1280-1700px), so the browser shrinks the whole desktop layout to fit the screen
 *   (CSS media queries, vw/vh units and every panel behave exactly as on PC).
 * - A "Made for PC" notice shows once per session; "Continue anyway" enters fullscreen and tries to lock landscape (Android Chrome).
 * - Portrait then shows a "rotate your phone" screen.
 * PC / large screens are untouched.
 */
const isPhone = () => {
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const short = Math.min(window.screen.width, window.screen.height);
    return coarse && short < 820;
  } catch { return false; }
};

export function initMobileFit() {
  if (typeof document === 'undefined' || !isPhone()) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  document.documentElement.classList.add('is-phone');

  const fit = () => {
    const a = Math.max(window.screen.width, window.screen.height);
    const b = Math.min(window.screen.width, window.screen.height);
    const aspect = a / b;
    const width = Math.max(1280, Math.min(1700, Math.round(760 * aspect))); // keeps the layout viewport tall enough (~760px) for the desktop design
    meta.setAttribute('content', `width=${width}, user-scalable=no, viewport-fit=cover`);
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    rotate.style.display = portrait && !noticeOpen ? 'flex' : 'none';
  };

  let noticeOpen = false;
  const rotate = document.createElement('div');
  rotate.className = 'kc-rotate';
  rotate.innerHTML = '<div><b>&#8635;</b><p>Rotate your phone</p><small>MONARQUE is played in landscape</small></div>';
  document.body.appendChild(rotate);
  const style = document.createElement('style');
  style.textContent = '.kc-notice{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,5,5,.92);font-family:"Segoe UI",sans-serif}.kc-notice section{max-width:420px;padding:22px 24px;border-radius:16px;text-align:center;color:#e4e7e7;background:linear-gradient(180deg,#233739,#162324);border:2px solid #a4aa9f}.kc-notice small{display:block;letter-spacing:.2em;font-weight:800;font-size:11px;color:#b6d8d6}.kc-notice h2{margin:6px 0 8px;font-size:26px}.kc-notice p{margin:0 0 16px;line-height:1.5;font-size:15px}.kc-notice button{padding:10px 22px;border-radius:999px;border:1px solid #a5aba1;background:linear-gradient(#a5aba1,#7f8878);color:#2d312b;font-weight:800;font-size:15px}.kc-rotate{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;text-align:center;background:#050707;color:#e4e7e7;font-family:"Segoe UI",sans-serif}.kc-rotate b{display:block;font-size:72px;margin-bottom:10px}.kc-rotate p{margin:0 0 6px;font-size:24px;font-weight:800;letter-spacing:.08em}.kc-rotate small{opacity:.7;font-size:15px}html.is-phone,html.is-phone body{overscroll-behavior:none;touch-action:manipulation}';
  document.head.appendChild(style);

  fit();
  window.addEventListener('orientationchange', () => window.setTimeout(fit, 250));
  window.addEventListener('resize', fit);

  // Fullscreen + landscape lock need a user gesture: the notice button (or, if the notice was already seen, the first tap).
  const goFull = async () => {
    window.removeEventListener('pointerdown', goFull, true);
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation?.lock) await screen.orientation.lock('landscape');
    } catch { /* unsupported (e.g. iPhone Safari): the rotate screen still guides the player */ }
  };

  let seen = false;
  try { seen = sessionStorage.getItem('kc_pc_notice') === '1'; } catch { /* ignore */ }
  if (seen) { window.addEventListener('pointerdown', goFull, true); return; }
  noticeOpen = true; fit();
  const notice = document.createElement('div');
  notice.className = 'kc-notice';
  notice.innerHTML = '<section role="dialog" aria-modal="true"><small>BEST ON DESKTOP</small><h2>Made for PC</h2><p>MONARQUE is designed for a laptop or desktop screen. You can still play on your phone: it will open in fullscreen, landscape, with everything shrunk to fit.</p><button type="button">Continue anyway</button></section>';
  document.body.appendChild(notice);
  notice.querySelector('button').addEventListener('click', () => {
    try { sessionStorage.setItem('kc_pc_notice', '1'); } catch { /* ignore */ }
    notice.remove(); noticeOpen = false; fit(); goFull();
  });
}
