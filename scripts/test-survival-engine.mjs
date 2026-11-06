import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { getCardCost, classifyCard } from '../src/game/CardTiers.js';
const cards=JSON.parse(fs.readFileSync(new URL('../src/data/cards.json',import.meta.url),'utf8'));
const characters=cards.filter(c=>c.type==='CHARACTER');
const playableCards=cards.filter(c=>c.type==='CHARACTER'||c.type==='WILDCARD');
const sortedPower=[...characters].sort((a,b)=>b.power-a.power),sortedRank=[...cards].sort((a,b)=>a.rank-b.rank);
const powerful=new Set([...sortedPower.slice(0,Math.ceil(characters.length*.25)),...sortedRank.slice(0,Math.ceil(characters.length*.25))].map(c=>c.id));
const cost=c=>c.type!=='CHARACTER'?Infinity:getCardCost(c,characters);
for(const mode of [2,4]){
 const engine=new GameEngine(cards,{random:Math.random});engine.createMatch(mode);engine.startMatch();let s=engine.getState();
 assert.equal(s.players.length,mode);assert.ok(s.players.every(p=>p.hand.length===12&&p.hp===100&&p.ki===14));const weakAll=characters.filter(c=>classifyCard(c,characters)==='WEAK').length;assert.equal(s.reserveDeck.length,playableCards.length-mode*12-Math.max(0,weakAll-mode*2));assert.ok(s.players.every(p=>p.hand.filter(c=>c.lastStand).length===2&&p.lastStandTotal===2));assert.equal(s.reserveDeck.filter(c=>classifyCard(c,characters)==='WEAK').length,0);
 const ids=[...s.players.flatMap(p=>p.hand.map(c=>c.id)),...s.reserveDeck.map(c=>c.id)];assert.equal(new Set(ids).size,playableCards.length-Math.max(0,characters.filter(c=>classifyCard(c,characters)==='WEAK').length-mode*2),'all starting cards must be unique');
 let guard=0;while(engine.state.phase!=='MATCH_COMPLETE'&&guard++<2500){s=engine.getState();const p=s.players.find(x=>x.id===s.currentPlayer);if(s.phase==='GM_DECREE'){engine.decreeAct(p.id,engine.defaultDecreeChoice(p.id));continue;}if(s.phase==='CALLING_STAT')engine.callStat(p.id,guard%2?'POWER':'RANK');else if(s.phase==='PLAYING_CARD'){const legal=p.hand.filter(c=>c.type==='CHARACTER'&&(!c.lastStand||p.ki===0)&&!p.lockedCardIds.includes(c.id)&&!(s.noApexBlocked?.[p.id]??[]).includes(c.id)&&(s.activeEffects?.worldOfVoid?0:s.activeEffects?.kiSurge?Math.max(0,cost(c)-1):cost(c))<=p.ki);if(legal.length)engine.playCard(p.id,legal[0].id);else engine.passTurn(p.id);}}
 assert.equal(engine.state.phase,'MATCH_COMPLETE',`${mode}-player match should reach a winner within the safety bound`);assert.ok(engine.state.winner);assert.equal(engine.state.players.filter(p=>p.hp>0).length,1);assert.ok(engine.state.roundNumber<250);
 console.log(`PASS ${mode}-player survival match: ${engine.state.roundNumber} rounds; winner ${engine.state.winner}`);
}
console.log('PASS survival engine setup, card conservation, resource initialization, turn progression, elimination and victory.');
