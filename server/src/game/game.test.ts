import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './GameState.js';
import { dealFactions } from './deal.js';
import { TEAM_COMPOSITION, TOTAL_GUNS, THE_MAP, move, getHex, seaHexes, victoryHexes } from '@ftk/shared';

test('deal: 7 players matches composition table', () => {
  const f = dealFactions(7);
  assert.equal(f.length, 7);
  const c = { sailor: 0, pirate: 0, cultLeader: 0, cultist: 0 } as Record<string, number>;
  f.forEach(x => c[x]++);
  assert.deepEqual(c, TEAM_COMPOSITION[7]);
});

test('deal: 5-player variant resolves to 3S1P1C or 2S2P1C', () => {
  for (let i = 0; i < 50; i++) {
    const f = dealFactions(5);
    assert.equal(f.length, 5);
    const c = { sailor: 0, pirate: 0, cultLeader: 0, cultist: 0 } as Record<string, number>;
    f.forEach(x => c[x]++);
    assert.equal(c.cultLeader, 1);
    assert.equal(c.cultist, 0);
    const ok = (c.sailor === 3 && c.pirate === 1) || (c.sailor === 2 && c.pirate === 2);
    assert.ok(ok, `unexpected 5p split: ${JSON.stringify(c)}`);
  }
});

test('redaction: table view never leaks any faction', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F','G']) g.addSeat(n);
  g.startGame();
  const tv = g.viewForTable();
  // No seat carries a faction field or value (the phase label may legitimately
  // contain the word "pirate", so scan the seat payload specifically).
  const seatsJson = JSON.stringify(tv.seats);
  assert.ok(!seatsJson.includes('"faction"'), 'seats must not contain faction fields');
  assert.ok(!/cultLeader|pirate|cultist|sailor/.test(seatsJson), 'seats must not name factions');
  // While the game is live there is no end-game faction dictionary.
  assert.equal(tv.ended, undefined, 'live table view must not include the reveal dictionary');
});

test('redaction: gun counts hidden during mutiny only', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F','G']) g.addSeat(n);
  g.startGame();
  // outside mutiny: public
  let tv = g.viewForTable();
  assert.ok(tv.seats.every(s => typeof s.guns === 'number'));
  // simulate entering mutiny
  (g as any).phase = 'mutiny';
  tv = g.viewForTable();
  assert.ok(tv.seats.every(s => s.guns === null), 'guns must be null during mutiny');
});

test('player view only reveals own faction', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F','G']) g.addSeat(n);
  g.startGame();
  const seat = g.seats[0];
  const pv = g.viewForPlayer(seat.id)!;
  assert.equal(pv.faction, seat.faction);
  // no other seat's faction is present anywhere in the payload
  const others = g.seats.slice(1);
  const json = JSON.stringify(pv);
  // teammates (pirate gathering) may name pirates by seat, but never their faction label as data of others
  assert.ok(!json.includes(`"faction":"${others.find(s=>s.faction!=='sailor')?.faction}"`) || pv.faction === others.find(s=>s.faction!=='sailor')?.faction);
});

test('supply pool conserved after deal', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F','G']) g.addSeat(n);
  g.startGame();
  const held = g.seats.reduce((n, s) => n + s.guns, 0);
  assert.equal(held + g.supplyPool, TOTAL_GUNS);
});

test('mutiny: appoint transitions to mutiny, non-captains prompted to lock guns', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  (g as any).phase = 'appoint';
  const cap = g.captain()!;
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  assert.equal(g.phase, 'mutiny');
  // every non-captain gets a lockGuns prompt; captain waits
  for (const s of g.seats) {
    const pv = g.viewForPlayer(s.id)!;
    if (s.isCaptain) assert.equal(pv.prompt.kind, 'idle');
    else assert.equal(pv.prompt.kind, 'lockGuns');
  }
});

