import { memo } from 'react';
import { FIGHTER_BY_ID, hueOf, initialsOf } from './roster.js';
import { POWER_OF, describePower, FAMILY } from './powers.js';
import { MOODS } from './reactions.js';
import { WILDCARD_CARDS } from '../game/SpecialCards.js';

// Powers have no art of their own: a power card shows the contender's own image. (The glyphs below are only a fallback label.)
export const FAMILY_GLYPH = { SENZU: '✚', FINAL_ATONEMENT: '☠', OTHER_WORLD: '⟲', SOLAR_FLARE: '◐', SCOUTER: '◉', SHENRON_WISH: '✦', MAFUBA: '⛓' };
// The round backdrops supplied with the project. Rounds 1-6 each have their own; the throne room uses the wallpaper.
const ROUND_IMG = ['/ui/round-1.webp', '/ui/round-1.webp', '/ui/round-2.webp', '/ui/round-3.webp', '/ui/round-4.webp', '/ui/round-5.webp', '/ui/round-6.webp'];
const MISSING = new Set(); // fighter art that 404'd once is never requested again this session
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Full-screen backdrop: 'menu' | 'arena' | 'gm'. Returned as an inline style for the screen element. */
export function scene(kind, seed = '', round = 0) {
  const img = kind === 'menu' ? '/ui/round-1.webp' : kind === 'gm' ? '/ui/round-1.webp' : (ROUND_IMG[round] ?? ROUND_IMG[hash(seed) % 6 + 1]);
  const AR = { '/ui/round-1.webp': [187, 30, 15], '/ui/round-2.webp': [356, 32, 14], '/ui/round-3.webp': [8, 36, 14], '/ui/round-4.webp': [214, 28, 19], '/ui/round-5.webp': [200, 34, 15], '/ui/round-6.webp': [42, 24, 14], '/ui/wallpaper.webp': [172, 26, 13] }[img] ?? [187, 30, 15];
  return { '--scene': `url("${img}")`, '--tint': kind === 'gm' ? '354' : '186', '--ar-h': AR[0], '--ar-s': `${AR[1]}%`, '--ar-l': `${AR[2]}%` };
}

function Rays({ id, hue }) {
  const h = hash(id), n = 8 + (h % 7), rot = h % 360, w = 180 / n * 0.55;
  const wedges = Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 360) / n; const p = (d) => [50 + 90 * Math.cos(((a + d) * Math.PI) / 180), 50 + 90 * Math.sin(((a + d) * Math.PI) / 180)];
    const [x1, y1] = p(-w), [x2, y2] = p(w);
    return <path key={i} d={`M50 50L${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}Z`} fill={`hsl(${hue + (i % 2) * 12} 30% 62%)`} opacity={i % 2 ? 0.1 : 0.18} />;
  });
  return <svg className="sm-rays" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{wedges}<circle cx="50" cy="50" r="30" fill="none" stroke={`hsl(${hue} 30% 70%)`} strokeOpacity=".22" strokeWidth=".8" /><circle cx="50" cy="50" r="42" fill="none" stroke={`hsl(${hue} 30% 70%)`} strokeOpacity=".12" strokeWidth=".6" strokeDasharray="2 3" /></svg>;
}

export const Portrait = memo(function Portrait({ id, size = 72, mood, card = false, gm = false, className = '' }) {
  const f = FIGHTER_BY_ID[id];
  const hue = gm ? 45 : hueOf(f ?? {});
  const grade = !gm && POWER_OF[id]?.grade;
  return (
    <div className={`sm-portrait ${size >= 120 ? 'big' : ''} ${gm ? 'is-gm' : ''} ${grade ? `pg-${grade}` : ''} ${card ? 'is-card' : ''} ${mood ? `mood-${mood}` : ''} ${className}`} style={{ width: size, height: size, '--hue': hue, fontSize: size * 0.36 }} aria-hidden="true">
      {!gm && size >= 40 && <Rays id={id} hue={hue} />}
      {!gm && <span className="sm-mono">{initialsOf(f?.name)}</span>}
      {!gm && id && !MISSING.has(id) && <img key={id} className="sm-art" src={`/story/fighters/${id}.webp`} alt="" draggable="false" decoding="async" loading="lazy" onError={(e) => { MISSING.add(id); e.currentTarget.style.display = "none"; }} />}
      {gm && <img className="sm-gm-img" src="/ui/monarque.webp" alt="" draggable="false" />}
      {!gm && size >= 56 && <i className="sm-sheen" />}
      {mood && <i className="sm-mood">{MOODS[mood]?.icon}</i>}
    </div>
  );
});

