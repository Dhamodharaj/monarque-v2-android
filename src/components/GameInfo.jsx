import { useState } from 'react';

const sections = [
  { title:'Game Overview', icon:'▤', body:'Survive the table. Every vessel begins with 100 HP, manages Soul to play stronger beings, and uses POWER or RANK to win each round. The last vessel standing wins.', items:['Your being cards return to your hand after play unless a rule removes them.','Match coins are separate from your persistent Gallery wallet.','Opponent hands and Soul remain hidden unless an effect reveals them.'] },
  { title:'New Player Quick Start', icon:'★', items:['Pick a card and tap CALL POWER or CALL RANK (only the round leader calls). POWER: highest wins. RANK: lowest number wins.','Everyone else plays one card in turn order. Cards are hidden until all have played.','Best placement gains HP/Soul/coins; worst loses HP. HP 0 = eliminated. Last vessel standing wins.','Every card costs Soul (the ⚡ badge). Strong cards cost more, so save them for rounds that matter.','Optional: spend extra Soul on a boost (+25 Power or −3 Rank per Soul) before pressing PLAY.','Watch for Monarque’s Whim and Omen banners: they change the rules for a round or two.','Press LOG any time to see what just happened.'] },
  { title:'Turn Flow', icon:'⇄', items:['The current leader chooses POWER or RANK and commits a being card.','Other active vessels commit one eligible being card in turn order.','All committed cards reveal; the called stat is compared and placements are calculated.','HP damage, Soul changes, coins, boosts and special effects resolve.','Cards enter cooldown or are banished according to placement and card rules.','The next round begins with the next leader.'] },
  { title:'HP & Soul System', icon:'♡', items:['Each vessel starts with 100 HP. Reaching 0 HP eliminates that vessel after round effects resolve.','Soul starts at 14 and is capped at 20. There is no automatic refill — Soul is earned by placing LOW. A card can only be committed if its cost is affordable.','The ⚡ number on each card is its Soul cost: Normal 1, Powerful 3, Sovereign/OP 5. Last-Stand cards cost 0 but need you to be at 0 Soul. Winning is expensive: strong cards drain Soul, so the leader runs dry first.','If you have no playable card you must PASS: −3 HP, +1 Soul. As a responder you may also GATHER SOUL on purpose: skip the round for −5 HP, +4 Soul (needs more than 20 HP, once every 3 rounds).','Placement rewards and penalties change HP, Soul and match coins. HP and Soul cannot exceed their caps.'] },
  { title:'Card Types', icon:'◈', items:['LAST STAND (weak): every vessel holds exactly 2 of these. They cost 0 Soul and can ONLY be played at 0 Soul. Playing one is a true Last Stand: you take no HP loss from placement that round, you gain +3 Soul, and the card is spent. Once your Soul is back above 0 the match simply carries on — a vessel is only finished by running out of HP (or by running dry of Soul and Last Stands while the Unraveling keeps draining them).','Normal: costs 1 Soul and forms the dependable core of a hand.','Powerful: costs 3 Soul and generally has high Power or a strong Rank.','Sovereign / OP: costs 5 Soul and represents the highest-cost tier of being.','Being cards can receive tier-limited Power or Rank boosts before commitment.'] },
  { title:'Edicts', icon:'♨', items:['A vessel may activate one Edict per round before committing a being, unless a rule prevents it.','The Last Draught restores 25 HP and 5 Soul and reduces remaining cooldowns.','The Oracle’s Gaze reveals an opponent’s Soul and selected cards; the Blinding Eclipse forces opponents to choose a blind slot.','The Binding Seal seals a card already on the table for 10 rounds (needs three vessels standing) and skips the user’s normal being play.','Monarque’s Boon offers one of its defined boons for 4 Soul, once per match. The Reckoning damages its user and opponents and ends the round immediately.'] },
  { title:'The Unraveling', icon:'☠', items:['The Unraveling stays with its holder and drains HP and Soul at normal round resolution.','A holder may attempt to resolve it using their Edict action for that round.','Qualifying decisive placements can destroy or transfer it; failed attempts can build toward a lockout.','If it is absent from opening hands, reserve draws guarantee it by the fifth eligible draw.'] },
  { title:'Monarque', icon:'♟', items:['Monarque intervenes with a Whim at rounds 4, 8 and 12 (a stirring appears the round before): The Culling Draft (everyone drafts a card), The Silent Tithe (secret Soul bids for +15 HP), Rite of the Whetstone (+40 Power or −5 Rank on one card), The Debt Called, A Trial Is Set, The Hollow Hour, Rite of Exchange or The Unraveling Laid Upon.','Interactive whims open a window for you to choose; the others resolve at once. Whims and Omens never overlap.','Omens: The Open Eye, The Hushed Crowns, The Weighing (Power + Rank both count), The Reversed Hour (lower stat wins), The Boon Round (winner is granted a boon), Debt Doubled (HP ×2) and Desperate Surge (comeback boost).','Active effects and durations are shown at the table while they apply.'] },
  { title:'Scoring & Rewards', icon:'♜', items:['Four-vessel placement rewards: 1st gains +3 HP and +2 coins (no Soul); 2nd gains +1 HP, +1 Soul and +1 coin.','In four-vessel play, 3rd loses 10 HP but gains 2 Soul; 4th loses 15 HP but gains 3 Soul (losing makes you hungrier).','In a two-vessel duel, the winner gains +3 HP and +2 coins; the loser loses 10 HP but gains 3 Soul.','Played cards rest before they can be used again: 2 rounds after a top-two finish, 1 after a bottom finish — plus 1 extra round for Powerful cards and 2 for Sovereign/OP cards.','Draws cost 3 match coins, are limited to three per match, and the drawn card is playable from the next round.'] }
];

