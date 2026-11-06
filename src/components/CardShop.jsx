import { useMemo, useState } from 'react';
import CoinDisplay from './CoinDisplay';
import { getCardPrice } from '../services/shop.js';
import { WILDCARD_CARDS, CRAZY_ROUNDS, GM_POWERS } from '../game/SpecialCards.js';
import { OMENS, CONTENDERS } from '../data/monarque.generated.js';
const initials = (n = '') => String(n).replace(/[^\p{L}\s/-]/gu, '').split(/[\s/-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '✦';
const pretty = (t = '') => String(t).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const OMEN_TEXT = Object.fromEntries(OMENS.map(o => [o.id, o.description]));

const RARITY_FILTERS = ['ALL', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const SHOP_SECTIONS = [
  { id: 'ALL', label: 'ALL CARDS', icon: '✦' },
  { id: 'CHARACTER', label: 'BOUND BEINGS', icon: '♛' },
  { id: 'CONTENDER', label: 'CONTENDERS', icon: '♜' },
  { id: 'WILDCARD', label: 'EDICTS', icon: '✧' },
  { id: 'CRAZY_ROUND', label: 'OMENS', icon: '☄' },
  { id: 'GM_POWER', label: 'WHIMS', icon: '◇' },
];

export default function CardShop({ cards, walletCoins, ownedCardIds = [], onBuy, onClose, embedded = false }) {
  const [filter, setFilter] = useState('ALL');
  const [section, setSection] = useState('ALL');
  const [query, setQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const owned = useMemo(() => new Set(ownedCardIds), [ownedCardIds]);
  const catalog = useMemo(() => {
    const wildcards = WILDCARD_CARDS.map(card => ({ ...card, rarity: 'SPECIAL', shopKind: 'WILDCARD' }));
    const crazyRounds = CRAZY_ROUNDS.map(round => ({ id: `omen-${round.id}`, character: round.name, form: 'Omen', title: round.name, description: `${OMEN_TEXT[round.id] ?? ''} Lasts ${round.duration} round${round.duration === 1 ? '' : 's'}. An event rule, not a purchasable card.`, type: 'CRAZY_ROUND', category: 'OMEN', rarity: 'SPECIAL', image: round.image || '', shopKind: 'CRAZY_ROUND' }));
    const powers = GM_POWERS.map(power => ({ id: `whim-${power.id}`, character: power.name, form: 'Whim', title: power.name, description: `${power.telegraph ?? ''} A whim of Monarque, shown for reference and not a purchasable card.`, type: 'GM_POWER', category: 'WHIM', rarity: 'SPECIAL', image: power.image || '', shopKind: 'GM_POWER' }));
    const contenders = CONTENDERS.map(c => ({ id: c.id, character: c.character, form: c.form, title: c.title, description: c.description, personality: c.personality, category: c.category, rarity: c.rarity, image: c.image, type: 'CHARACTER', series: 'CONTENDER', isContender: true, shopKind: 'CONTENDER', temperament: c.temperament }));
    return [...cards, ...contenders, ...wildcards, ...crazyRounds, ...powers];
  }, [cards]);

  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((card) => {
      const type = String(card.type || 'CHARACTER').toUpperCase();
      const category = String(card.category || '').toUpperCase();
            const matchesSection = section === 'ALL' || (section === 'CHARACTER' && type === 'CHARACTER' && !card.isContender) || (section === 'CONTENDER' && card.isContender) || (section === 'WILDCARD' && type === 'WILDCARD') || (section === 'CRAZY_ROUND' && type === 'CRAZY_ROUND') || (section === 'GM_POWER' && type === 'GM_POWER');
      const matchesFilter = filter === 'ALL' || card.rarity === filter;
      const matchesQuery = !q || [card.character, card.form, card.title, card.series, card.category, card.description]
        .filter(Boolean).some(value => String(value).toLowerCase().includes(q));
      return matchesSection && matchesFilter && matchesQuery;
    });
  }, [catalog, filter, query, section]);

  const buySelected = () => {
    if (!selectedCard) return;
    const price = getCardPrice(selectedCard);
    if (owned.has(selectedCard.id) || walletCoins < price) return;
    onBuy(selectedCard);
  };

  const content = (
    <section className={`card-shop ${embedded ? 'card-shop-embedded' : ''}`}>
      <header className="shop-blue-header">
        <div className="shop-blue-title"><h1>GALLERY OF THE BOUND <em>(Witness the fallen.)</em></h1></div>
        <div className="shop-wallet shop-wallet-featured"><CoinDisplay coins={walletCoins} /><span>COINS</span></div>
      </header>

      <div className="shop-market-layout">
        <aside className="shop-category-sidebar" aria-label="Card categories">
          {SHOP_SECTIONS.map(item => {
            const count = item.id === 'ALL' ? catalog.length : item.id === 'CHARACTER' ? cards.length : item.id === 'CONTENDER' ? CONTENDERS.length : item.id === 'WILDCARD' ? WILDCARD_CARDS.length : item.id === 'CRAZY_ROUND' ? CRAZY_ROUNDS.length : GM_POWERS.length;
            return <button key={item.id} className={`shop-category-button ${section === item.id ? 'active' : ''} ${count === 0 && item.id !== 'ALL' && item.id !== 'CHARACTER' ? 'category-unavailable' : ''}`} onClick={() => { setSection(item.id); setFilter('ALL'); }}>
              <span className="shop-category-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
            </button>;
          })}
          <div className="shop-sidebar-note">THE BOUND<br/><span>Every being here was a name once.</span></div>
        </aside>

        <div className="shop-market-content">
          <div className="shop-market-toolbar">
            <label className="shop-search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search beings, edicts or forms..." aria-label="Search cards" /></label>
            <div className="shop-filters" aria-label="Filter by rarity">
              {RARITY_FILTERS.map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'ALL' ? 'ALL RARITIES' : item}</button>)}
            </div>
            <div className="shop-count">{visibleCards.length} / {catalog.length} cards <span>•</span> {owned.size} owned</div>
          </div>

          {visibleCards.length ? <div className={`shop-grid ${section !== 'ALL' && section !== 'CHARACTER' && section !== 'CONTENDER' ? 'shop-special-grid' : ''}`}>
            {visibleCards.map(card => {
              const isBuyable = (card.type || 'CHARACTER').toUpperCase() === 'CHARACTER' && !card.shopKind;
              const isOwned = owned.has(card.id);
              const price = getCardPrice(card);
              return (
                <article className={`shop-card ${isOwned ? 'owned' : ''}`} key={card.id} role="button" tabIndex={0} onClick={() => setSelectedCard(card)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCard(card); } }}>
                  <div className={`shop-card-preview tone-${String(card.rarity || "COMMON").toLowerCase()}`}>
                    {card.image ? <><img src={card.image} alt={`${card.character} ${card.form}`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.add('visible'); }} /><div className="shop-art-fallback"><b>{initials(card.character)}</b></div></> : <div className="shop-art-fallback visible"><b>{initials(card.character)}</b></div>}
                    <span className="shop-card-rarity">{card.rarity || 'COMMON'}</span>
                    <div className="shop-card-nameplate"><strong>{card.character}</strong><span>{card.form}</span></div>
                  </div>
                  <div className="shop-card-purchase-row">
                    <span className="shop-coin-medallion" aria-hidden="true">★</span><strong>{price}</strong>
                    <button className="shop-cart-button" aria-label={`${!isBuyable ? 'Not purchasable' : isOwned ? 'Owned' : walletCoins < price ? 'Not enough coins' : 'Buy'} ${card.character}`} title={!isBuyable ? 'This entry cannot be purchased' : isOwned ? 'Already owned' : walletCoins < price ? 'Not enough coins' : 'Buy card'} disabled={!isBuyable || isOwned || walletCoins < price} onClick={event => { event.stopPropagation(); if (isBuyable && !isOwned && walletCoins >= price) onBuy(card); }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H7"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div> : <div className="shop-empty-state"><span>◇</span><h2>{section === 'ALL' || section === 'CHARACTER' ? 'No cards match your search' : 'No cards match these filters'}</h2><p>{section === 'ALL' || section === 'CHARACTER' ? 'Try another being, form, or rarity.' : 'Try clearing the rarity filter or changing your search.'}</p>{section !== 'ALL' && <button onClick={() => { setSection('ALL'); setFilter('ALL'); setQuery(''); }}>VIEW ALL CARDS</button>}</div>}
        </div>
      </div>

      {selectedCard && (
        <div className="shop-detail-overlay" onClick={() => setSelectedCard(null)}>
          <div className="shop-detail-panel" onClick={event => event.stopPropagation()}>
            <button className="shop-detail-close" onClick={() => setSelectedCard(null)} aria-label="Close card details">×</button>
            <div className="shop-detail-card-art">{selectedCard.image ? <><img src={selectedCard.image} alt={`${selectedCard.character} ${selectedCard.form}`} onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.add('visible'); }} /><div className="shop-art-fallback large"><b>{initials(selectedCard.character)}</b></div></> : <div className="shop-art-fallback large visible"><b>{initials(selectedCard.character)}</b></div>}</div>
            <div className="shop-detail-info"><p className="eyebrow">{selectedCard.isContender ? 'THE CONTENDERS' : 'THE BOUND'}</p><h2>{selectedCard.character}</h2><h3>{selectedCard.form} · {selectedCard.title}</h3>
              <div className="shop-detail-tags"><span>{pretty(selectedCard.rarity)}</span>{selectedCard.category && <span>{pretty(selectedCard.category)}</span>}{selectedCard.temperament && <span>{pretty(selectedCard.temperament)}</span>}{selectedCard.powerGroup && <span>{pretty(selectedCard.powerGroup === 'WEAK' ? 'ELUSIVE' : selectedCard.powerGroup)}</span>}</div>
              <p className="shop-detail-description">{selectedCard.description || 'No description available.'}</p>
              {!selectedCard.isContender && !selectedCard.shopKind && <div className="shop-detail-stats"><div><small>POWER</small><strong>{selectedCard.power}</strong></div><div><small>RANK</small><strong>{selectedCard.rank}</strong></div>{Number.isInteger(selectedCard.soulCost) && <div><small>SOUL COST</small><strong>{selectedCard.soulCost}</strong></div>}</div>}
              <div className="shop-detail-purchase"><div><small>PRICE</small><strong>{getCardPrice(selectedCard)} ★</strong></div>{!((selectedCard.type || 'CHARACTER').toUpperCase() === 'CHARACTER' && !selectedCard.shopKind) ? <button className="shop-owned-button" disabled>REFERENCE ONLY</button> : owned.has(selectedCard.id) ? <button className="shop-owned-button" disabled>OWNED</button> : <button className="shop-buy-large" disabled={walletCoins < getCardPrice(selectedCard)} onClick={buySelected}>{walletCoins < getCardPrice(selectedCard) ? 'NOT ENOUGH COINS' : 'BUY CARD'}</button>}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (!embedded) {
    return <main className="shop-screen">{content}<button className="shop-close-page" onClick={onClose}>← Back</button></main>;
  }

  return <div className="shop-overlay"><div className="shop-overlay-backdrop" onClick={onClose} /> <div className="shop-modal">{content}<button className="shop-modal-close" onClick={onClose}>×</button></div></div>;
}
