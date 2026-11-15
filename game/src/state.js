// Match state, kept in one place. main.js and the bots read and write this object; no
// module keeps its own copy of the round, the score or the money.
//
// A match is best of 3 rounds. A round is won by the first team to 100 capture points on
// the hill, by wiping the other team out of alive fighters and respawn tickets, or — when
// the round timer runs out — by the team further ahead on capture points. Between rounds
// there is a 12-second buy phase: money earned from kills, captures and round results is
// spent on weapons, grenades and armour in the buy menu.
export const CAPTURE_TARGET = 100;
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 12;
export const ROUNDS_TO_WIN = 2;
export const RESPAWN_TICKETS = 4;
export const RESPAWN_DELAY = 5;

export const TEAM = { PLAYER: 'vanguard', ENEMY: 'ember' };

export function createMatch() {
  return {
    phase: 'buy', // 'buy' | 'fight' | 'roundEnd' | 'matchEnd'
    phaseTime: BUY_SECONDS,
    round: 1,
    roundsWon: { vanguard: 0, ember: 0 },
    capture: { vanguard: 0, ember: 0 }, // points banked this round
    holder: null, // which team is currently scoring on the hill, or null when contested/empty
    contested: false,
    roundTimeLeft: ROUND_SECONDS,
    winner: null, // round winner when phase === 'roundEnd'
    matchWinner: null,
    money: 800,
    kills: 0,
    deaths: 0,
    tickets: { vanguard: RESPAWN_TICKETS, ember: RESPAWN_TICKETS },
    feed: [], // { text, team, time } — newest first, HUD caps what it shows
    banner: '',
    bannerSub: '',
  };
}

export function resetRound(match) {
  match.phase = 'buy';
  match.phaseTime = BUY_SECONDS;
  match.capture.vanguard = 0;
  match.capture.ember = 0;
  match.holder = null;
  match.contested = false;
  match.roundTimeLeft = ROUND_SECONDS;
  match.winner = null;
  match.tickets.vanguard = RESPAWN_TICKETS;
  match.tickets.ember = RESPAWN_TICKETS;
  match.banner = `ROUND ${match.round}`;
  match.bannerSub = 'Buy your loadout — the hill opens in 12 seconds';
}

export function pushFeed(match, text, team) {
  match.feed.unshift({ text, team, time: performance.now() });
  if (match.feed.length > 6) match.feed.length = 6;
}
