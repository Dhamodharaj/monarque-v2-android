// Spent rule: Soul 0 + no Last Stand + nothing within reach + too weak to Gather => eliminated; otherwise play on.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { getCardCost } from '../src/game/CardTiers.js';
const cards=JSON.parse(fs.readFileSync(new URL('../src/data/cards.json',import.meta.url),'utf8'));
const chars=cards.filter(c=>c.type==='CHARACTER');
const costly=chars.filter(c=>getCardCost(c,chars)>=3);
function round(hp){
  const e=new GameEngine(cards,{random:Math.random});e.createMatch(2);e.startMatch();
  const [a,b]=e.state.players;
  // make the sure-playing foe the leader
  e.state.currentPlayer=b.id;e.state.roundLeaderId=b.id;
  a.hand=[costly[0],costly[1]].map(c=>({...c}));a.ki=0;a.hp=hp;
  b.ki=20;
  const play=b.hand.find(c=>c.type==='CHARACTER'&&!c.lastStand&&getCardCost(c,chars)<=20);
  e.callStat(b.id,'POWER');e.playCard(b.id,play.id,{powerKi:0,rankKi:0});
  if(e.state.currentPlayer===a.id)e.passTurn(a.id);
  return {e,a};
}
let {e,a}=round(15);
assert.equal(a.koReason,'SPENT','hp 15, 0 Soul, unaffordable hand => eliminated');
assert.ok(a.eliminated&&a.hp===0);
console.log('PASS spent player is eliminated (reason SPENT)');
({e,a}=round(60));
console.log('koReason hp60 =',JSON.stringify(a.koReason),'hp',a.hp,'ki',a.ki,'elim',a.eliminated);assert.ok(!a.koReason,'hp 60 can still Gather => alive');
console.log('PASS healthy player at 0 Soul stays alive');
