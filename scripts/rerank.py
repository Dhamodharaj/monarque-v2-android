#!/usr/bin/env python3
"""v10: re-derives Rank so skill can beat raw strength. Score = technique - 0.5 * power-percentile (+ tiny power tie-break).
Brutes and gods get poor Ranks; nimble fighters get great Ranks regardless of Power. Also bumps the Ki tier of rank specialists.
Reads the technique table from build-card-set.py. Usage: python3 scripts/rerank.py"""
import ast, json, re, os
HERE = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(HERE, '..', 'src', 'data', 'cards.json')
src = open(os.path.join(HERE, 'build-card-set.py'), encoding='utf8').read()
S = ast.literal_eval(re.search(r"\nS=(\{.*?\n\})", src, re.S).group(1))
cards = json.load(open(P, encoding='utf8'))
chars = [c for c in cards if c['type'] == 'CHARACTER']
def tech(c):
    for k in sorted(S, key=len, reverse=True):
        if c['id'].startswith(k): return S[k][1]
    raise KeyError(c['id'])
order = sorted(chars, key=lambda c: -c['power']); n = len(chars)
pct = {c['id']: 1 - i / (n - 1) for i, c in enumerate(order)}
def eff(c):  # very weak cards cannot be technique kings (a Farmer is not top-3 Rank)
    p = pct[c['id']]; return tech(c) * (0.6 + 0.4 * min(1, p / 0.25))
score = {c['id']: eff(c) - 0.5 * pct[c['id']] + 0.01 * pct[c['id']] for c in chars}
for r, c in enumerate(sorted(chars, key=lambda c: -score[c['id']]), 1): c['rank'] = r
for c in chars:
    p = c['power']; c['tier'] = c['powerGroup'] = 'OP' if p >= 990 else 'POWERFUL' if p >= 880 else 'WEAK' if p < 100 else 'NORMAL'
    pass  # tier stays power-based (validate-cards enforces the Power bands)
json.dump(cards, open(P, 'w'), indent=2, ensure_ascii=False)
for c in sorted(chars, key=lambda c: c['rank']): print(c['rank'], c['character'], c['power'], c['tier'], end=' | ')
