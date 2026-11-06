import { useState } from 'react';
import { SOUL } from '../game/lexicon.js';
import { classifyCard } from '../game/CardTiers.js';
import registry from '../data/cards.json';
const characterRegistry = registry.filter(c => c.type === 'CHARACTER');
const TIER_BUDGET = { WEAK: 3, NORMAL: 2, POWERFUL: 1, OP: 0 };
export default function GameControls({ phase, currentPlayer, humanId, call, coins, drawsUsed, reserve, maxDraws, drawCost, handCount = 0, wildcardCount = 0, onDraw, onCall, selectedCard, selectedCardInfo, onPlay, onClear, onlyDraw = false, boostOnly = false, drawnThisRound = false, cardCost = 0, currentKi = 0, powerKi: controlledPowerKi, rankKi: controlledRankKi, setPowerKi: setControlledPowerKi, setRankKi: setControlledRankKi }) {
  const [localPowerKi, setLocalPowerKi] = useState(0);
  const [localRankKi, setLocalRankKi] = useState(0);
  const powerKi = controlledPowerKi ?? localPowerKi;
  const rankKi = controlledRankKi ?? localRankKi;
  const setPowerKi = setControlledPowerKi ?? setLocalPowerKi;
  const setRankKi = setControlledRankKi ?? setLocalRankKi;
  const isHumanTurn = currentPlayer === humanId;
  const calling = isHumanTurn && phase === 'CALLING_STAT';
  const playing = isHumanTurn && phase === 'PLAYING_CARD';
  const canDraw = (calling || playing) && !drawnThisRound && reserve > 0 && coins >= drawCost && drawsUsed < maxDraws && handCount < 18 && wildcardCount < 3;
  const wildcardSelected = (selectedCardInfo?.type || '').toUpperCase() === 'WILDCARD';
  const kiAvailable = Math.max(0, Number(currentKi ?? 0));
  const adjustPower = (delta) => setPowerKi(value => Math.max(0, Math.min(3, value + delta)));
  const adjustRank = (delta) => setRankKi(value => Math.max(0, Math.min(3, value + delta)));
  const boostBudget = selectedCardInfo && !wildcardSelected ? Math.max(0, Math.min(TIER_BUDGET[classifyCard(selectedCardInfo, characterRegistry)] ?? 0, kiAvailable - cardCost)) : 0;
  const maxPowerBoost = (powerKi + rankKi >= boostBudget) || (selectedCardInfo && Math.min(999, selectedCardInfo.power + powerKi * 25) >= 999);
  const maxRankBoost = (powerKi + rankKi >= boostBudget) || (selectedCardInfo && Math.max(1, selectedCardInfo.rank - rankKi * 3) <= 1);
  const noKiForPower = powerKi + rankKi >= boostBudget;
  const noKiForRank = powerKi + rankKi >= boostBudget;
  const [hint, setHint] = useState('');
  const flash = (msg) => { setHint(msg); setTimeout(() => setHint(''), 2200); };
  const tryPower = () => {
    if (selectedCardInfo && Math.min(999, selectedCardInfo.power + powerKi * 25) >= 999) return flash('Power is already at the 999 cap.');
    if (powerKi + rankKi >= boostBudget) return flash(kiAvailable - cardCost <= powerKi + rankKi ? `Not enough ${SOUL()} left to boost.` : 'Boost limit for this card tier reached.');
    adjustPower(1);
  };
  const tryRank = () => {
    if (selectedCardInfo && Math.max(1, selectedCardInfo.rank - rankKi * 3) <= 1) return flash('Rank is already at its best (1).');
    if (powerKi + rankKi >= boostBudget) return flash(kiAvailable - cardCost <= powerKi + rankKi ? `Not enough ${SOUL()} left to boost.` : 'Boost limit for this card tier reached.');
    adjustRank(1);
  };
  const kiSummary = null; // the cost line was removed from the panel (the cost shows on the card badge)
  const hintEl = null; // blocked + buttons are simply disabled; no pop-up message

  // Stage 5: the right selected-card panel contains only compact boost controls.
  if (boostOnly) {
    if (!playing) return null;
    return (
      <div className="game-controls selected-controls boost-only-controls">
        <div className="choose-stat-label">{call ? `STAT CALL · ${call}` : 'STAT CALL HIDDEN'}</div>
        <div className={`boost-controls ${wildcardSelected ? 'boosts-disabled' : ''}`}>
          <div className="boost-stepper"><label>Power boost</label><div className="boost-stepper-row"><button type="button" aria-label="Decrease power boost" disabled={wildcardSelected || powerKi === 0} onClick={() => adjustPower(-1)}>−</button><strong>+{powerKi * 25} <small>· {powerKi} {SOUL()}</small></strong><button type="button" aria-label="Increase power boost" disabled={wildcardSelected || maxPowerBoost || noKiForPower} onClick={tryPower}>+</button></div></div>
          <div className="boost-stepper"><label>Rank boost</label><div className="boost-stepper-row"><button type="button" aria-label="Decrease rank boost" disabled={wildcardSelected || rankKi === 0} onClick={() => adjustRank(-1)}>−</button><strong>−{rankKi * 3} <small>· {rankKi} {SOUL()}</small></strong><button type="button" aria-label="Increase rank boost" disabled={wildcardSelected || maxRankBoost || noKiForRank} onClick={tryRank}>+</button></div></div>
        </div>
        {selectedCardInfo && !wildcardSelected && <div className="boost-preview"><span>POWER <b>{selectedCardInfo.power}</b><i>→</i><strong className={powerKi ? 'boosted-stat' : ''}>{Math.min(999,selectedCardInfo.power+powerKi*25)}</strong></span><span>RANK <b>{selectedCardInfo.rank}</b><i>→</i><strong className={rankKi ? 'boosted-stat' : ''}>{Math.max(1,selectedCardInfo.rank-rankKi*3)}</strong></span><small>Boost cost: {powerKi+rankKi} Soul</small></div>}{hintEl}
      </div>
    );
  }

  // The Draw control is intentionally always rendered when requested. It is
  // disabled outside the player's calling phase, below the coin requirement,
  // after the five-draw limit, or when the reserve is empty.
  if (onlyDraw) {
    const reason = !isHumanTurn || (phase !== 'CALLING_STAT' && phase !== 'PLAYING_CARD')
      ? 'Available on your turn'
      : drawnThisRound
        ? 'One draw per round'
      : handCount >= 18
        ? 'Hand is full'
        : wildcardCount >= 3
          ? 'Three-Edict draw lock'
      : drawsUsed >= maxDraws
        ? 'Draw limit reached'
        : reserve <= 0
          ? 'Reserve is empty'
          : coins < drawCost
            ? `${drawCost} coins required`
            : `${drawsUsed}/${maxDraws} draws used`;

    return (
      <div className="game-controls selected-controls draw-only">
        <button className="draw-button" disabled={!canDraw} onClick={onDraw} title={`${drawsUsed}/${maxDraws} draws · ${reason}`}>
          <b>Draw card</b> <span>−{drawCost} coins</span>
        </button>
        <div className="draw-status">{reason}</div>
      </div>
    );
  }

  if (!calling && !playing) return null;

  return (
    <div className="game-controls selected-controls">
      {calling ? (
        <>
          <div className="choose-stat-label">CHOOSE PLAY TYPE</div>
          <div className="call-buttons">
            <button className="call power" disabled={!selectedCard} onClick={() => onCall('POWER')}>POWER</button>
            <button className="call rank" disabled={!selectedCard} onClick={() => onCall('RANK')}>RANK</button>
          </div>
          <button className="clear-selection" onClick={onClear}>Clear</button>
        </>
      ) : (
        <>
          <div className="choose-stat-label">{call ? `YOUR CALL · ${call}` : "STAT CALL HIDDEN"}</div>
          <div className={`boost-controls ${wildcardSelected ? 'boosts-disabled' : ''}`}><div className="boost-stepper"><label>Power boost</label><div className="boost-stepper-row"><button type="button" aria-label="Decrease power boost" disabled={wildcardSelected || powerKi === 0} onClick={() => adjustPower(-1)}>−</button><strong>+{powerKi * 25} <small>· {powerKi} {SOUL()}</small></strong><button type="button" aria-label="Increase power boost" disabled={wildcardSelected || maxPowerBoost || noKiForPower} onClick={tryPower}>+</button></div></div><div className="boost-stepper"><label>Rank boost</label><div className="boost-stepper-row"><button type="button" aria-label="Decrease rank boost" disabled={wildcardSelected || rankKi === 0} onClick={() => adjustRank(-1)}>−</button><strong>−{rankKi * 3} <small>· {rankKi} {SOUL()}</small></strong><button type="button" aria-label="Increase rank boost" disabled={wildcardSelected || maxRankBoost || noKiForRank} onClick={tryRank}>+</button></div></div></div>{selectedCardInfo && !wildcardSelected && <div className="boost-preview"><span>POWER <b>{selectedCardInfo.power}</b><i>→</i><strong className={powerKi ? 'boosted-stat' : ''}>{Math.min(999,selectedCardInfo.power+powerKi*25)}</strong></span><span>RANK <b>{selectedCardInfo.rank}</b><i>→</i><strong className={rankKi ? 'boosted-stat' : ''}>{Math.max(1,selectedCardInfo.rank-rankKi*3)}</strong></span><small>Boost cost: {powerKi+rankKi} Soul</small></div>}{kiSummary}{hintEl}<button className="play-selected" disabled={!selectedCard} onClick={() => onPlay?.({powerKi,rankKi})}>PLAY SELECTED CARD</button>
          <button className="clear-selection" onClick={onClear}>Clear</button>
        </>
      )}
    </div>
  );
}
