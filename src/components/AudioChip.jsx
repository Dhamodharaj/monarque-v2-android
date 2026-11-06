import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gameSounds } from '../utils/sound.js';

// Speaker chip + small mixer popover (master / effects / music, mute). Works on every screen.
export default function AudioChip({ floating = false }) {
  const [mix, setMix] = useState(() => gameSounds.getMix());
  const [open, setOpen] = useState(false);
  const ref = useRef(null); const panelRef = useRef(null); const [pos, setPos] = useState({ top: 60, bottom: 'auto', right: 12 });
  useEffect(() => gameSounds.subscribe(() => setMix(gameSounds.getMix())), []);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current?.contains(e.target) || panelRef.current?.contains(e.target)) return; setOpen(false); };
    document.addEventListener('pointerdown', away); return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const slider = (label, key) => (
    <label className="audio-row"><span>{label}</span>
      <input type="range" min="0" max="100" value={Math.round(mix[key] * 100)} aria-label={`${label} volume`} onChange={(e) => gameSounds.setMix({ [key]: Number(e.target.value) / 100 })} onPointerUp={() => key !== 'music' && gameSounds.cue('toggle', 0.8)} />
      <b>{Math.round(mix[key] * 100)}</b></label>
  );
  return (
    <span className={`audio-chip-wrap ${floating ? 'is-floating' : ''}`} ref={ref}>
      <button type="button" className="header-chip audio-chip" data-sfx="none" aria-pressed={mix.muted} aria-expanded={open} aria-label="Sound settings" onClick={() => { gameSounds.unlock(); const r = ref.current?.getBoundingClientRect(); if (r) setPos(floating ? { top: 'auto', bottom: Math.max(8, window.innerHeight - r.top + 6), right: Math.max(8, window.innerWidth - r.right) } : { bottom: 'auto', top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }); setOpen(o => !o); }}><svg viewBox="0 0 24 24" width="20" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />{mix.muted || mix.volume === 0 ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}</svg></button>
      {open && createPortal(
        <div className="audio-panel audio-panel-portal" ref={panelRef} style={{ position: 'fixed', zIndex: 100000, ...pos, left: 'auto' }} role="dialog" aria-label="Sound settings">
          <button type="button" className="audio-mute" data-sfx="none" onClick={() => { const m = gameSounds.toggleMute(); if (!m) gameSounds.cue('toggle', 0.8); }}>{mix.muted ? 'Unmute' : 'Mute all'}</button>
          {slider('Master', 'volume')}{slider('Effects', 'sfx')}{slider('Music', 'music')}
        </div>, document.body)}
    </span>
  );
}