export default function GameInfo({ onClose }) {
  const [activeTitle, setActiveTitle] = useState('New Player Quick Start');
  const active = sections.find(section => section.title === activeTitle) || sections[0];
  return (
    <div className="game-info-overlay" role="dialog" aria-modal="true" aria-labelledby="game-info-title">
      <button className="game-info-backdrop" aria-label="Close game information" onClick={onClose} />
      <section className="game-info-modal game-info-modal-redesign">
        <header className="guide-titlebar">
          <div><h2 id="game-info-title">RULES &amp; GUIDE</h2></div>
          <button className="game-info-close guide-close" onClick={onClose} aria-label="Close rules and guide">×</button>
        </header>
        <div className="guide-layout">
          <nav className="guide-sidebar" aria-label="Guide topics">
            {sections.map(section => (
              <button key={section.title} className={`guide-nav-item ${activeTitle === section.title ? 'active' : ''}`} onClick={() => setActiveTitle(section.title)} aria-current={activeTitle === section.title ? 'page' : undefined}>
                <span className="guide-nav-icon" aria-hidden="true">{section.icon}</span><span>{section.title}</span>
              </button>
            ))}
          </nav>
          <article className="guide-content" key={active.title}>
            <div className="guide-content-heading"><h3>{active.title}</h3><span /></div>
            {active.body && <p className="guide-overview-copy">{active.body}</p>}
            {(active.title === 'Turn Flow' || active.title === 'New Player Quick Start') ? (
              <ol className="guide-turn-steps">{active.items.map((item, index) => <li key={item}><span className="guide-step-number">{index + 1}</span><p>{item}</p></li>)}</ol>
            ) : (
              <ul className="guide-topic-list">{active.items.map(item => <li key={item}>{item}</li>)}</ul>
            )}
            <div className="guide-content-footer">MONARQUE: CARDS OF THE FALLEN <span>•</span> BATTLE RULES</div>
          </article>
        </div>
      </section>
    </div>
  );
}
