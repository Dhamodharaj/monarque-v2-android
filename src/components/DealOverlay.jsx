import { useEffect, useRef } from 'react';
import { gameSounds } from '../utils/sound.js';

/** Opening deal: a deck appears at the table centre and cards fly out to every vessel, round-robin.
 *  Calls onDone when the last card lands (or immediately when animations are off). Click to skip. */
export default function DealOverlay({ players, perPlayer = 12, animations = true, onDone }) {
  const layer = useRef(null);
  const doneRef = useRef(false);
  const finish = () => { if (doneRef.current) return; doneRef.current = true; onDone?.(); };
  useEffect(() => {
    const L = layer.current;
    if (!animations || !L || typeof L.animate !== 'function') { finish(); return undefined; }
    const W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H * 0.44;
    const targets = players.map(p => { const r = document.querySelector(`[data-pid="${p.id}"]`)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: cx, y: cy }; });
    const total = perPlayer * players.length; let landed = 0; const timers = [];
    const step = Math.max(18, Math.min(30, Math.floor(1700 / total)));
    for (let i = 0; i < total; i += 1) {
      const t = targets[i % players.length], el = document.createElement('div');
      el.className = 'deal-card'; L.appendChild(el);
      const spread = ((i * 37) % 21) - 10, delay = 350 + i * step;
      const a = el.animate([
        { transform: `translate(${cx - 32}px,${cy - 44}px) rotate(${spread / 3}deg) scale(1)`, opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: `translate(${(cx + t.x) / 2 - 32}px,${Math.min(cy, t.y) - 70 - spread}px) rotate(${spread * 2}deg) scale(.9)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${t.x - 32}px,${t.y - 44}px) rotate(${spread * 4}deg) scale(.42)`, opacity: 0.1 }
      ], { duration: 560, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
      a.onfinish = () => { el.remove(); landed += 1; if (landed >= total) finish(); };
      if (i % 2 === 0) timers.push(window.setTimeout(() => gameSounds.cue('dealFlick', 0.55, { rate: 0.92 + (i % 5) * 0.045, minGap: 0 }), delay));
    }
    const pile = L.querySelector('.deal-pile');
    pile?.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.2 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.85 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.7)' }], { duration: 350 + total * step + 500, fill: 'both' });
    timers.push(window.setTimeout(finish, 350 + total * step + 1400));
    return () => { timers.forEach(window.clearTimeout); L.querySelectorAll('.deal-card').forEach(n => n.remove()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="deal-layer" ref={layer} onClick={finish} role="status" aria-label="Dealing cards"><div className="deal-pile"><i /><i /><i /><span>DEALING…</span></div></div>;
}
