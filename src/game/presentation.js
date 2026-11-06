// Turns structured engine events into player-facing copy, spotlight payloads and sound cues.
import { GAME_CONFIG } from '../config/gameConfig.js';
import { powerFactsFromEvent } from './powerFacts.js';
const EV = GAME_CONFIG.events;
const SEAL = GAME_CONFIG.mafubaSealRounds;
const CHARGE_COOLDOWN = GAME_CONFIG.charge.cooldownRounds;

export const CRAZY_TEXT = {
  PUBLIC_FORECAST: 'The call and every card on the table are visible for 2 rounds.',
  NO_APEX: 'Every vessel’s best Power card and best Rank card fall silent this round.',
  TOTAL_MIGHT: 'No call: Power and Rank are weighed together. Balance carries the round.',
  BACKWARDS: 'The LOWER stat wins this round. The last become first.',
  WISH_ROUND: 'The round’s victor is granted a boon: heal, Soul, take a being or clear cooldowns.',
  HIGH_STAKES: 'All HP won and lost on placement is doubled this round.',
  ZENKAI: 'The vessel with the least HP plays at +100 Power and −8 Rank.'
};
const WILD_TEXT = {
  SENZU: '+25 HP, +5 Soul and cooldowns −1.', FINAL_ATONEMENT: 'The rite is concluded. −15 HP to the user, −17 HP to everyone else. The round ends.',
  MAFUBA: `A played card is sealed for ${SEAL} rounds.`, SCOUTER: 'Scans an opponent’s Soul and best cards.', SOLAR_FLARE: 'Opponents must play blind this round.',
  OTHER_WORLD: 'The Inverted Realm — the LOWER stat wins for 2 rounds.', CURSE: 'The Unraveling is invoked…', SHENRON_WISH: 'A boon is granted.'
};
export const SIDE_QUEST_TEXT = { WIN_CALL: (q) => `Win the round on a ${q.call} call.`, WIN_CHEAP: () => 'Win with a card that costs 1 Soul or less.', WIN_BOOSTED: () => 'Win with a boosted card.', UPSET: () => 'Win while having the lowest HP.' };

export const eventTone = (ev) => ev.type === 'GM_POWER' || ev.type === 'SIDE_QUEST_DONE' || ev.type === 'DECREE_RESULT' ? 'gm' : ev.type === 'CRAZY_ROUND' ? 'crazy' : ev.type === 'CURSE_OUTCOME' ? 'curse' : ev.type === 'ELIMINATION' ? 'ko' : ev.type === 'LAST_STAND' ? 'laststand' : ev.type === 'WILDCARD_USED' ? 'wild' : ev.type === 'CHARGE' ? 'sacrifice' : 'info';

