import CardArt from './CardArt.jsx';
import { SOUL } from '../game/lexicon.js';

// Private Oracle’s Gaze reading of one opponent. Valid for the round it was made in.
function Row({ c, label }) {
  return (
    <div className={`scout-card ${c.ready ? '' : 'cooling'}`}>
      <div className="scout-thumb"><CardArt card={c} /></div>
      <div className="scout-card-info">
        <small>{label}</small>
        <strong>{c.character}</strong>
        <span>{c.form}</span>
        <b>P {c.power} · R {c.rank} · ⚡{c.cost}</b>
      </div>
      <em>{c.ready ? 'READY' : 'COOLDOWN'}</em>
    </div>
  );
}

export default function ScouterReport({ report, target, onClose }) {
  if (!report) return null;
  const topRank = report.topRank?.[0];
  const showRank = topRank && !report.topPower.some(c => c.id === topRank.id);
  return (
    <div className="scout-layer" role="dialog" aria-modal="true" aria-label="Oracle’s Gaze report" onClick={onClose}>
      <div className="scout-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scout-head"><span className="scout-eye" aria-hidden="true" /><div><small>SCOUTER LOCK-ON</small><h2>{target?.name ?? 'Opponent'}</h2></div><button type="button" className="scout-close" onClick={onClose} aria-label="Close report">×</button></div>
        <div className="scout-stats">
          <div><b>{report.ki}</b><span>{SOUL().toUpperCase()}</span></div>
          <div><b>{report.hp}</b><span>HP</span></div>
          <div><b>{report.handCount}</b><span>CARDS</span></div>
          <div><b>{report.lastStandLeft}</b><span>LAST STAND</span></div>
          <div><b>{report.cooling}</b><span>COOLING</span></div>
        </div>
        <div className="scout-section">STRONGEST BY POWER</div>
        {report.topPower.map((c, i) => <Row key={c.id} c={c} label={`#${i + 1} POWER`} />)}
        {showRank && <><div className="scout-section">BEST BY RANK</div><Row c={topRank} label="BEST RANK" /></>}
        {!report.topPower.length && <div className="scout-empty">No character cards in hand.</div>}
        <p className="scout-note">Private to you. Valid this round — your opponent can still draw, boost and change plans.</p>
      </div>
    </div>
  );
}
