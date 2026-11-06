export class Player {
  constructor({ id, name, type = 'AI', initialCoins = 2, initialHp = 100, initialKi = 20 }) {
    this.id=id;this.name=name;this.type=type;this.hand=[];this.coins=initialCoins;this.hp=initialHp;this.ki=initialKi;this.drawsUsed=0;this.roundsWon=0;this.lockedUntilTurn={};this.eliminated=false;this.koReason=null;this.lastStandTotal=0;
  }
  addCard(card,{playable=true}={}){this.hand.push(card);if(playable)delete this.lockedUntilTurn[card.id];}
  removeCard(cardId){const i=this.hand.findIndex(c=>c.id===cardId);if(i<0)return null;const card=this.hand.splice(i,1)[0];delete this.lockedUntilTurn[cardId];return card;}
  lockCardUntil(cardId,turnNumber){this.lockedUntilTurn[cardId]=turnNumber;}
  clearExpiredLocks(turnNumber){for(const [id,unlock] of Object.entries(this.lockedUntilTurn))if(unlock<=turnNumber)delete this.lockedUntilTurn[id];}
  canPlayCard(cardId,turnNumber){return this.hp>0&&this.hand.some(c=>c.id===cardId)&&(this.lockedUntilTurn[cardId]??0)<=turnNumber;}
}
