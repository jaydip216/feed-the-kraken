import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './GameState.js';
import { TOTAL_GUNS } from '@ftk/shared';

// Auto-plays one full game via the public API, responding to whatever each
// seat's prompt asks. Asserts gun conservation + table redaction every step.
function rand(a: any[]): any { return a[Math.floor(Math.random() * a.length)]; }
// Score a card by how far along the ship already is toward that card's corner,
// so deciders push the leading corner — models a coalition converging on a port.
function coordOf(ship: string, dir: string): number {
  // Board coords are "col,level"; push the ship toward whichever corner it leads.
  if (!ship.includes(',')) return 0;
  const [col, level] = ship.split(',').map(Number);
  return dir === 'north' ? level : dir === 'east' ? col : -col;
}
function bestCard(cards: any[], ship: string): any {
  return cards.slice().sort((a, b) => coordOf(ship, b.direction) - coordOf(ship, a.direction))[0];
}

function conserved(g: Game) {
  const held = g.seats.reduce((n, s) => n + s.guns, 0);
  return held + g.supplyPool === TOTAL_GUNS;
}
function tableLeaksFaction(g: Game): boolean {
  // The only true leak is the private `faction` key. `flogged` legitimately holds
  // a faction VALUE (a public "is NOT a ___" fact), so we check for the key only.
  return JSON.stringify(g.viewForTable().seats).includes('"faction"');
}

function step(g: Game): boolean {
  // returns true if it acted; deciders push the ship's leading corner
  const tv = g.viewForTable();
  // resolve pending / phase-level table actions first
  for (const seat of g.seats) {
    const pv = g.viewForPlayer(seat.id)!;
    const p: any = pv.prompt;
    switch (p.kind) {
      case 'pirateGathering': g.ackGathering(seat.id); return true;
      case 'appoint': {
        const el = p.data.eligible; if (el.length < 2) return false;
        g.appointTeam(el[0].seatId, el[1].seatId); return true;
      }
      case 'lockGuns':
        if (!p.data.locked) { const g0 = Math.random() < 0.9 ? 0 : Math.floor(Math.random() * (p.data.maxGuns + 1)); g.lockGuns(seat.id, g0); return true; }
        break;
      case 'mutinyResult':
        if (p.data.canContinue) { g.continueAfterMutiny(); return true; }
        break;
      case 'tieResolution': g.resolveTiePick(rand(p.data.tied).seatId); return true;
      case 'navDiscard': {
        const cards = p.data.cards as any[];
        const keep = bestCard(cards, g.shipSpace!);
        const disc = cards.find(c => c.id !== keep.id) ?? cards[0];
        g.navDiscard(seat.id, disc.id); return true;
      }
      case 'navChoose': {
        const cards = p.data.cards as any[];
        if (Math.random() < 0.02) { g.denialOfCommand(seat.id); return true; }
        g.navChoose(seat.id, bestCard(cards, g.shipSpace!).id); return true;
      }
      case 'cabinResult': g.ackCabinResult(seat.id); return true;
      case 'mermaidView': g.ackMermaid(seat.id); return true;
      case 'telescopeView': g.telescopeDecide(seat.id, Math.random() < 0.5); return true;
      case 'cultConvert': { const t = p.data.targets; if (t.length) { g.cultConvert(seat.id, rand(t).seatId); return true; } break; }
      case 'cultGuns': g.cultGunsDone(seat.id); return true;
      case 'cultCabin': g.ackCultCabin(seat.id); return true;
      case 'chooseTarget': {
        const a = p.data.action; const t = p.data.targets; if (!t.length) break;
        const id = rand(t).seatId;
        if (a === 'cabinSearch') g.mapCabinPick(seat.id, id);
        else if (a === 'flogging') g.mapFlogPick(seat.id, id);
        else if (a === 'offWithTongue') g.mapTonguePick(seat.id, id);
        else if (a === 'feedTheKraken') g.mapFeedPick(seat.id, id);
        else if (a === 'mermaid') g.mermaidPick(seat.id, id);
        else if (a === 'telescope') g.telescopePick(seat.id, id);
        else if (a === 'emergencyNav') g.designateEmergencyNavigator(seat.id, id);
        return true;
      }
    }
  }
  if (tv.gate) { g.playStep(); return true; }
  if (tv.phase === 'offDuty') { g.nextRound(); return true; }
  return false;
}

function playGame(nPlayers: number) {
  const g = new Game('SIM');
  for (let i = 0; i < nPlayers; i++) g.addSeat('P' + i);
  g.startGame();
  let steps = 0;
  while (g.phase !== 'ended' && steps < 12000) {
    assert.ok(conserved(g), `guns not conserved before step ${steps} (phase ${g.phase})`);
    assert.ok(!tableLeaksFaction(g), `table leaked a faction at step ${steps} (phase ${g.phase})`);
    const acted = step(g);
    if (!acted) assert.fail(`deadlock at step ${steps}, phase ${g.phase}`);
    steps++;
  }
  assert.ok(conserved(g), 'guns conserved at end');
  return { ended: g.phase === 'ended', steps, g };
}

test('simulation: 30 games (5-7 players) run to completion without deadlock', () => {
  let ended = 0;
  for (let i = 0; i < 30; i++) {
    const r = playGame(5 + (i % 3));
    if (r.ended) ended++;
  }
  assert.ok(ended >= 24, `expected most games to end, got ${ended}/30`);
});

test('simulation: 20 games (7-11 players) run to completion', () => {
  let ended = 0;
  for (let i = 0; i < 20; i++) {
    const r = playGame(7 + (i % 5));
    if (r.ended) ended++;
  }
  assert.ok(ended >= 13, `expected most games to end, got ${ended}/20`);
});

test('simulation: end reveal names a winning faction and all seat factions', () => {
  const r = playGame(6);
  const tv = r.g.viewForTable();
  assert.ok(tv.ended, 'game should end');
  assert.ok(tv.ended!.winners.length >= 1);
  assert.equal(Object.keys(tv.ended!.factions).length, 6);
});
