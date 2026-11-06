import { clutchBonus } from '../game/drama.js';

export default function Result({ state, reward = null, onRestart, onHome }) {
  const winner = state.players.find((p) => p.id === state.winner);
  const humanWon = winner?.id === state.players[0]?.id;
  const bonus = clutchBonus(state);
  const r = reward ?? { coins: bonus.coins, mul: 1, reasons: bonus.reasons, feats: [] };
  return (
    <main className="result-screen">
      <section className="result-panel">
        <p className="eyebrow">THE RITE IS OVER</p>
        <h1>{humanWon ? 'You stand.' : `${winner?.name ?? 'A rival'} stands`}</h1>
        <p>{humanWon ? 'Every rival at the table has fallen.' : 'The rite is over. You were not the last.'}</p>
        {humanWon && (r.reasons.length > 0 || r.mul !== 1 || r.feats.length > 0) && <div className="result-reward">{r.reasons.length > 0 && <b>{r.reasons.join(' · ')}</b>}{r.mul !== 1 && <span>Difficulty bonus ×{r.mul} · {r.coins} coins earned</span>}{r.feats.map((f) => <span key={f.id}>Feat earned: {f.name} (+{f.reward} coins)</span>)}</div>}
        <div className="result-stats">
          {state.players.map((p) => <div key={p.id}><strong>{p.name}</strong><span>{p.hp ?? 0} HP · {p.ki ?? 0} Soul · {p.hp > 0 ? "STANDING" : "FALLEN"}</span></div>)}
        </div>
        <div className="result-actions"><button className="primary-button" onClick={onRestart}>Rite Again</button><button className="secondary-button" onClick={onHome}>Home</button></div>
      </section>
    </main>
  );
}