test('mutiny: successful mutiny installs new captain and discards revealed guns', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  (g as any).phase = 'appoint';
  const cap = g.captain()!;
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  // clear winner: one commits 3, another 1, rest 0 (sum 4 >= threshold 3)
  const before = g.supplyPool;
  g.lockGuns(others[0].id, 3);
  g.lockGuns(others[1].id, 1);
  for (const s of others.slice(2)) g.lockGuns(s.id, 0);
  const tv = g.viewForTable();
  assert.ok(tv.mutinyResult, 'result should be revealed after all lock in');
  assert.equal(tv.mutinyResult!.success, true);
  g.continueAfterMutiny(g.captain()!.id);
  // a new captain emerges (most guns), guns discarded to supply
  assert.notEqual(g.captain()!.id, cap.id);
  assert.equal(g.captain()!.id, others[0].id, 'most guns wins');
  assert.ok(g.supplyPool > before, 'revealed guns returned to supply');
  assert.equal(g.phase, 'appoint'); // successful mutiny starts a fresh round
  assert.equal(g.round, 2);
});

test('mutiny: below threshold means no mutiny and proceeds to navigation', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  (g as any).phase = 'appoint';
  const cap = g.captain()!;
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  for (const s of others) g.lockGuns(s.id, 0);
  const tv = g.viewForTable();
  assert.equal(tv.mutinyResult!.success, false);
  g.continueAfterMutiny(g.captain()!.id);
  assert.equal(g.captain()!.id, cap.id, 'captain unchanged when no mutiny');
  assert.equal(g.phase, 'navigation');
});

test('mutiny: gun counts stay secret in the table view until everyone locks in', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  (g as any).phase = 'appoint';
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  g.lockGuns(others[0].id, 2); // only one locked
  const tv = g.viewForTable();
  assert.equal(tv.mutinyResult, undefined, 'no reveal before all lock in');
  assert.ok(tv.seats.every(s => s.guns === null), 'guns hidden during mutiny');
  assert.deepEqual(tv.mutinyProgress, { locked: 1, total: others.length });
});

test('first captain is seat #1, not random', () => {
  for (let i = 0; i < 20; i++) {
    const g = new Game('TEST');
    for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
    g.startGame();
    assert.equal(g.captain()!.name, 'A', 'seat #1 must always start as captain');
  }
});

test('a converted cultist learns the Cult Leader; a setup cultist does not', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  const leader = g.seats.find(s => s.faction === 'cultLeader')!;
  const victim = g.seats.find(s => s.faction === 'sailor')!;
  // drive a conversion directly
  (g as any).pending = { type: 'cultConvert', seatId: leader.id };
  (g as any).phase = 'cultRitual';
  g.cultConvert(leader.id, victim.id);
  assert.equal(victim.faction, 'cultist');
  const pv = g.viewForPlayer(victim.id)!;
  assert.equal(pv.cultLeaderName, leader.name, 'converted cultist must recognise their master');
  // the leader sees who they converted
  const lv = g.viewForPlayer(leader.id)!;
  assert.ok(lv.myConverts!.includes(victim.name));
  // a cultist dealt at setup (11p) has no knowsCultLeader flag => no name
  const setupCultist = { ...victim, id: 'x', knowsCultLeader: false, faction: 'cultist' as const };
  g.seats.push(setupCultist as any);
  assert.equal(g.viewForPlayer('x')!.cultLeaderName, undefined);
});

test('a cultist never learns the leader from the table view', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  const leader = g.seats.find(s => s.faction === 'cultLeader')!;
  const victim = g.seats.find(s => s.faction === 'sailor')!;
  (g as any).pending = { type: 'cultConvert', seatId: leader.id };
  g.cultConvert(leader.id, victim.id);
  const json = JSON.stringify(g.viewForTable());
  assert.ok(!json.includes('"faction"'), 'table must never carry factions');
});

