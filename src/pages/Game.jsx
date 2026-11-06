import { portraitFor } from '../utils/portrait.js';
import { useEffect, useRef, useState } from 'react';
import { L, SOUL, GATHER, isStory } from '../game/lexicon.js';
import GameHeader from '../components/GameHeader';
import OpponentArea from '../components/OpponentArea';
import TrickArea from '../components/TrickArea';
import PlayerHand from '../components/PlayerHand';
import GameControls from '../components/GameControls';
import RoundResult from '../components/RoundResult';
import CoachBar from '../components/CoachBar';
import Tutorial, { LiveHints, tutorialSeen } from '../components/Tutorial';
import CardArt from '../components/CardArt.jsx';
import ScouterReport from '../components/ScouterReport.jsx';
import WildcardSheet from '../components/WildcardSheet';
import { powerFacts } from '../game/powerFacts.js';
import DecreeModal, { DecreeWaiting } from '../components/DecreeModal';
import CardPreview from '../components/CardPreview';
import DealOverlay from '../components/DealOverlay';
import { SpecialSpotlight, SpecialCorner } from '../components/SpecialUI';
import { gameSounds } from '../utils/sound.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { getCardCost } from '../game/CardTiers.js';
import registry from '../data/cards.json';
const characterRegistry = registry.filter(card => card.type === 'CHARACTER');

/** The player's powers: a clipped strip with small arrow buttons at both ends (like the hand), never a scrollbar. */
function PowerStrip({ children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const measure = () => { const el = ref.current; if (!el) return; setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 }); };
  useEffect(() => { measure(); const el = ref.current; if (!el) return undefined; const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null; ro?.observe(el); window.addEventListener('resize', measure); return () => { ro?.disconnect(); window.removeEventListener('resize', measure); }; });
  const go = (dir) => ref.current?.scrollBy({ left: dir * Math.max(80, ref.current.clientWidth * 0.8), behavior: 'smooth' });
  const scrollable = !(edge.start && edge.end);
  return (
    <div className={`power-strip ${scrollable ? 'is-scrollable' : ''}`}>
      <button type="button" className="power-strip-nav prev" aria-label="Previous powers" disabled={edge.start} onClick={() => go(-1)}>‹</button>
      <div className="wildcard-action-list" ref={ref} onScroll={measure}>{children}</div>
      <button type="button" className="power-strip-nav next" aria-label="Next powers" disabled={edge.end} onClick={() => go(1)}>›</button>
    </div>
  );
}

const positions = ['left-top', 'left-middle', 'left-bottom'];
const selectedIsWildcardEarly = (card) => (card?.type || '').toUpperCase() === 'WILDCARD';

