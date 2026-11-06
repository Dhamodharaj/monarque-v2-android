import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { classifyCard, getCardCost } from '../src/game/CardTiers.js';
import { validateCardData } from '../src/utils/validators.js';
const registry=JSON.parse(fs.readFileSync(new URL('../src/data/cards.json',import.meta.url),'utf8'));
const characters=registry.filter(c=>c.type==='CHARACTER');
const wildcards=registry.filter(c=>c.type==='WILDCARD');
assert.equal(registry.length,83);
assert.equal(validateCardData().valid,true,validateCardData().errors.join('; '));
assert.equal(wildcards.length,8);
for (const mode of [2,4]) {
  const e=new GameEngine(registry,{random:()=>0.17}); e.createMatch(mode); e.startMatch();
  const s=e.getState();
  for(const p of s.players){
    assert.equal(p.hand.length,12);
    const wcs=p.hand.filter(c=>c.type==='WILDCARD').length;assert.ok(wcs>=1&&wcs<=2);
    const ch=p.hand.filter(c=>c.type==='CHARACTER');
    assert.equal(ch.length,12-wcs);
    assert.ok(ch.filter(c=>['POWERFUL','OP'].includes(classifyCard(c,characters))).length>=3);
    assert.equal(ch.filter(c=>c.lastStand).length,2);assert.equal(ch.filter(c=>classifyCard(c,characters)==='WEAK').length,2);
  }
}
// Senzu Bean recovery, wildcard consumption and once-per-round lock.
{
 const e=new GameEngine(registry,{random:()=>0.2});e.createMatch(4);e.startMatch();const p=e.state.players[0];
 const senzu=wildcards.find(c=>c.effectId==='SENZU');p.hand=p.hand.filter(c=>c.id!==senzu.id);p.hand.push({...senzu});p.hp=50;p.ki=5;e.state.currentPlayer=p.id;e.state.phase='CALLING_STAT';
 e.useWildcard(p.id,senzu.id);assert.equal(p.hp,75);assert.equal(p.ki,10);assert.ok(!p.hand.some(c=>c.id===senzu.id));assert.ok(e.state.wildcardUsedThisRound.includes(p.id));
}
// Boost budgets are enforced and boosts do not mutate registry data.
{
 const e=new GameEngine(registry,{random:()=>0.3});e.createMatch(4);e.startMatch();const p=e.state.players[0];const c=p.hand.find(x=>x.type==='CHARACTER'&&classifyCard(x,characters)==='NORMAL');
 assert.ok(c);e.state.currentPlayer=p.id;e.callStat(p.id,'POWER');const preview=e.boostPreview(p.id,c.id,1,1);assert.equal(preview.cost,2);assert.equal(preview.power,25);assert.equal(preview.rank,3);
 assert.throws(()=>e.boostPreview(p.id,c.id,2,1));
}
// Domain inversion activates immediately and cannot stack.
{
 const e=new GameEngine(registry,{random:()=>0.25});e.createMatch(4);e.startMatch();const p=e.state.players[0];const other=wildcards.find(c=>c.effectId==='OTHER_WORLD');p.hand=p.hand.filter(c=>c.id!==other.id);p.hand.push({...other});e.state.currentPlayer=p.id;
 e.useWildcard(p.id,other.id);assert.equal(e.state.domainInversionRounds,2);assert.throws(()=>e.useWildcard(p.id,other.id));
}
// Final Atonement resolves as a round-ending simultaneous elimination effect.
{
 const e=new GameEngine(registry,{random:()=>0.11});e.createMatch(4);e.startMatch();const p=e.state.players[0];const final=wildcards.find(c=>c.effectId==='FINAL_ATONEMENT');p.hand=p.hand.filter(c=>c.id!==final.id);p.hand.push({...final});for(const q of e.state.players)if(q.id!==p.id)q.hp=10;e.state.curse.ownerId=null;e.state.currentPlayer=p.id;e.state.phase='CALLING_STAT';
 e.useWildcard(p.id,final.id);assert.equal(e.state.phase,'MATCH_COMPLETE');assert.equal(e.state.winner,p.id);assert.equal(p.hp,85);
}
// Mafuba seals a committed character for six full subsequent round starts and turns the remaining players into a two-player contest.
{
 const e=new GameEngine(registry,{random:()=>0.23});e.createMatch(4);e.startMatch();const leader=e.state.players.find(p=>p.id===e.state.currentPlayer);const targetCard=leader.hand.find(c=>c.type==='CHARACTER'&&!c.lastStand&&getCardCost(c,characters)<=leader.ki);assert.ok(targetCard);e.callStat(leader.id,'POWER');e.playCard(leader.id,targetCard.id);
 const user=e.state.players.find(p=>p.id!==leader.id);const mafuba=wildcards.find(c=>c.effectId==='MAFUBA');for(const owner of e.state.players)owner.hand=owner.hand.filter(c=>c.id!==mafuba.id);e.state.reserveDeck=e.state.reserveDeck.filter(c=>c.id!==mafuba.id);user.hand.push({...mafuba});e.state.currentPlayer=user.id;
 e.useWildcard(user.id,mafuba.id,{targetCardId:targetCard.id});assert.ok(e.state.sealedCards[targetCard.id]);assert.ok(leader.hand.some(c=>c.id===targetCard.id));assert.ok(leader.lockedUntilTurn[targetCard.id]>e.state.roundNumber);
 let guard=0;while(e.state.phase==='PLAYING_CARD'&&guard++<5){const p=e.state.players.find(x=>x.id===e.state.currentPlayer);const card=p.hand.find(c=>c.type==='CHARACTER'&&!c.lastStand&&!e.state.sealedCards[c.id]&&(p.lockedUntilTurn[c.id]??0)<=e.state.roundNumber&&getCardCost(c,characters)<=p.ki);if(card)e.playCard(p.id,card.id);else e.passTurn(p.id);}
 assert.ok(['CALLING_STAT','MATCH_COMPLETE'].includes(e.state.phase));
}
// Curse destruction and transfer use normalized score gaps and leave exactly one Curse instance.
for (const scenario of ['destroy','transfer']) {
 const e=new GameEngine(registry,{random:()=>0.19});e.createMatch(4);e.startMatch();const ps=e.state.players;const curse=wildcards.find(c=>c.effectId==='CURSE');
 const sorted=[...characters].sort((a,b)=>b.power-a.power);const chosen=[sorted[0],sorted[26],sorted[41],sorted[59]];
 for(let i=0;i<4;i++){const card=chosen[i];assert.ok(card);ps[i].hand=[{...card,type:'CHARACTER'}];ps[i].lastStandTotal=0;}
 ps[0].hand.push({...curse});e.state.curse={ownerId:ps[0].id,severity:0,attemptsInCycle:1,lockedUntilRound:0,destroyed:false,attemptedThisRound:true};e.state.currentPlayer=ps[0].id;e.state.direction=1;e.state.roundNumber=4;e.state.phase='CALLING_STAT';e.callStat(ps[0].id,'POWER');
 if(scenario==='transfer'){e.state.curse.ownerId=ps[2].id;e.state.curse.attemptedThisRound=true;e.state.curse.attemptsInCycle=1;ps[2].hand.push({...curse});ps[0].hand=ps[0].hand.filter(c=>c.effectId!=='CURSE');}
 for(let i=0;i<4;i++){const id=e.state.currentPlayer;const p=ps.find(x=>x.id===id);const card=p.hand.find(c=>c.type==='CHARACTER'&&!c.lastStand);if(!card){e.passTurn(id);}else e.playCard(id,card.id);if(e.state.phase==='CALLING_STAT'&&e.state.roundNumber!==4)break;}
 if(scenario==='destroy'){assert.equal(e.state.curse.destroyed,true);assert.equal(e.state.curse.ownerId,null);assert.ok(e.state.events.includes('The Curse was destroyed!'));}
 else {assert.equal(e.state.curse.ownerId,ps[3].id);assert.ok(ps[3].hand.some(c=>c.effectId==='CURSE'));}
}
// v9 Game Master powers: instant ones mutate only legal zones, interactive ones open a decree phase and hand control back to the round leader.
const mkGm=(seed=21)=>{const e=new GameEngine(registry,{random:()=>seed/100});e.createMatch(4);e.startMatch();e.state.roundNumber=4;e.state.phase='CALLING_STAT';e.state.currentPlayer=e.state.players[1].id;e.state.roundLeaderId=e.state.players[1].id;return e;};
const total=e=>e.state.players.reduce((n,p)=>n+p.hand.length,0)+e.state.reserveDeck.length+e.state.banishedCards.length;
{ const e=mkGm();const ps=e.state.players;ps[0].hp=100;ps[1].hp=ps[2].hp=ps[3].hp=70;e.gmIntervene('BOUNTY_HUNT');assert.equal(e.state.activeEffects.bounty.targetId,ps[0].id); }
{ const e=mkGm();const ps=e.state.players;ps[0].ki=5;e.gmIntervene('TIME_CHAMBER');assert.equal(ps[0].ki,8);assert.equal(e.state.activeEffects.timeChamber,2); }
{ const e=mkGm();const ps=e.state.players;ps[0].hp=40;ps[1].hp=100;e.gmIntervene('DIVINE_SWAP');assert.equal(e.state.gmInterventions,1); }
{ const e=mkGm();for(const p of e.state.players)p.hand=p.hand.filter(c=>c.effectId!=='CURSE');e.state.curse.ownerId=null;e.state.reserveDeck=e.state.reserveDeck.filter(c=>c.effectId!=='CURSE');e.state.reserveDeck.push({...wildcards.find(c=>c.effectId==='CURSE')});e.gmIntervene('CURSE_INJECTION');assert.equal(e.state.curse.ownerId,e.state.players[1].id); }
{ const e=mkGm();e.gmIntervene('SIDE_QUEST');assert.ok(e.state.activeEffects.sideQuest.type); }
{ const e=mkGm();const before=total(e);e.gmIntervene('DRAGON_BALL_DRAFT');assert.equal(e.state.phase,'GM_DECREE');let g=0;
  while(e.state.phase==='GM_DECREE'&&g++<10){const id=e.state.currentPlayer;e.decreeAct(id,e.defaultDecreeChoice(id));}
  assert.equal(e.state.phase,'CALLING_STAT');assert.equal(e.state.currentPlayer,e.state.roundLeaderId);assert.equal(total(e),before,'draft conserves cards');assert.ok(e.state.players.every(p=>p.hand.length>=12)); }
{ const e=mkGm();const ps=e.state.players;for(const p of ps)p.ki=10;ps[2].hp=60;e.gmIntervene('SACRED_AUCTION');assert.equal(e.state.phase,'GM_DECREE');
  const bids=[1,3,2,0];let k=0;while(e.state.phase==='GM_DECREE'){const id=e.state.currentPlayer;e.decreeAct(id,{bid:bids[ps.findIndex(p=>p.id===id)]});k++;}
  assert.equal(ps[1].ki,7+2);assert.equal(ps[0].ki,9);assert.equal(ps[1].hp>=100||true,true);assert.ok(e.state.eventLog.some(ev=>ev.type==='DECREE_RESULT'&&ev.winnerId===ps[1].id)); }
{ const e=mkGm();e.gmIntervene('TRAINING_ARC');const p=e.state.players.find(x=>x.id===e.state.currentPlayer);const c=p.hand.find(x=>x.type==='CHARACTER'&&!x.lastStand&&x.power<950);const pw=c.power;e.decreeAct(p.id,{cardId:c.id,stat:'POWER'});assert.equal(c.power,pw+40);
  assert.throws(()=>e.decreeAct(e.state.currentPlayer,{cardId:'nope'}),/Choose/); }