/** A story power drawn as an Edict: engraved glyph, grade foil, Soul gem. */
export const PowerChip = memo(function PowerChip({ fighterId, step = 1, compact = false, dim = false, tag, boost = 1 }) {
  const spec = POWER_OF[fighterId]; if (!spec) return null;
  const d = describePower(spec, step, boost);
  const ki = String(d.cost ?? '').replace(/\D/g, '') || '0';
  return (
    <div className={`sm-pcard ${compact ? 'compact' : ''} ${boost > 1 ? 'is-berserk' : ''} grade-${spec.grade} fam-${spec.family} ${dim ? 'is-dim' : ''}`}>
      <div className="sm-pcard-art">
        <img className="sm-art" src={`/story/fighters/${fighterId}.webp`} alt="" draggable="false" decoding="async" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span className="sm-pcard-ki" title="Soul cost"><b>{ki}</b><small>SOUL</small></span>
        <span className="sm-pcard-grade">{spec.grade}</span>
        {tag && <span className="sm-pcard-tag">{tag}</span>}
      </div>
      <div className="sm-pcard-body">
        <b className="sm-pcard-name">{spec.name}</b>
        <small className="sm-pcard-sub">{FIGHTER_BY_ID[fighterId].short} · {FAMILY[spec.family].label}{d.cost ? ` · ${d.cost}` : ''}</small>
        {!compact && <p>{d.text}</p>}
      </div>
    </div>
  );
});

/** One of Monarque's own Edicts shown like a power (the berserker carries one). The art is the Edict's own card from public/story/edicts. */
export const MonarqueChip = memo(function MonarqueChip({ effectId, compact = false }) {
  const c = WILDCARD_CARDS.find((w) => w.effectId === effectId); if (!c) return null;
  return (
    <div className={`sm-pcard ${compact ? 'compact' : ''} grade-S is-monarque`}>
      <div className="sm-pcard-art">
        <img className="sm-art" src={c.image} alt="" draggable="false" decoding="async" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span className="sm-pcard-grade">M</span>
        <span className="sm-pcard-tag">monarque</span>
      </div>
      <div className="sm-pcard-body">
        <b className="sm-pcard-name">{c.character}</b>
        <small className="sm-pcard-sub">Monarque · {c.title}</small>
        {!compact && <p>{c.description}</p>}
      </div>
    </div>
  );
});

export function StepBadge({ step }) {
  return <span className={`sm-step step-${step}`}>{['', 'RESISTANCE', 'ADAPTATION', 'STABILITY'][step]}</span>;
}
export function Pips({ n, of }) {
  return <span className="sm-pips">{Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}
export const MonarqueLine = ({ children }) => (
  <div className="sm-gm"><Portrait id={null} gm size={56} /><div><small>MONARQUE</small><p>{children}</p></div></div>
);

/** The road to Monarque: seven stations, faces revealed as you reach them. */
export function RoadMap({ nodes }) {
  return (
    <ol className="sm-road" aria-label="The road to Monarque">
      {nodes.map((n) => (
        <li key={n.r} style={{ '--i': n.r }} className={`${n.state} ${n.r === 7 ? 'final' : ''}`}>
          <div className="sm-road-face">{n.id || n.gm ? <Portrait id={n.id} gm={n.gm} size={n.state === 'now' ? 64 : 48} card={n.state === 'done'} /> : <span className="sm-road-q">?</span>}{n.state === 'done' && <i className="sm-road-check">✓</i>}</div>
          <b>{n.label}</b><small>{n.name}</small>
        </li>
      ))}
    </ol>
  );
}