export default function Game({ dealing = false, onTutorialChange = null, onDealDone, decreeOptions = null, onDecree, arena, state, walletCoins, visibleTrick, selectedCard, roundResult, onSkipResult, spotlight, logLines = [], animations = true, wildcardStatus = {}, ownedCardIds = [], koIds = [], speech = {}, onReact, onSelectCard, onCall, onPlay, onClear, onDraw, onPass, onCharge, onUseWildcard, onHome, onOpenShop, onOpenInfo }) {
  const human = state.players[0];
  const opponents = state.players.slice(1);
  const current = state.players.find((p) => p.id === state.currentPlayer);
  const humanTurn = human.id === state.currentPlayer;
  const humanBlindMode = Boolean(state.solarFlareLeader && state.solarFlareLeader !== human.id);
  const selectedCardData = humanBlindMode ? null : (human.hand.find((card) => card.id === selectedCard) ?? null);
  const sealedIds = Object.keys(state.sealedCards ?? {});
  const blockedIds = state.noApexBlocked?.[human.id] ?? [];
  const hasLegalCharacter = human.hand.some(card => card.type === 'CHARACTER' && !(card.lastStand && human.ki > 0) && !human.lockedCardIds.includes(card.id) && !sealedIds.includes(card.id) && !blockedIds.includes(card.id) && getCardCost(card,characterRegistry) <= human.ki);
  const selectedCost = selectedCardData && !selectedIsWildcardEarly(selectedCardData) ? getCardCost(selectedCardData, characterRegistry) : 0;
  const CH = GAME_CONFIG.charge;
  const stuck = humanTurn && (state.phase === 'CALLING_STAT' || state.phase === 'PLAYING_CARD') && !hasLegalCharacter; // nothing playable: pass / gather instead of being dead-ended
  const chargeCooldown = Math.max(0, CH.cooldownRounds - (state.roundNumber - (human.lastChargeRound ?? -99)));
  const chargeSeat = (state.phase === 'PLAYING_CARD' && state.currentTrick?.leaderId !== human.id) || (state.phase === 'CALLING_STAT' && stuck);
  const chargeWhy = !humanTurn ? 'Available on your turn' : human.hp <= CH.minHp ? `Needs more than ${CH.minHp} HP` : chargeCooldown > 0 ? `Again in ${chargeCooldown} round${chargeCooldown > 1 ? 's' : ''}` : humanBlindMode ? 'Not while blinded' : !chargeSeat ? 'Leaders can gather only when no card is playable' : '';
  const canCharge = chargeWhy === '';
  const scoutReport = state.revealedScouter?.[human.id]?.round === state.roundNumber ? state.revealedScouter[human.id] : null;
  const [scoutOpen, setScoutOpen] = useState(false);
  const scoutKey = scoutReport ? `${scoutReport.round}:${scoutReport.targetId}` : '';
  useEffect(() => { setScoutOpen(Boolean(scoutKey)); }, [scoutKey]);
  const [sheetCardId, setSheetCardId] = useState(null);
  const [tourOpen, setTourOpen] = useState(() => !tutorialSeen(isStory())); // Battle Mode and Story Mode each show the tour once
  // While the tutorial is open the AI waits, so nothing moves behind the spotlight.
  useEffect(() => { onTutorialChange?.(tourOpen && !dealing); return () => onTutorialChange?.(false); }, [tourOpen, dealing]); // eslint-disable-line react-hooks/exhaustive-deps
  const [logOpen, setLogOpen] = useState(false);
  const [floaters, setFloaters] = useState([]);
  const prevVitals = useRef(null);
  const sheetCard = human.hand.find(c => c.id === sheetCardId) ?? null;
  const [powerKi, setPowerKi] = useState(0);
  const [rankKi, setRankKi] = useState(0);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);
  const [roundBanner, setRoundBanner] = useState(null);
  const lastBannerRound = useRef(0);
  useEffect(() => { if (dealing || !state.roundNumber || lastBannerRound.current === state.roundNumber) return undefined; lastBannerRound.current = state.roundNumber; setRoundBanner(state.roundNumber); const t = window.setTimeout(() => setRoundBanner(null), 1300); return () => window.clearTimeout(t); }, [state.roundNumber, dealing]);
  const [handSortMode, setHandSortMode] = useState('POWER');
  useEffect(() => { setPowerKi(0); setRankKi(0); setCardPreviewOpen(false); }, [selectedCard]);
  const selectedIsWildcard = (selectedCardData?.type || '').toUpperCase() === 'WILDCARD';
  const displayedPower = selectedCardData ? Math.min(999, selectedCardData.power + (selectedIsWildcard ? 0 : powerKi * 25)) : 0;
  const displayedRank = selectedCardData ? Math.max(1, selectedCardData.rank - (selectedIsWildcard ? 0 : rankKi * 3)) : 0;
  useEffect(() => { if (sheetCardId && !sheetCard) setSheetCardId(null); }, [sheetCardId, sheetCard]);
  // Floating HP / Soul deltas over each vessel + damage/heal sounds for the human.
  useEffect(() => {
    const now = Object.fromEntries(state.players.map(p => [p.id, { hp: p.hp, ki: p.ki }]));
    const prev = prevVitals.current; prevVitals.current = now;
    if (!prev) return;
    const added = [];
    for (const p of state.players) {
      const a = prev[p.id]; if (!a) continue;
      const dh = p.hp - a.hp, dk = p.ki - a.ki;
      if (dh) added.push({ id: `${p.id}-hp-${Date.now()}`, playerId: p.id, text: `${dh > 0 ? '+' : ''}${dh} HP`, kind: dh > 0 ? 'up' : 'down' });
      if (dk) added.push({ id: `${p.id}-ki-${Date.now()}`, playerId: p.id, text: `${dk > 0 ? '+' : ''}${dk} ${SOUL().toUpperCase()}`, kind: dk > 0 ? 'ki-up' : 'ki-down' });
      if (p.id === human.id) { if (dh < 0) gameSounds.damage(); else if (dh > 0) gameSounds.heal(); }
    }
    if (!added.length) return;
    setFloaters(list => [...list, ...added]);
    const ids = new Set(added.map(f => f.id));
    const timer = window.setTimeout(() => setFloaters(list => list.filter(f => !ids.has(f.id))), 1700);
    return () => window.clearTimeout(timer);
  }, [state.players.map(p => `${p.hp}:${p.ki}`).join('|')]);

  return (
    <main data-arena={arena?.id} className={`table-screen ${animations ? '' : 'no-anim'} ${dealing ? 'dealing' : ''} ${state.activeEffects?.totalMight ? 'fx-totalmight' : ''} ${state.reckoning ? 'fx-reckoning' : ''} ${state.domainInversionRounds > 0 ? 'fx-inverted' : ''} ${state.activeEffects?.highStakes ? 'fx-highstakes' : ''} ${state.phase === 'GM_DECREE' ? 'fx-decree' : ''}`} style={arena?.image ? { "--match-arena": `url("${arena.image}")` } : undefined}>
      {dealing && <DealOverlay players={state.players} animations={animations} onDone={onDealDone} />}
      {roundBanner && !dealing && <div className="round-banner" key={roundBanner} aria-hidden="true"><small>ROUND</small><strong>{roundBanner}</strong>{state.activeEffects?.timeChamber ? <em>HOLLOW HOUR</em> : null}{state.reckoning ? <em>FINAL RECKONING</em> : null}</div>}
      {cardPreviewOpen && selectedCardData && <CardPreview card={selectedCardData} power={displayedPower} rank={displayedRank} onClose={() => setCardPreviewOpen(false)} />}
      {state.phase === 'GM_DECREE' && !spotlight && !roundResult && !dealing && (state.currentPlayer === human.id ? <DecreeModal state={state} human={human} options={decreeOptions} onAct={onDecree} /> : <DecreeWaiting state={state} />)}
      <RoundResult result={roundResult} onSkip={onSkipResult} />
      <SpecialSpotlight item={spotlight} />
      {scoutReport && scoutOpen && <ScouterReport report={scoutReport} target={state.players.find(p => p.id === scoutReport.targetId)} onClose={() => setScoutOpen(false)} />}
      {sheetCard && <WildcardSheet card={sheetCard} status={wildcardStatus[sheetCard.id]} state={state} human={human} onClose={() => setSheetCardId(null)} onConfirm={(options) => { if (onUseWildcard?.(sheetCard.id, options)) setSheetCardId(null); }} />}
      <GameHeader twist={state.twist} round={state.roundNumber} mode={state.mode} direction={state.direction} reserve={state.reserveDeck.length} human={human} walletCoins={walletCoins} shopCount={characterRegistry.length} onHome={onHome} onOpenInfo={onOpenInfo} onOpenShop={onOpenShop} onOpenTutorial={() => setTourOpen(true)} />

      <section className={`game-table players-${state.mode}`}>
        <aside className="opponent-rail">
          {opponents.map((player, index) => (
            <OpponentArea
              key={player.id}
              ko={koIds.includes(player.id)}
              speech={speech[player.id]}
              onReact={onReact}
              player={player}
              position={positions[index]}
              active={player.id === state.currentPlayer}
              state={state}
              floaters={floaters.filter(f => f.playerId === player.id)}
            />
          ))}
          {human.hand.some(card => card.type === 'WILDCARD') && (
            <section className={`wildcard-action-panel ${isStory() ? 'story-powers' : ''} ${humanTurn && (state.phase === 'CALLING_STAT' || state.phase === 'PLAYING_CARD') ? 'wildcard-ready' : 'wildcard-waiting'}`}>
              <div className="wildcard-panel-heading">{isStory() ? 'POWERS' : 'EDICTS'} · ONE PER ROUND</div>
              <PowerStrip>
                {human.hand.filter(card => card.type === 'WILDCARD').map(card => {
                  const status = wildcardStatus[card.id] ?? { usable: false, reason: '' };
                  const attempted = card.effectId === 'CURSE' && state.curse?.attemptedThisRound && state.curse.ownerId === human.id;
                  return <button key={card.id} type="button" className={`wildcard-action ${isStory() ? '' : 'edict-image-only'} ${status.usable ? 'is-usable' : 'is-blocked'} ${attempted ? 'is-attempted' : ''}`} aria-label={card.story ? card.title : card.character} title={status.usable ? (isStory() ? 'Open this Power' : 'Open this Edict') : L(status.reason)} aria-disabled={!status.usable} onClick={() => { gameSounds.cue('modalOpen', 0.25); setSheetCardId(card.id); }}>
                    <img className="wildcard-action-image" src={card.image} alt="" aria-hidden="true" loading="eager" />
                    {isStory() && <><span>{card.story ? card.title : card.character}</span>
                    <small>{attempted ? 'Unraveling invoked this round' : status.usable ? (card.effectId === 'CURSE' ? 'Attempt / transfer / destroy' : 'Click to use') : L(status.reason || card.title)}</small>
                  {card.effectId !== 'CURSE' && (() => { const r = powerFacts(card).rows; return <em className="power-action-costs" aria-label="Cost summary"><b>{r[0].short}</b><b className={r[1].tone ?? ''}>{r[1].short}</b><b>{r[2].short}</b></em>; })()}</>}
                  </button>;
                })}
              </PowerStrip>
            </section>
          )}
          <div id="story-hud-slot" />
        </aside>

        <div className="table-center">
          <SpecialCorner state={state} logLines={logLines} logOpen={logOpen} onToggleLog={() => setLogOpen(v => !v)} />
          {scoutReport && !scoutOpen && <button type="button" className="scout-chip" onClick={() => setScoutOpen(true)} title="Reopen your Oracle’s Gaze report">GAZE REPORT</button>}
          <div className="gm-emblem" aria-hidden="true"><img src="/ui/monarque.webp" alt="" /></div><div className="gm-label">MONARQUE</div>
          <div className="turn-badge">{current?.name ?? '—'} {state.phase === 'CALLING_STAT' ? 'is calling' : 'is playing'}</div>
          <ol className="turn-order" aria-label="Turn order">{(() => { const alive = state.players.filter(p => p.hp > 0); const start = alive.findIndex(p => p.id === (state.currentTrick?.leaderId ?? state.currentPlayer)); const ordered = start < 0 ? alive : Array.from({ length: alive.length }, (_, i) => alive[(start + i * (state.direction === 1 ? 1 : -1) + alive.length * 4) % alive.length]); const playedIds = new Set((state.currentTrick?.plays ?? []).map(pl => pl.playerId)); return ordered.map(p => <li key={p.id} className={`${p.id === state.currentPlayer ? 'now' : ''} ${playedIds.has(p.id) ? 'done' : ''}`}>{p.id === human.id ? 'You' : p.name.replace('System ', 'S')}</li>); })()}</ol>
          <div className="call-indicator">
            {state.currentCall === 'TOTAL' ? <>TOTAL MIGHT: <strong>Power + Rank both count</strong></> : state.currentCall ? ((state.activeEffects?.publicForecast) ? <>PUBLIC FORECAST: <strong>{state.currentCall}</strong></> : state.currentTrick?.leaderId === human.id ? <>Your call: <strong>{state.currentCall}</strong></> : 'Leader’s stat call is hidden until reveal') : 'Select a card, then choose POWER or RANK'}
          </div>
          <CoachBar state={state} human={human} onOpenGuide={onOpenInfo} />
          <TrickArea trick={visibleTrick} players={state.players} reveal={!state.currentTrick || Boolean(state.activeEffects?.publicForecast)} />
        </div>

        <div className={`resource-meter hp-meter${spotlight?.sacrifice && spotlight.playerId === human.id ? ' is-wounded' : ''}`} aria-label={`Player health ${human.hp}`}>
          <strong>HP</strong><div className="resource-meter-track"><i style={{height:`${Math.max(0,Math.min(100,(human.hp ?? 100)/(human.maxHp ?? 100)*100))}%`}} /></div><b>{human.hp ?? 100}</b>{floaters.filter(f => f.playerId === human.id && f.kind.endsWith('up') === f.kind.endsWith('up') && !f.kind.startsWith('ki')).map(f => <span key={f.id} className={`floater ${f.kind}`}>{f.text}</span>)}
        </div>
        <aside className={`selected-card-dock ${selectedCardData ? 'has-card' : ''}`}>
          <div className="selected-card-title">SELECTED CARD</div>

          {selectedCardData ? (
            <>
              <button type="button" className="sel-art" onClick={() => setCardPreviewOpen(true)} aria-label={`Enlarge ${selectedCardData.character} card`} title="Click to enlarge"><CardArt card={selectedCardData} /><span className="sel-face-stats" aria-hidden="true"><b>P <span className={displayedPower !== selectedCardData.power ? 'boosted-stat' : ''}>{displayedPower}</span></b><b>R <span className={displayedRank !== selectedCardData.rank ? 'boosted-stat' : ''}>{displayedRank}</span></b></span><span className="sel-art-zoom" aria-hidden="true">⤢</span></button>
              


            </>
          ) : (
            <div className="selected-card-placeholder">
              <span>SELECT A CARD</span>
              <small>{humanBlindMode && selectedCard ? 'Blind slot selected; a legal card is chosen at random.' : 'Choose a card from your hand'}</small>
            </div>
          )}
          {humanTurn && selectedCard && state.phase === 'PLAYING_CARD' && <GameControls phase={state.phase} currentPlayer={state.currentPlayer} humanId={human.id} call={state.currentTrick?.leaderId === human.id ? state.currentCall : null} coins={human.coins} drawsUsed={human.drawsUsed} reserve={state.reserveDeck.length} maxDraws={GAME_CONFIG.draw.maxDrawsPerPlayerPerMatch} drawCost={GAME_CONFIG.draw.cost} handCount={human.hand.length} wildcardCount={human.hand.filter(card => card.type === 'WILDCARD').length} onDraw={onDraw} selectedCard={selectedCard} selectedCardInfo={selectedCardData} currentKi={human.ki} cardCost={selectedCost} onCall={onCall} onPlay={(boost) => onPlay?.(boost)} onClear={onClear} powerKi={powerKi} rankKi={rankKi} setPowerKi={setPowerKi} setRankKi={setRankKi} boostOnly />}{humanTurn && (state.phase === 'PLAYING_CARD' || state.phase === 'CALLING_STAT') && !hasLegalCharacter && <button className="pass-turn-button" onClick={onPass}>NO LEGAL CARD · PASS (−3 HP, +1 SOUL)</button>}
        </aside>

        <div className={`resource-meter ki-meter${spotlight?.sacrifice && spotlight.playerId === human.id ? " is-gathering" : ""}`} aria-label={`Player ${SOUL().toLowerCase()} ${human.ki}`}>
          <strong>{SOUL().toUpperCase()}</strong><div className="resource-meter-track"><i style={{height:`${Math.max(0,Math.min(100,(human.ki ?? 0)/(human.maxKi ?? 20)*100))}%`}} /></div><b>{human.ki ?? 0}</b>{floaters.filter(f => f.playerId === human.id && f.kind.startsWith('ki')).map(f => <span key={f.id} className={`floater ${f.kind}`}>{f.text}</span>)}
        </div>
        <div className={`human-area ${koIds.includes(human.id) ? "ko-flash" : ""} ${human.ki === 0 && human.hand.some(c => c.lastStand) ? 'last-stand-mode' : ''}`} data-pid={human.id}>
          <div className="human-profile">
            <div className="human-stat-choice" aria-label="Choose Power or Rank">
              {state.activeEffects?.totalMight
                ? <button type="button" className="human-stat-button power total" disabled={!humanTurn || state.phase !== 'CALLING_STAT' || !selectedCard} onClick={() => onCall('POWER')} title="The Weighing: Power and Rank both count">THE WEIGHING · GO</button>
                : <>
                  <button type="button" className={`human-stat-button power ${state.currentCall === 'POWER' ? 'active' : ''}`} disabled={!humanTurn || state.phase !== 'CALLING_STAT' || !selectedCard} onClick={() => onCall('POWER')}  title="Your secret call this round">CALL POWER</button>
                  <button type="button" className={`human-stat-button rank ${state.currentCall === 'RANK' ? 'active' : ''}`} disabled={!humanTurn || state.phase !== 'CALLING_STAT' || !selectedCard} onClick={() => onCall('RANK')}  title="Your secret call this round">CALL RANK</button>
                </>}
            </div>
            <div className="human-profile-main">
              <div className="human-avatar" aria-hidden="true"><b>{(human.name || '?').slice(0, 1).toUpperCase()}</b>{portraitFor(human.name) && <img className="avatar-img" src={portraitFor(human.name)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</div>
              <div className="human-profile-copy">
                <strong>{human.name}</strong>
                <span>{human.hand.length} cards · {human.hp} HP</span>
                <span>{human.ki} {SOUL()} · <span className="human-match-coins">{human.coins} match coins</span></span>
              </div>
              <span className={`active-pill ${human.id === state.currentPlayer ? 'is-turn' : ''}`}>{human.id === state.currentPlayer ? 'YOUR TURN' : 'WAITING'}</span>
            </div>
          </div>



          <PlayerHand
            cards={human.hand.filter(card => card.type !== 'WILDCARD')}
            enabled={human.id === state.currentPlayer && (state.phase === 'CALLING_STAT' || state.phase === 'PLAYING_CARD')}
            selectedId={selectedCard}
            lockedCardIds={human.lockedCardIds}
            blockedCardIds={state.noApexBlocked?.[human.id] ?? []}
            blindMode={Boolean(state.solarFlareLeader && state.solarFlareLeader !== human.id)}
            sealedCardIds={Object.keys(state.sealedCards ?? {})}
            ki={human.ki}
            
            sortMode={handSortMode}
            ownedCardIds={ownedCardIds}
            onSelect={onSelectCard}
          />

          {!selectedCard && humanTurn && state.phase === 'CALLING_STAT' && (
            <div className="hand-instruction">Select a card from your hand to choose POWER or RANK.</div>
          )}

          <div className="bottom-game-actions">
            <div className="bottom-primary-actions">
              <button
                type="button"
                className="bottom-play-button"
                disabled={!humanTurn || state.phase !== 'PLAYING_CARD' || !selectedCard || selectedIsWildcard}
                onClick={() => onPlay?.({ powerKi, rankKi })}
              >PLAY</button>
              <div className="gather-stack">
              <button className="gather-soul-button is-sacrifice" disabled={!canCharge} onClick={onCharge} aria-label={`${GATHER()}: a sacrifice. Lose ${GAME_CONFIG.charge.hp} HP, gain ${GAME_CONFIG.charge.ki} ${SOUL()}, forfeit this round.`} title={`${canCharge ? '' : chargeWhy + '. '}A sacrifice. You forfeit this round, give up ${GAME_CONFIG.charge.hp} HP and take ${GAME_CONFIG.charge.ki} ${SOUL()}. You cannot do it again for ${GAME_CONFIG.charge.cooldownRounds} rounds, nor at ${GAME_CONFIG.charge.minHp} HP or less. Responders only.`}>{GATHER().toUpperCase()}<small><em>−{GAME_CONFIG.charge.hp} HP</em><i aria-hidden="true">⟶</i><span>+{GAME_CONFIG.charge.ki} {SOUL().toUpperCase()}</span></small></button>
              {stuck && <button type="button" className="gather-soul-button is-pass" onClick={onPass} title={`No card you can play: pass the round. You lose ${GAME_CONFIG.passHpLoss} HP and gain 1 ${SOUL()}.`}>PASS<small><em>−{GAME_CONFIG.passHpLoss} HP</em><i aria-hidden="true">⟶</i><span>+1 {SOUL().toUpperCase()}</span></small></button>}
              {!canCharge && <span className="gather-why">{chargeWhy}</span>}
              </div>
              <div className="bottom-draw-control">
                <GameControls
                  phase={state.phase}
                  currentPlayer={state.currentPlayer}
                  humanId={human.id}
                  call={state.currentTrick?.leaderId === human.id ? state.currentCall : null}
                  coins={human.coins}
                  drawsUsed={human.drawsUsed}
                  reserve={state.reserveDeck.length}
                  maxDraws={GAME_CONFIG.draw.maxDrawsPerPlayerPerMatch}
                  drawCost={GAME_CONFIG.draw.cost}
                  handCount={human.hand.length}
                  wildcardCount={human.hand.filter(card => card.type === 'WILDCARD').length}
                  onDraw={onDraw}
                  selectedCard={null}
                  currentKi={human.ki}
                  onCall={onCall}
                  onPlay={onPlay}
                  onClear={onClear}
                  onlyDraw
                  drawnThisRound={state.drawnThisRound?.includes(human.id)}
                />
              </div>
            </div>
            <div className="bottom-sort-controls" aria-label="Sort hand cards">
              <span>SORT HAND BY</span>
              <button type="button" className={handSortMode === 'POWER' ? 'active' : ''} onClick={() => setHandSortMode('POWER')}>POWER</button>
              <button type="button" className={handSortMode === 'RANK' ? 'active' : ''} onClick={() => setHandSortMode('RANK')}>RANK</button>
              <button type="button" className={handSortMode === 'KI' ? 'active' : ''} onClick={() => setHandSortMode('KI')} title="Cheapest first">{SOUL().toUpperCase()}</button>
            </div>
          </div>
        </div>
      </section>

      {tourOpen && !dealing && <Tutorial mode={state.mode} story={isStory()} onClose={() => setTourOpen(false)} />}
      <LiveHints story={isStory()} state={state} humanId={human.id} selectedCard={selectedCard} enabled={!dealing && !tourOpen && !roundResult && !spotlight && !sheetCard && !scoutOpen && !cardPreviewOpen && state.phase !== 'GM_DECREE' && state.phase !== 'MATCH_COMPLETE'} />
      <footer className="phase-note">MONARQUE • CARDS OF THE FALLEN • LAST VESSEL STANDING • A GAME BY DHAMO SS</footer>
    </main>
  );
}