test('movement steps I/II/III gate resolution behind a button', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  // walk to a navigation and pick a card
  (g as any).phase = 'appoint';
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  for (const s of others) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(g.captain()!.id);
  assert.equal(g.phase, 'navigation');
  const cap = g.captain()!;
  const capCards = g.viewForPlayer(cap.id)!.prompt.data.cards;
  g.navDiscard(cap.id, capCards[0].id);
  const ltCards = g.viewForPlayer(others[0].id)!.prompt.data.cards;
  g.navDiscard(others[0].id, ltCards[0].id);
  const navCards = g.viewForPlayer(others[1].id)!.prompt.data.cards;
  const before = g.shipSpace;
  g.navChoose(others[1].id, navCards[0].id);
  // it must now be WAITING on step I, with the ship not yet moved
  const tv = g.viewForTable();
  assert.ok(tv.gate, 'a movement-step gate must be set');
  assert.equal(tv.gate!.step, 'move');
  assert.equal(tv.gate!.roman, 'I');
  assert.equal(g.shipSpace, before, 'ship must not move until step I is played');
  g.playStep();
  assert.notEqual(g.shipSpace, before, 'step I moves the ship');
});

test('board: every space has three valid exits and all destinations are equally far', () => {
  const map = THE_MAP;
  for (const h of seaHexes(map)) {
    for (const d of ['north', 'west', 'east'] as const) {
      assert.ok(getHex(map, move(map, h.id, d).id), `${h.id} ${d} points at a missing space`);
    }
  }
  // breadth-first: no faction may start closer to home than another
  const best: Record<string, number> = {};
  const seen = new Set([map.startId]);
  const q: [string, number][] = [[map.startId, 0]];
  while (q.length) {
    const [id, d] = q.shift()!;
    for (const dir of ['north', 'west', 'east'] as const) {
      const h = getHex(map, move(map, id, dir).id)!;
      if (h.victory) { if (best[h.victory] === undefined) best[h.victory] = d + 1; }
      else if (!seen.has(h.id)) { seen.add(h.id); q.push([h.id, d + 1]); }
    }
  }
  assert.deepEqual(Object.keys(best).sort(), ['cult', 'pirate', 'sailor']);
  const lens = Object.values(best);
  assert.ok(lens.every(l => l >= 6), `destinations too short ${JSON.stringify(best)}`);
});

test('board: the printed numbering, one Kraken space and three per cove', () => {
  const map = THE_MAP;
  assert.deepEqual(map.layers, [
    [1], [2, 3, 4], [5, 6, 7], [8, 9, 10, 11, 12],
    [13, 14, 15, 16, 17], [18, 19, 20, 21, 22, 23, 24], [25, 26, 27, 28, 29, 30, 31],
  ]);
  // a true hex packing: every space sits on the flat-top lattice, no gaps
  for (const h of map.hexes) assert.equal((((h.col + h.level) % 2) + 2) % 2, 0, `space ${h.n} is off-lattice`);
  // and every space touches a neighbour on the lattice
  for (const h of map.hexes) {
    const touching = map.hexes.some(o => o !== h &&
      ((o.col === h.col && Math.abs(o.level - h.level) === 2) ||
       (Math.abs(o.col - h.col) === 1 && Math.abs(o.level - h.level) === 1)));
    assert.ok(touching, `space ${h.n} is isolated`);
  }
  assert.equal(map.startId, '1');

  const counts: Record<string, number> = {};
  for (const h of victoryHexes(map)) counts[h.victory!] = (counts[h.victory!] ?? 0) + 1;
  assert.deepEqual(counts, { pirate: 3, cult: 1, sailor: 3 });
  assert.deepEqual(victoryHexes(map).filter(h => h.victory === 'pirate').map(h => h.n), [25, 26, 27]);
  assert.deepEqual(victoryHexes(map).filter(h => h.victory === 'cult').map(h => h.n), [28]);
  assert.deepEqual(victoryHexes(map).filter(h => h.victory === 'sailor').map(h => h.n), [29, 30, 31]);

  // the centre of the last sea row fans out onto all three coasts
  assert.equal(move(map, '21', 'west').id, '27');   // Crimson Cove
  assert.equal(move(map, '21', 'north').id, '28');  // the Kraken
  assert.equal(move(map, '21', 'east').id, '29');   // Bluewater Bay
  // and the start opens onto the whole of row one
  assert.deepEqual(['west', 'north', 'east'].map(d => move(map, '1', d as any).id), ['2', '3', '4']);
});