export function describeEvent(ev, nameOf) {
  const n = (id) => nameOf(id) ?? 'A vessel';
  switch (ev.type) {
    case 'GM_TELEGRAPH': return { title: 'Monarque stirs…', text: 'Something is coming next round.', kicker: 'A STIRRING' };
    case 'GM_POWER': {
      const d = ev.detail ?? {};
      const text = ({
        DRAGON_BALL_DRAFT: 'Cards are laid on the table. The weakest vessel drafts first — everyone takes one.',
        SACRED_AUCTION: `Bid 0–${d.maxBid ?? EV.auction.maxBid} Soul in secret. The single highest bid wins +${EV.auction.heal} HP. Everyone pays.`,
        TRAINING_ARC: `Every vessel hones one card: +${EV.training.power} Power or −${EV.training.rank} Rank, for good.`,
        BOUNTY_HUNT: `${n(d.targetId)} is named in debt. Place above them for +${d.hp} HP and +${d.ki} Soul — and if they finish last, −${d.penalty} HP.`,
        SIDE_QUEST: `${d.quest ? (SIDE_QUEST_TEXT[d.quest.type]?.(d.quest) ?? d.quest.text) : ''} First to do it: +${EV.sideQuest.hp} HP, +${EV.sideQuest.ki} Soul.`,
        TIME_CHAMBER: `Everyone +${EV.timeChamber.ki} Soul and cooldowns cleared — but HP lost is ×${EV.timeChamber.lossMult} for ${EV.timeChamber.rounds} rounds.`,
        CURSE_INJECTION: `The Unraveling is laid upon ${n(d.targetId)}.`,
        GM_GIFT: `${n(d.targetId)} is granted an Edict: ${d.card?.character ?? 'a card'}.`,
        DIVINE_SWAP: `${n(d.aId)} and ${n(d.bId)} trade ${d.cardFromA?.character ?? 'a card'} for ${d.cardFromB?.character ?? 'a card'}.`
      })[ev.effectId] ?? '';
      return { title: ev.card?.title ?? ev.effectId, text, kicker: 'MONARQUE’S WHIM' };
    }
    case 'CRAZY_ROUND': return { title: ev.name, text: CRAZY_TEXT[ev.effectId] ?? '', kicker: `OMEN${ev.rounds > 1 ? ` · ${ev.rounds} ROUNDS` : ''}` };
    case 'DECREE_START': return null;
    case 'DECREE_PICK': {
      if (ev.kind === 'DRAFT') return { title: `${n(ev.playerId)} drafts ${ev.card?.character ?? 'a card'}`, text: '' };
      if (ev.kind === 'TRAINING') return { title: `${n(ev.playerId)} trains ${ev.card?.character ?? 'a card'}`, text: ev.stat === 'POWER' ? `Power is now ${ev.card?.power}.` : `Rank is now ${ev.card?.rank}.` };
      if (ev.kind === 'AUCTION') return { title: `${n(ev.playerId)} placed a secret bid`, text: '' };
      return null;
    }
    case 'DECREE_RESULT': {
      if (ev.kind === 'AUCTION') {
        const bids = Object.entries(ev.bids ?? {}).map(([id, b]) => `${n(id)} ${b}`).join(' · ');
        return { title: ev.winnerId ? `${n(ev.winnerId)} wins the tithe.` : (ev.tie ? 'Tied bids cancel out.' : 'Nobody bid'), text: `${bids}${ev.winnerId ? ` — +${ev.heal} HP, +${ev.ki} Soul back.` : ''}`, kicker: 'THE SILENT TITHE' };
      }
      if (ev.kind === 'WISH') {
        const t = ({ HEAL: `+${EV.wish.heal} HP.`, KI: `+${EV.wish.ki} Soul.`, RECALL: 'All cooldowns cleared.', THIEF: `Steals ${ev.card?.character ?? 'a card'} from ${n(ev.victimId)}.` })[ev.wish] ?? '';
        return { title: `${n(ev.playerId)} is granted ${({ HEAL: 'Mending', KI: 'Soul', RECALL: 'Recall', THIEF: 'a Taken Being' })[ev.wish] ?? 'a boon'}`, text: t, kicker: 'THE BOON ROUND' };
      }
      return null;
    }
    case 'DECREE_END': return null;
    case 'GIANT_SLAYER': return { title: `${n(ev.playerId)} fells a giant.`, text: `${ev.card?.character} beat ${ev.victim?.character} — +${ev.hp} HP, +${ev.ki} Soul`, kicker: 'GIANT FELLED', image: ev.card?.image };
    case 'SIDE_QUEST_DONE': return { title: `${n(ev.playerId)} completes the Trial.`, text: `+${ev.hp} HP, +${ev.ki} Soul`, kicker: 'A TRIAL SET' };
    case 'BOUNTY_RESULT': return { title: ev.beaten?.length ? `The debt is collected by ${ev.beaten.map(n).join(' & ')}` : 'The named vessel survives the debt', text: '' };
    case 'LAST_STAND': return { title: `${n(ev.playerId)} makes a LAST STAND.`, text: `${ev.shielded ? 'Shielded from HP loss · ' : ''}+${ev.ki} Soul — the rite goes on.`, kicker: 'LAST STAND', image: ev.card?.image };
    case 'WILDCARD_USED': {
      const d = ev.detail ?? {};
      let text = WILD_TEXT[ev.effectId] ?? '';
      if (ev.effectId === 'SHENRON_WISH') text = ({ IMMORTALITY: 'Unbreaking — no HP damage for 2 rounds.', ABSOLUTE_POWER: 'Absolute Measure — this card’s stat is doubled.', DIVINE_DESTRUCTION: 'Culling — every opponent loses a card.' })[d.wish] ?? text;
      if (ev.effectId === 'SCOUTER') text = `${n(d.targetId)} is scanned.`;
      if (ev.effectId === 'MAFUBA') text = `Sealed for ${SEAL} rounds${d.paidKi ? ` (−${d.paidKi} Soul)` : ''}.`;
      if (d.story) { text = [d.story.name ? `${d.story.fighter}’s Power` : '', ...(d.story.applied ?? [])].filter(Boolean).join(' · ') || text; return { title: d.story.name ?? ev.card?.character ?? 'Power', text, facts: powerFactsFromEvent(ev), kicker: `${n(ev.playerId).toUpperCase()} UNLEASHES ${String(d.story.fighter ?? '').toUpperCase()}’S POWER` }; }
      return { title: ev.card?.character ?? 'Edict', text, facts: powerFactsFromEvent(ev), kicker: `${n(ev.playerId).toUpperCase()} INVOKES AN EDICT` };
    }
    case 'CURSE_OUTCOME': {
      const t = { DESTROYED: ['The Unraveling Broken', `${n(ev.holderId)} breaks the Unraveling and punishes the rest.`], TRANSFERRED: ['The Unraveling Passed', `${n(ev.holderId)} passes the Unraveling to ${n(ev.newHolderId)}.`], FAILED: ['The Unraveling Deepens', `Severity rises to ${ev.severity + 1}.`], RETAINED: ['The Unraveling Holds', `${n(ev.holderId)} keeps the Unraveling.`], VOID: ['The Unraveling Falters', 'The attempt was not counted.'] }[ev.outcome];
      return { title: t?.[0] ?? 'The Unraveling', text: t?.[1] ?? '', kicker: 'THE UNRAVELING' };
    }
    case 'ROUND_RESULT': return { title: `${n(ev.winnerId)} wins the round`, text: ev.call ? `${ev.call === 'TOTAL' ? 'THE WEIGHING' : `${ev.call} call`}${ev.inverted ? ' (inverted)' : ''}` : '' };
    case 'ELIMINATION': return { title: `${n(ev.playerId)} is eliminated`, text: ev.reason === 'SPENT' ? 'Out of Soul, out of cards, too weak to Gather. Nothing left to fight with.' : ev.reason === 'LAST_STAND' ? 'Out of Soul and out of Last Stands.' : 'No HP left.', kicker: 'ELIMINATED' };
    case 'STALEMATE': return { title: 'Monarque ends the stalemate', text: `${n(ev.winnerId)} is favoured.`, kicker: 'ENOUGH' };
    case 'LAST_BREATH': return { title: `${n(ev.playerId)} draws a LAST BREATH.`, text: `+${ev.ki} Soul, and the next blow lands at half strength.`, kicker: 'NOT YET' };
    case 'FINAL_RECKONING': return { title: 'FINAL RECKONING', text: 'Both fighters are nearly spent. Every wound counts for 50% more.', kicker: 'THE END IS NEAR' };
    case 'CHARGE': return { title: `${n(ev.playerId)} bleeds for Soul`, text: `${ev.hp} HP given up, ${ev.ki} Soul taken. The round is forfeit, and the rite cannot be repeated for ${CHARGE_COOLDOWN} rounds.`, kicker: 'A SACRIFICE', sacrifice: { hp: ev.hp, ki: ev.ki } };
    case 'DRAW': return { title: `${n(ev.playerId)} drew a card`, text: '' };
    case 'SEAL_RELEASED': return { title: 'A sealed card is released', text: `${n(ev.playerId)}` };
    default: return null;
  }
}
/** One-line summary of a power's facts for the round log. */
export const factsLine = (facts) => (facts ? facts.map((r) => r.short).join(' · ') : '');
export const spotlightTypes = new Set(['GM_POWER', 'CRAZY_ROUND', 'WILDCARD_USED', 'ELIMINATION', 'LAST_STAND', 'SIDE_QUEST_DONE', 'GIANT_SLAYER', 'CHARGE', 'LAST_BREATH', 'FINAL_RECKONING']);
export const wantsSpotlight = (ev) => spotlightTypes.has(ev.type) || (ev.type === 'DECREE_RESULT') || (ev.type === 'CURSE_OUTCOME' && ['DESTROYED', 'TRANSFERRED', 'FAILED'].includes(ev.outcome));

