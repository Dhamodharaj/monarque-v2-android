import Card from './Card';
import { SOUL } from '../game/lexicon.js';
const ORD = ['1ST', '2ND', '3RD', '4TH'];
const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Reveal overlay: every played card flips, ranked 1st..4th, with HP / Soul / coin changes. Click to skip. */
export default function RoundResult({ result, onSkip }) {
  if (!result) return null;
  return (
    <div className="round-result" role="status" aria-live="polite" onClick={onSkip}>
      <div className="round-result-backdrop" />
      <div className="round-result-panel">
        <div className="round-result-label">{result.call === 'TOTAL' ? 'THE WEIGHING' : `${result.call} CALL`}{result.inverted ? ' · INVERTED' : ''}{result.arena > 1 ? ` · THE TABLE PRESSES ×${result.arena}` : ''}</div>
        <div className="round-result-rows">
          {result.rows.map((row, i) => (
            <div key={row.playerId} className={`round-result-row place-${row.place} ${row.isHuman ? 'is-human' : ''}`} style={{ '--i': i }}>
              <div className="round-result-place">{ORD[row.place - 1] ?? `${row.place}TH`}</div>
              <div className={`round-result-flip ${row.note === 'Banished' ? 'is-banished' : ''}`}><Card card={row.card} disabled />{row.note === 'Banished' && <span className="dissolve-sparks" aria-hidden="true">{Array.from({ length: 10 }, (_, k) => <i key={k} style={{ '--k': k }} />)}</span>}</div>
              <div className="round-result-name">{row.playerName}</div>
              <div className="round-result-deltas">
                {row.hp !== 0 && <span className={row.hp > 0 ? 'up' : 'down'}>{fmt(row.hp)} HP</span>}
                {row.ki !== 0 && <span className={row.ki > 0 ? 'up' : 'down'}>{fmt(row.ki)} {SOUL().toUpperCase()}</span>}
                {row.coins > 0 && <span className="up">+{row.coins} ★</span>}
                {row.note && <span className="note">{row.note}</span>}
              </div>
            </div>
          ))}
        </div>
        {result.why && <div className="round-result-why">{result.why}</div>}
        {result.footer && <div className="round-result-footer">{result.footer}</div>}
      </div>
    </div>
  );
}