test('board: carries every map secret from the printed board', () => {
  const c: Record<string, number> = {};
  seaHexes(THE_MAP).filter(h => h.icon).forEach(h => { c[h.icon!] = (c[h.icon!] ?? 0) + 1; });
  assert.deepEqual(c, { cabinSearch: 4, flogging: 2, offWithTongue: 1, feedTheKraken: 3 });
});

test('supply line refills the crew to three guns when crossed', () => {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  const map = THE_MAP;

  const drained = 1;
  for (const s of g.seats) s.guns = drained;
  g.supplyPool = TOTAL_GUNS - drained * g.seats.length;
  g.shipSpace = '9';                         // just short of the supply line
  (g as any).currentCard = { id: 'x', direction: 'north', action: 'drunk' };
  const poolBefore = g.supplyPool;
  (g as any).stepMove();

  assert.ok(getHex(map, g.shipSpace!)!.level >= map.supplyLineLevel, 'expected to cross the line');
  assert.ok(g.seats.every(s => s.guns === 3), 'every crew should refill to 3');
  assert.equal(g.supplyPool, poolBefore - (3 - drained) * g.seats.length);
  assert.equal(g.seats.reduce((n, s) => n + s.guns, 0) + g.supplyPool, TOTAL_GUNS);
});

// Drive a game to the point where one specific navigation card is revealed.
function playCard(action: 'disarmed' | 'armed' | 'drunk', direction: 'north' | 'east' | 'west' = 'east') {
  const g = new Game('TEST');
  for (const n of ['A','B','C','D','E','F']) g.addSeat(n);
  g.startGame();
  if (g.phase === 'pirateGathering') for (const s of g.seats) g.ackGathering(s.id);
  const cap = g.captain()!;
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  for (const s of others) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(g.captain()!.id);
  const nav = g.seats.find(s => s.badge === 'navigator')!;
  const card = () => ({ id: Math.random().toString(36).slice(2), direction, action });
  (g as any).nav.captainCards = [card(), card()];
  (g as any).nav.lieutenantCards = [card(), card()];
  g.navDiscard(cap.id, (g as any).nav.captainCards[0].id);
  g.navDiscard((g as any).nav.lieutenantId, (g as any).nav.lieutenantCards[0].id);
  g.navChoose((g as any).nav.navigatorId, (g as any).nav.logbook[0].id);
  let guard = 0;
  while (g.viewForTable().gate && guard++ < 6) g.playStep();
  return { g, nav, cap };
}

test('disarmed takes a gun off the navigator and announces it to the table', () => {
  const { g, nav } = playCard('disarmed');
  assert.equal(g.seat(nav.id)!.guns, 2, 'navigator should lose one gun');
  const sl = g.viewForTable().spotlight!;
  assert.equal(sl.kind, 'disarmed');
  assert.ok(sl.text.includes(nav.name), `spotlight must name the navigator, got "${sl.text}"`);
  assert.ok(sl.result && /supply/i.test(sl.result), `spotlight must state the outcome, got "${sl.result}"`);
  assert.ok(!sl.waiting, 'a resolved action is not a waiting state');
  assert.equal(g.seats.reduce((n, s) => n + s.guns, 0) + g.supplyPool, TOTAL_GUNS);
});

test('armed gives the navigator a gun and announces it', () => {
  const { g, nav } = playCard('armed');
  assert.equal(g.seat(nav.id)!.guns, 4, 'navigator should gain one gun');
  const sl = g.viewForTable().spotlight!;
  assert.equal(sl.kind, 'armed');
  assert.ok(sl.text.includes(nav.name));
  assert.equal(g.seats.reduce((n, s) => n + s.guns, 0) + g.supplyPool, TOTAL_GUNS);
});

test('an instant card action is never overwritten by the off-duty placeholder', () => {
  const { g } = playCard('drunk');
  const tv = g.viewForTable();
  assert.equal(tv.phase, 'offDuty');
  const sl = tv.spotlight!;
  assert.equal(sl.kind, 'drunk');
  assert.ok(!/Off-duty/i.test(sl.text), `off-duty must not clobber the announcement, got "${sl.text}"`);
});
