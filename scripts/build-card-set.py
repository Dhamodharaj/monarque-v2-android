#!/usr/bin/env python3
"""One-off curation script (already applied): trims the roster to 60 characters, rewrites Power on a
lore-consistent scale, derives Rank from Power + a technique rating, and writes an explicit `tier`.
Usage: python3 scripts/build-card-set.py   (idempotent only on the ORIGINAL 132-card file)"""
import json, os
P='src/data/cards.json'
cards=json.load(open(P))
byid={c['id']:c for c in cards}
# id-prefix -> (new power, technique 0..1).  Technique high = skilled/fast (wins RANK), low = brute (wins POWER).
S={
'zeno-base':(999,.5),'grand-priest':(998,.9),'whis-base':(996,1.0),'super-shenron':(994,.3),'beerus-god':(992,.6),
'belmod':(985,.5),'champa-god':(984,.4),
'goku-mastered-ultra':(982,1.0),'vegeta-ultra-ego':(975,.7),'jiren-full':(972,.8),'gogeta-super-saiyan-blue':(968,.8),
'vegito-super-saiyan-blue':(966,.8),'gohan-gohan-beast':(962,.9),'frieza-black':(958,.6),'broly-full-power':(955,.1),
'goku-ultra-instinct-sign':(950,.9),'fused-zamasu':(945,.4),'moro-angel':(938,.3),'granolah':(934,.6),'gas-heater':(930,.4),
'cell-max':(922,.1),'gogeta-ssj4':(918,.7),'omega-shenron':(912,.3),'hit-base':(906,1.0),'vegeta-super-saiyan-god-ss':(900,.7),
'piccolo-orange':(896,.9),'frieza-golden':(890,.5),'golden-frieza':(890,.5),'kefla':(884,.5),'goku-black':(878,.7),
'trunks-super-saiyan-rage':(850,.7),'super-vegito':(845,.8),'gohan-ultimate':(830,.8),'buu-kid':(815,.1),'janemba-super':(805,.2),
'goku-super-saiyan-3':(798,.5),'gohan-super-saiyan-2':(782,.6),'cell-super-perfect':(772,.4),'gotenks-super-saiyan-3':(742,.3),
'vegeta-majin':(736,.5),'bojack':(715,.4),'cooler':(705,.5),'goku-super-saiyan-namek':(700,.6),'frieza-100':(690,.4),
'piccolo-fused-with-kami':(655,1.0),'bardock':(610,.6),'turles':(570,.4),'lord-slug':(560,.3),'goku-base':(545,.8),
'vegeta-base':(535,.6),'android-18':(520,.9),'android-17-base':(515,.8),'android-16':(500,.2),'vegeta-great-ape':(480,.1),
'trunks-super-saiyan-kid':(470,.7),'goten-super':(455,.7),'captain-ginyu':(400,.5),'frieza-first':(390,.4),'recoome':(360,.2),
'tien-shinhan':(330,1.0),'nail':(325,.7),'king-piccolo':(300,.4),'nappa':(290,.2),'zarbon':(270,.6),'raditz':(260,.4),
'krillin':(235,1.0),'android-20':(215,.4),'master-roshi':(200,.9),'mercenary-tao':(170,.7),'yamcha':(130,.6),
'goku-kid-great-ape':(120,.1),
# WEAK / Last-Stand pool
'yajirobe':(90,.6),'videl':(82,.6),'saibaman':(70,.3),'mr-satan':(55,.1),'chi-chi':(48,.5),'bulma':(36,.4),
'oolong':(30,.5),'puar':(25,.7),'pilaf':(17,.2),'farmer':(10,.1),
}
def key(c):
    for k in sorted(S,key=len,reverse=True):
        if c['id'].startswith(k): return k
    return None
keep=[]
for c in cards:
    if c['type']!='CHARACTER': keep.append(c); continue
    k=key(c)
    if k: c['_k']=k; keep.append(c)
chars=[c for c in keep if c['type']=='CHARACTER']
print([c["id"] for c in chars]) if len(chars)!=80 else None
assert len(chars)==80,len(chars)
# Rank: 60% power percentile + 40% technique, best score = rank 1.
chars.sort(key=lambda c:-S[c['_k']][0])
n=len(chars)
for i,c in enumerate(chars):
    c['power']=S[c['_k']][0]
    c['_rs']=0.6*(1-i/(n-1))+0.4*S[c['_k']][1]
for r,c in enumerate(sorted(chars,key=lambda c:-c['_rs']),1): c['rank']=r
for c in chars:
    p=c['power']
    c['tier']='OP' if p>=990 else 'POWERFUL' if p>=880 else 'WEAK' if p<100 else 'NORMAL'
    c['powerGroup']=c['tier']
    if c['id'].startswith('champa'): c['image']='/cards/champa-god-of-destruction-universe-7-destroyer.webp'
    del c['_k'],c['_rs']
json.dump(keep,open(P,'w'),indent=2,ensure_ascii=False)
from collections import Counter
print(len(keep),Counter(c['tier'] for c in chars))
for c in sorted(chars,key=lambda c:-c['power']): print(c['power'],c['rank'],c['tier'],c['id'])
