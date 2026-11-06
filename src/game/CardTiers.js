const tierCache=new WeakMap();
function buildTierMap(cards){
  cards=cards.filter(c=>!c.type||c.type==='CHARACTER');
  const powerSorted=[...cards].sort((a,b)=>b.power-a.power),rankSorted=[...cards].sort((a,b)=>a.rank-b.rank);
  const op=new Set([...powerSorted.slice(0,Math.ceil(cards.length*.05)),...rankSorted.slice(0,Math.ceil(cards.length*.05))].map(c=>c.id));
  const powerful=new Set([...powerSorted.slice(0,Math.ceil(cards.length*.25)),...rankSorted.slice(0,Math.ceil(cards.length*.25))].map(c=>c.id));
  const map=new Map();
  for(const card of cards){
    let tier='NORMAL';
    if(card.powerGroup==='OP'||op.has(card.id)||(card.category==='GOD'&&card.power>=980))tier='OP';
    else if(powerful.has(card.id))tier='POWERFUL';
    else if(card.power<=powerSorted[Math.floor(cards.length*.72)]?.power&&card.rank>=rankSorted[Math.floor(cards.length*.72)]?.rank)tier='WEAK';
    map.set(card.id,tier);
  }
  return map;
}
export function classifyCard(card,cards){
  if(card?.type==='WILDCARD'||card?.type==='GM_POWER'||card?.type==='CRAZY_ROUND')return card.type;
  if(card?.tier)return card.tier; // explicit tier written into cards.json (preferred)
  let map=tierCache.get(cards);if(!map){map=buildTierMap(cards);tierCache.set(cards,map);}
  return map.get(card.id)??'NORMAL';
}
export const CARD_TIER_COST=Object.freeze({WEAK:0,NORMAL:1,POWERFUL:3,OP:5});
// Battle Mode pays the tier cost above (unchanged). Story Mode marks its cards costMode:'SOUL' and pays each bound being's own
// `soulCost`. The tier cost stays the fallback for a card with no valid soulCost, and Last-Stand (Elusive) cards are always free.
export const SOUL_COST_MODE='SOUL';
export const isValidSoulCost=v=>Number.isInteger(v)&&v>=0;
export function getSoulCost(card,cards){
  const tier=classifyCard(card,cards);
  if(card?.lastStand||tier==='WEAK')return 0;
  return isValidSoulCost(card?.soulCost)?card.soulCost:(CARD_TIER_COST[tier]??1);
}
export function getCardCost(card,cards){
  if(card?.type&&card.type!=='CHARACTER')return Infinity;
  return card?.costMode===SOUL_COST_MODE?getSoulCost(card,cards):(CARD_TIER_COST[classifyCard(card,cards)]??1);
}