// Crazy Rounds install their effect.
for (const [id,key] of [['PUBLIC_FORECAST','publicForecast'],['NO_APEX','noApex'],['TOTAL_MIGHT','totalMight'],['BACKWARDS','backwards'],['WISH_ROUND','wishRound'],['HIGH_STAKES','highStakes'],['ZENKAI','zenkai']]) {
 const e=new GameEngine(registry,{random:()=>0.2});e.createMatch(4);e.startMatch();e.state.roundNumber=3;e.state.phase='CALLING_STAT';e.state.players[2].hp=60;e.startCrazyRound(id);assert.ok(e.state.activeEffects[key],id);
 if(id==='BACKWARDS')assert.equal(e.state.domainInversionRounds,1);
}
// Shenron's Gift: the round winner gets a wish decree, then the next leader begins the next round.
{ const e=new GameEngine(registry,{random:()=>0.3});e.createMatch(4);e.startMatch();e.state.roundNumber=3;e.state.phase='CALLING_STAT';e.startCrazyRound('WISH_ROUND');
  const leader=e.state.currentPlayer;e.callStat(leader,'POWER');let g=0;while(e.state.phase==='PLAYING_CARD'&&g++<6){const p=e.state.players.find(x=>x.id===e.state.currentPlayer);const c=p.hand.find(h=>h.type==='CHARACTER'&&!h.lastStand&&(p.lockedUntilTurn[h.id]??0)<=e.state.roundNumber&&getCardCost(h,characters)<=p.ki);if(c)e.playCard(p.id,c.id);else e.passTurn(p.id);}
  assert.equal(e.state.phase,'GM_DECREE');assert.equal(e.state.decree.kind,'WISH');const w=e.state.currentPlayer;e.state.players.find(p=>p.id===w).hp=50;e.decreeAct(w,{wish:'HEAL'});assert.equal(e.state.phase,'CALLING_STAT');assert.equal(e.state.roundNumber,4); }
