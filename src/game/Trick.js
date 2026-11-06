export class Trick {
  constructor(leaderId, call, participantIds = []) {
    this.leaderId = leaderId;
    this.call = call;
    this.participantIds = [...participantIds];
    this.plays = [];
  }

  addPlay(playerId, card) {
    this.plays.push({ playerId, card });
  }

  get size() { return this.plays.length; }
}
