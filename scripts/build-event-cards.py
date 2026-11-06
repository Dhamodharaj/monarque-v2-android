#!/usr/bin/env python3
"""Rewrites the GM_POWER and CRAZY_ROUND records of src/data/cards.json (the v9 "events rework").
Characters and Wildcards are left untouched. Usage: python3 scripts/build-event-cards.py"""
import json, os

PATH = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'cards.json')
cards = json.load(open(PATH, encoding='utf8'))
keep = [c for c in cards if c['type'] not in ('GM_POWER', 'CRAZY_ROUND')]

def ev(kind, id_, name, effect, image, desc, **extra):
    base = {
        'id': id_, 'character': 'Game Master' if kind == 'GM_POWER' else 'Crazy Round', 'form': name, 'title': name,
        'description': desc, 'power': None, 'rank': None, 'series': 'EVENT', 'category': kind, 'rarity': 'EVENT',
        'image': image, 'type': kind, 'effectId': effect, 'powerGroup': None,
    }
    base.update(extra)
    return base

GM = [
    ev('GM_POWER', 'gm-dragon-ball-draft', 'Dragon Ball Draft', 'DRAGON_BALL_DRAFT', '/ui/gm-dragon-ball-draft.webp',
       'The Game Master lays fresh cards from the reserve on the table. Starting with the weakest fighter, everyone drafts one into their hand.', weight=3),
    ev('GM_POWER', 'gm-sacred-auction', 'Sacred Auction', 'SACRED_AUCTION', '/ui/gm-sacred-auction.webp',
       'Every fighter secretly bids 0-3 Ki. The single highest bid wins +15 HP and 2 Ki back. Everyone pays what they bid; tied top bids cancel out.', weight=3),
    ev('GM_POWER', 'gm-training-arc', "King Kai's Training", 'TRAINING_ARC', '/ui/gm-kings-training.webp',
       'Every fighter trains one card in their hand for the rest of the match: +40 Power or -5 Rank.', weight=3),
    ev('GM_POWER', 'gm-bounty-hunt', 'Bounty on the Champion', 'BOUNTY_HUNT', '/ui/gm-bounty-hunt.webp',
       'The fighter with the most HP is marked. Anyone who places above the champion this round gains +8 HP and +2 Ki. If the champion finishes last they lose 10 extra HP.', weight=2),
    ev('GM_POWER', 'gm-side-quest', "Zeno's Side Quest", 'SIDE_QUEST', '/ui/gm-side-quest.webp',
       'A public objective for this round. The first fighter to complete it gains +12 HP and +2 Ki.', weight=2),
    ev('GM_POWER', 'gm-time-chamber', 'Hyperbolic Time Chamber', 'TIME_CHAMBER', '/ui/gm-time-chamber.webp',
       'Everyone gains +3 Ki and every cooldown is cleared - but time is cruel: HP lost on placement is x1.5 for 2 rounds.', weight=2),
    ev('GM_POWER', 'gm-divine-swap', 'Divine Swap', 'DIVINE_SWAP', '/ui/gm-divine-swap-chaos-arena.webp',
       'The strongest free cards of the leader (most HP) and the trailing fighter (least HP) trade places.', weight=2),
    ev('GM_POWER', 'gm-curse-injection', 'Curse Injection', 'CURSE_INJECTION', '/ui/gm-divine-wrath-curse-injection.webp',
       'If nobody holds the Curse, the Game Master thrusts it upon the round leader.', weight=2),
]
CRAZY = [
    ev('CRAZY_ROUND', 'crazy-public-forecast', 'Public Forecast', 'PUBLIC_FORECAST', '/ui/crazy-rounds-crazy-round-public-forecast.webp',
       "The leader's call and every card on the table are visible for 2 rounds.", duration=2, weight=1),
    ev('CRAZY_ROUND', 'crazy-no-apex', 'No Apex', 'NO_APEX', '/ui/crazy-rounds-crazy-round-no-apex-tournament.webp',
       "Every fighter's best-Power card and best-Rank card are blocked this round.", duration=1, weight=1),
    ev('CRAZY_ROUND', 'crazy-total-might', 'Total Might', 'TOTAL_MIGHT', '/ui/crazy-total-might.webp',
       'No call this round: the winner has the best combined Power + Rank score. Balanced cards shine.', duration=1, weight=1),
    ev('CRAZY_ROUND', 'crazy-backwards', 'Backwards Tournament', 'BACKWARDS', '/ui/crazy-backwards.webp',
       'The LOWER stat wins this round. Last place is suddenly the strongest.', duration=1, weight=1),
    ev('CRAZY_ROUND', 'crazy-wish-round', "Shenron's Gift", 'WISH_ROUND', '/ui/crazy-wish-round.webp',
       'The round winner makes a wish: +20 HP, +6 Ki, steal a card from last place, or clear all their cooldowns.', duration=1, weight=1),
    ev('CRAZY_ROUND', 'crazy-high-stakes', 'High Stakes', 'HIGH_STAKES', '/ui/crazy-rounds-high-stakes-crazy-round-arena.webp',
       'All HP won and lost on placement is doubled this round.', duration=1, weight=1),
    ev('CRAZY_ROUND', 'crazy-zenkai', 'Zenkai Rush', 'ZENKAI', '/ui/crazy-zenkai.webp',
       "The fighter with the lowest HP plays with +100 Power and -8 Rank this round: comeback time.", duration=1, weight=1),
]
out = keep + GM + CRAZY
json.dump(out, open(PATH, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(out), 'records:', {t: sum(1 for c in out if c['type'] == t) for t in ('CHARACTER', 'WILDCARD', 'GM_POWER', 'CRAZY_ROUND')})