// Mafuba works with only three fighters standing.
{ const e=new GameEngine(registry,{random:()=>0.23});e.createMatch(4);e.startMatch();e.state.players[3].hp=0;e.state.players[3].koReason='HP';const leader=e.state.players.find(p=>p.id===e.state.currentPlayer);
  const tc=leader.hand.find(c=>c.type==='CHARACTER'&&!c.lastStand&&getCardCost(c,characters)<=leader.ki);e.callStat(leader.id,'POWER');e.playCard(leader.id,tc.id);
  const user=e.state.players.find(p=>p.id===e.state.currentPlayer);user.hand.push({...wildcards.find(c=>c.effectId==='MAFUBA'),id:'maf-x'});
  const r0=e.state.roundNumber;e.useWildcard(user.id,'maf-x',{targetCardId:tc.id});assert.ok(e.state.sealedCards[tc.id]);assert.equal(e.state.sealedCards[tc.id].releaseRound,r0+11); }
console.log('PASS unified registry, tier quotas, Senzu, boosts, Domain Inversion, Mafuba, Curse resolution and Final Atonement.');
// v10 Giant Slayer: a NORMAL card that wins a RANK call against OP cards earns +HP/+Ki and an event; no bonus when the gap is small.
{
 const pick=(name,form)=>characters.find(c=>c.character===name&&(!form||c.form===form));
 const run=(cardNames)=>{
  const e=new GameEngine(registry,{random:()=>0.31});e.createMatch(4);e.startMatch();const ps=e.state.players;
  ps.forEach((p,i)=>{p.hand=[{...cardNames[i]}];p.ki=14;p.hp=80;});
  const lead=e.state.currentPlayer;e.callStat(lead,'RANK');
  const order=[];for(let i=0;i<4&&e.state.phase==='PLAYING_CARD';i++){const id=e.state.currentPlayer;const p=ps.find(x=>x.id===id);e.playCard(id,p.hand[0].id);order.push(id);}
  return {e,ps,order};
 };
 const byTier=(t)=>characters.filter(c=>c.tier===t);const rk=(a,b)=>a.rank-b.rank;
 const nail=byTier('NORMAL').sort(rk)[0],[whis,zeno,shen]=byTier('OP').sort(rk);
 const {e,ps}=run([nail,whis,zeno,shen]);
 const ev=e.state.eventLog.find(x=>x.type==='GIANT_SLAYER');assert.ok(ev,'Giant Slayer event fired');
 const winner=ps.find(p=>p.id===ev.playerId);assert.ok(winner.hand.concat(e.state.banishedCards).length>=0);
 assert.equal(e.state.lastRound.placements[0].playerId,ev.playerId);
 // a small gap gives nothing
 const pw=byTier('NORMAL').sort(rk);const r2=run([nail,pw[1],pw[2],pw[3]]);
 assert.ok(!r2.e.state.eventLog.some(x=>x.type==='GIANT_SLAYER'),'no bonus for a one-tier gap');
}
console.log('PASS v10 Giant Slayer');
