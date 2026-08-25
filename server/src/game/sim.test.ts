import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './GameState.js';
import { TOTAL_GUNS, THE_MAP, DIRECTIONS, move, victoryHexes } from '@ftk/shared';
import type { Direction } from '@ftk/shared';

// Auto-plays one full game via the public API, responding to whatever each
// seat's prompt asks. Asserts gun conservation + table redaction every step.
function rand(a: any[]): any { return a[Math.floor(Math.random() * a.length)]; }

// Real distances over the real board, walked with the engine's own move()
// function, so the sim can steer instead of drifting. distanceTo(port) gives the
// number of navigations from every space to that victory space.
const DIRS = Object.keys(DIRECTIONS) as Direction[];
function distanceTo(portId: string): Map<string, number> {
  const dist = new Map<string, number>([[portId, 0]]);
  // Walk backwards: repeatedly relax every space until nothing improves.
  for (let pass = 0; pass < THE_MAP.hexes.length; pass++) {
    let changed = false;
    for (const h of THE_MAP.hexes) {
      for (const d of DIRS) {
        const to = move(THE_MAP, h.id, d).id;
        if (to === h.id) continue;
        const cand = (dist.get(to) ?? Infinity) + 1;
        if (cand < (dist.get(h.id) ?? Infinity)) { dist.set(h.id, cand); changed = true; }
      }
    }
    if (!changed) break;
  }
  return dist;
}
const PORTS = victoryHexes(THE_MAP).map(h => h.id);
const DIST: Record<string, Map<string, number>> = Object.fromEntries(PORTS.map(id => [id, distanceTo(id)]));

// A coalition converging on one port: pick the card whose direction lands the
// ship closest to it. This is what actually exercises victory, map icons and the
// supply line — a sim that picks at random rarely reaches a corner at all.
function bestCard(cards: any[], ship: string, port: string): any {
  const score = (c: any) => DIST[port].get(move(THE_MAP, ship, c.direction as Direction).id) ?? 99;
  return cards.slice().sort((a, b) => score(a) - score(b))[0];
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

function step(g: Game, port: string): boolean {
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
        g.appointTeam(seat.id, el[0].seatId, el[1].seatId); return true;
      }
      case 'lockGuns':
        if (!p.data.locked) { const g0 = Math.random() < 0.9 ? 0 : Math.floor(Math.random() * (p.data.maxGuns + 1)); g.lockGuns(seat.id, g0); return true; }
        break;
      case 'mutinyResult':
        if (p.data.canContinue) { g.continueAfterMutiny(seat.id); return true; }
        break;
      case 'tieResolution': g.resolveTiePick(seat.id, rand(p.data.tied).seatId); return true;
      case 'navDiscard': {
        const cards = p.data.cards as any[];
        const keep = bestCard(cards, g.shipSpace!, port);
        const disc = cards.find(c => c.id !== keep.id) ?? cards[0];
        g.navDiscard(seat.id, disc.id); return true;
      }
      case 'navChoose': {
        const cards = p.data.cards as any[];
        if (Math.random() < 0.02) { g.denialOfCommand(seat.id); return true; }
        g.navChoose(seat.id, bestCard(cards, g.shipSpace!, port).id); return true;
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

function playGame(nPlayers: number, port = rand(PORTS)) {
  const g = new Game('SIM');
  for (let i = 0; i < nPlayers; i++) g.addSeat('P' + i);
  g.startGame();
  let steps = 0;
  while (g.phase !== 'ended' && steps < 12000) {
    assert.ok(conserved(g), `guns not conserved before step ${steps} (phase ${g.phase})`);
    assert.ok(!tableLeaksFaction(g), `table leaked a faction at step ${steps} (phase ${g.phase})`);
    const acted = step(g, port);
    if (!acted) assert.fail(`deadlock at step ${steps}, phase ${g.phase}`);
    steps++;
  }
  assert.ok(conserved(g), 'guns conserved at end');
  return { ended: g.phase === 'ended', steps, g };
}

test('simulation: 30 games (5-7 players) run to completion without deadlock', () => {
  for (let i = 0; i < 30; i++) {
    const r = playGame(5 + (i % 3));
    assert.ok(r.ended, `game ${i} never ended (${r.steps} steps)`);
  }
});

test('simulation: 20 games (7-11 players) run to completion', () => {
  for (let i = 0; i < 20; i++) {
    const r = playGame(7 + (i % 5));
    assert.ok(r.ended, `game ${i} never ended (${r.steps} steps)`);
  }
});

test('simulation: every port on the board is reachable by steering for it', () => {
  for (const port of PORTS) {
    const r = playGame(7, port);
    assert.ok(r.ended, `steering for ${port} never ended`);
  }
});

test('simulation: end reveal names a winning faction and all seat factions', () => {
  const r = playGame(6);
  const tv = r.g.viewForTable();
  assert.ok(tv.ended, 'game should end');
  assert.ok(tv.ended!.winners.length >= 1);
  assert.equal(Object.keys(tv.ended!.factions).length, 6);
});
