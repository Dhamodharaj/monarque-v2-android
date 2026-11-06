import CoinDisplay from './CoinDisplay';
import { SOUL } from '../game/lexicon.js';
import AudioChip from './AudioChip';
import { twistOf } from '../game/twists.js';

export default function GameHeader({ round = 1, mode, direction, reserve, human, walletCoins = 0, shopCount = 60, onHome, onOpenInfo, onOpenShop, onOpenTutorial = null, twist = null }) {
  const tw = twistOf(twist);
  const directionLabel = direction === 1 ? 'Clockwise' : 'Counter-clockwise';

  return (
    <header className="game-header" aria-label="Match status">
      <div className="game-header-brand">
        <div className="game-header-topline">
          <button className="text-button" onClick={onHome}>← Exit match</button>
          <button className="info-button game-info-button" onClick={onOpenInfo} aria-label="How to play and game information" title="Rules and guide">i</button>
          {onOpenTutorial && <button className="info-button game-info-button tutorial-help-button" onClick={onOpenTutorial} aria-label="Tutorial: how to play step by step" title="Tutorial: how to play step by step">?</button>}
        </div>
        <h1 aria-label="Monarque: Cards of the Fallen"><span className="gh-name">MONARQUE</span><span className="gh-sub" aria-hidden="true">Cards of the Fallen</span></h1>
      </div>
      {/* Story Mode portals the opponent's circle icon and their spoken line in here (see StoryHud). Empty (and hidden) in Battle Mode. */}
      <div id="story-header-slot" className="game-header-voice" />

      <nav className="header-stats" aria-label="Current match settings">
        <span className="header-chip">{mode === 2 ? 'Duel' : `${mode} Vessels`}</span>
        <span className="header-chip">↻ {directionLabel}</span>
        {tw && <span className="header-chip twist-chip" title={tw.blurb}><span aria-hidden="true">{tw.icon}</span> {tw.name}</span>}
        <span className="header-chip round-chip">ROUND <b>{round}</b></span>
        <AudioChip />
        <span className="header-chip">Reserve <b>{reserve}</b></span>
        <span className="header-chip header-resource-chip">HP <b>{human.hp ?? 100}</b><span className="header-chip-separator">·</span> {SOUL().toUpperCase()} <b>{human.ki ?? 20}</b></span>
        <button className="header-chip header-shop-chip" onClick={onOpenShop} aria-label={`Open the Gallery, ${shopCount} cards`}>
          <span aria-hidden="true">◈</span><b>{shopCount}</b>
        </button>
        <span className="header-chip header-player-chip"><span aria-hidden="true">★</span> {human.name} <CoinDisplay coins={human.coins} /></span>
        <span className="header-chip header-wallet-chip"><span aria-hidden="true">◆</span> Wallet <CoinDisplay coins={walletCoins} /></span>
      </nav>
    </header>
  );
}