const GM_CUES = { DRAGON_BALL_DRAFT: 'draftPick', SACRED_AUCTION: 'auctionHit', TRAINING_ARC: 'training', BOUNTY_HUNT: 'bounty', SIDE_QUEST: 'sideQuest', TIME_CHAMBER: 'timeChamber', DIVINE_SWAP: 'DIVINE_SWAP', CURSE_INJECTION: 'CURSE_INJECTION' };
/** Returns [[cueKey, delayMs, level], …] for an engine event (empty when it has no sound). */
export function soundsForEvent(ev) {
  switch (ev.type) {
    case 'GM_TELEGRAPH': return [['gmRumble', 0, 0.9]];
    case 'GM_POWER': return [['gmDecree', 0, 1], [GM_CUES[ev.effectId] ?? 'gmWarn', 900, 0.8]];
    case 'CRAZY_ROUND': return [['crazySiren', 0, 0.9], [ev.effectId, 700, 0.8]];
    case 'LAST_STAND': return [['lastStand', 0, 1], ['shield', 1700, 0.8]];
    case 'LAST_BREATH': return [['wishGlow', 0, 0.9], ['shield', 900, 0.7]];
    case 'FINAL_RECKONING': return [['crazySiren', 0, 0.8]];
    case 'SIDE_QUEST_DONE': return [['reward', 0, 0.9]];
    case 'GIANT_SLAYER': return [['cardSlam', 0, 0.9], ['reward', 350, 0.8]];
    case 'DECREE_PICK': return [[ev.kind === 'DRAFT' ? 'draftPick' : ev.kind === 'TRAINING' ? 'training' : 'auctionTick', 0, 0.8]];
    case 'DECREE_RESULT': return [[ev.kind === 'AUCTION' ? 'auctionHit' : 'wishGlow', 0, 0.9]];
    case 'CHARGE': return [['sacrifice', 0, 1]];
    case 'WILDCARD_USED': return [[ev.effectId === 'SHENRON_WISH' && ev.detail?.wish === 'IMMORTALITY' ? 'wishGranted' : (ev.effectId ?? 'wildcard'), 0, 0.9]];
    case 'CURSE_OUTCOME': return [['CURSE', 0, 0.9]];
    case 'ROUND_START': return [['round', 0, 0.6]];
    default: return [];
  }
}
