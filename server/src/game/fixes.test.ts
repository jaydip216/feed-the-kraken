import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './GameState.js';
import { offDutyRecipients } from '@ftk/shared';

// Regression tests for the rules audit. Each one fails on the pre-fix engine.

function setup(names: string[]) {
  const g = new Game('TEST');
  for (const n of names) g.addSeat(n);
  g.startGame();
  (g as any).phase = 'appoint';
  return g;
}
const SIX = ['A', 'B', 'C', 'D', 'E', 'F'];
function appoint(g: Game) {
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  return others;
}
// Push a game past the mutiny with nobody revealing guns.
function throughMutiny(g: Game, others: ReturnType<typeof appoint>) {
  for (const s of others) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(g.captain()!.id);
}

test('p.13: a player without a tongue can still be appointed to the team', () => {
  const g = setup(SIX);
  const others = g.seats.filter(s => !s.isCaptain);
  others[0].hasTongue = false;
  const eligible = (g.viewForPlayer(g.captain()!.id)!.prompt as any).data.eligible;
  assert.ok(eligible.some((e: any) => e.seatId === others[0].id), 'silenced player must stay eligible');
  g.appointTeam(g.captain()!.id, others[0].id, others[1].id);
  assert.equal(g.phase, 'mutiny', 'the appointment must be accepted');
});

test('p.10: only the captain may appoint the navigation team', () => {
  const g = setup(SIX);
  const others = g.seats.filter(s => !s.isCaptain);
  g.appointTeam(others[2].id, others[0].id, others[1].id);
  assert.equal(g.phase, 'appoint', 'a non-captain must not be able to appoint');
  assert.ok(g.seats.every(s => !s.badge), 'no badges handed out');
});

test('p.9: only the captain may continue past a revealed mutiny', () => {
  const g = setup(SIX);
  const others = appoint(g);
  for (const s of others) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(others[3].id);
  assert.equal(g.phase, 'mutiny', 'a crew member must not be able to continue');
  g.continueAfterMutiny(g.captain()!.id);
  assert.equal(g.phase, 'navigation');
});

test('p.10: a new captain drops their badge', () => {
  const g = setup(SIX);
  const others = appoint(g);
  const lt = g.seats.find(s => s.badge === 'lieutenant')!;
  g.lockGuns(lt.id, 3);
  for (const s of others.filter(s => s.id !== lt.id)) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(g.captain()!.id);
  assert.equal(g.captain()!.id, lt.id, 'the lieutenant won the mutiny');
  assert.equal(lt.badge, undefined, 'the captain must not also wear a badge');
});

test('p.10: the Drunk card never leaves the new captain wearing a badge', () => {
  const g = setup(SIX);
  const others = appoint(g);
  throughMutiny(g, others);
  // Force the drunk action on whoever currently holds the lieutenant badge.
  const lt = g.seats.find(s => s.badge === 'lieutenant')!;
  for (const s of g.seats) s.resume = s.id === lt.id ? [] : ['north'];
  (g as any).applyDrunk();
  if (g.captain()!.id === lt.id) assert.equal(lt.badge, undefined);
  assert.equal(g.seats.filter(s => s.isCaptain && s.badge).length, 0);
});

test('p.9: a tie is broken down the chain, not by the captain alone', () => {
  const g = setup(SIX);
  const others = appoint(g);
  const [a, b, c] = others;
  g.lockGuns(a.id, 2); g.lockGuns(b.id, 2); g.lockGuns(c.id, 2);
  for (const s of others.slice(3)) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(g.captain()!.id);
  assert.equal(g.phase, 'mutinyTieResolution');
  // Only the captain may knock the first hand down.
  g.resolveTiePick(a.id, b.id);
  assert.equal((g as any).tieCandidates.length, 3, 'a tied player cannot pick first');
  g.resolveTiePick(g.captain()!.id, a.id);
  // Now it is the selected player's turn — not the captain's.
  assert.equal((g as any).tiePicker, a.id);
  assert.equal((g.viewForPlayer(a.id)!.prompt as any).kind, 'tieResolution');
  assert.equal((g.viewForPlayer(g.captain()!.id)!.prompt as any).kind, 'idle');
  g.resolveTiePick(g.captain()!.id, b.id);
  assert.equal(g.phase, 'mutinyTieResolution', 'the captain has already had their pick');
  g.resolveTiePick(a.id, b.id);
  assert.equal(g.captain()!.id, c.id, 'the last raised hand becomes captain');
});

test('p.9: a mutiny nobody can win still discards the revealed guns', () => {
  const g = setup(SIX);
  const others = appoint(g);
  for (const s of others) s.hasTongue = false;   // nobody can take the helm
  const cap = g.captain()!;
  const supplyBefore = g.supplyPool;
  g.lockGuns(others[0].id, 3);
  for (const s of others.slice(1)) g.lockGuns(s.id, 0);
  g.continueAfterMutiny(cap.id);
  assert.equal(g.captain()!.id, cap.id, 'captaincy unchanged');
  assert.equal(g.supplyPool, supplyBefore + 3, 'revealed guns are discarded');
  assert.equal(others[0].guns, 0);
  assert.equal(g.phase, 'appoint', 'the round ends');
});

test('p.11: off-duty signs follow the players who actually navigated', () => {
  const g = setup(SIX);
  const others = appoint(g);
  const lt = g.seats.find(s => s.badge === 'lieutenant')!;
  const nav = g.seats.find(s => s.badge === 'navigator')!;
  throughMutiny(g, others);
  // Drunk hands the helm to the lieutenant mid-execution; the signs must still
  // go to the crew who navigated, not to whoever holds a badge afterwards.
  for (const s of g.seats) s.resume = s.id === lt.id ? [] : ['north'];
  (g as any).applyDrunk();
  (g as any).beginOffDuty();
  const recipients = offDutyRecipients(6);
  assert.deepEqual(recipients, ['navigator']);
  assert.equal(nav.offDuty, true, 'the navigator who sailed takes the sign');
  assert.equal(g.seats.filter(s => s.offDuty).length, 1);
});

test('p.14: the Cult Cabin Search shows three distinct navigators', () => {
  const g = setup(SIX);
  const others = appoint(g);
  const lt = g.seats.find(s => s.badge === 'lieutenant')!;
  throughMutiny(g, others);
  for (const s of g.seats) s.resume = s.id === lt.id ? [] : ['north'];
  (g as any).applyDrunk();
  const team = (g as any).navigationTeam();
  assert.equal(team.length, 3, 'captain, lieutenant and navigator must be three people');
  assert.equal(new Set(team.map((s: any) => s.id)).size, 3);
});

test('p.12: a denial of command with nobody left to designate does not deadlock', () => {
  const g = setup(['A', 'B', 'C', 'D', 'E']);
  const others = appoint(g);
  const lt = g.seats.find(s => s.badge === 'lieutenant')!;
  const nav = g.seats.find(s => s.badge === 'navigator')!;
  throughMutiny(g, others);
  // Everyone except the captain, lieutenant and navigator is already gone.
  for (const s of g.seats) if (s.id !== g.captain()!.id && s.id !== lt.id && s.id !== nav.id) s.eliminated = true;
  // Drive the navigation to the navigator's choice, then deny.
  const n = (g as any).nav;
  g.navDiscard(g.captain()!.id, n.captainCards[0].id);
  if ((g as any).nav?.step === 'lieutenantDiscard') g.navDiscard(lt.id, (g as any).nav.lieutenantCards[0].id);
  if ((g as any).nav?.step === 'navigatorChoose') g.denialOfCommand(nav.id);
  assert.notEqual(g.phase, 'emergencyNavigation', 'must not stall waiting on an impossible choice');
  assert.ok(g.seats.some(s => g.viewForPlayer(s.id)!.prompt.kind !== 'idle') || g.viewForTable().gate || g.phase === 'ended',
    'somebody must have a legal move');
});

test('p.12: the lieutenant cannot double as the emergency navigator', () => {
  const g = setup(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const others = appoint(g);
  const lt = g.seats.find(s => s.badge === 'lieutenant')!;
  const nav = g.seats.find(s => s.badge === 'navigator')!;
  throughMutiny(g, others);
  g.navDiscard(g.captain()!.id, (g as any).nav.captainCards[0].id);
  if ((g as any).nav?.step === 'lieutenantDiscard') g.navDiscard(lt.id, (g as any).nav.lieutenantCards[0].id);
  g.denialOfCommand(nav.id);
  assert.equal(g.phase, 'emergencyNavigation');
  const targets = (g.viewForPlayer(g.captain()!.id)!.prompt as any).data.targets.map((t: any) => t.seatId);
  assert.ok(!targets.includes(lt.id), 'the lieutenant keeps their post');
  assert.ok(!targets.includes(g.captain()!.id));
  g.designateEmergencyNavigator(g.captain()!.id, lt.id);
  assert.equal(g.phase, 'emergencyNavigation', 'an illegal designation is rejected');
  g.designateEmergencyNavigator(g.captain()!.id, targets[0]);
  assert.equal(g.phase, 'navigation');
});

test('p.14: mermaid and telescope must target another player', () => {
  const g = setup(SIX);
  const cap = g.captain()!;
  (g as any).pending = { type: 'mermaidPick', seatId: cap.id };
  g.mermaidPick(cap.id, cap.id);
  assert.equal((g as any).pending.type, 'mermaidPick', 'the captain cannot pick themself');
  (g as any).pending = { type: 'telescopePick', seatId: cap.id };
  g.telescopePick(cap.id, cap.id);
  assert.equal((g as any).pending.type, 'telescopePick');
});

test('the cult ritual stack reshuffles instead of jamming on Conversion', () => {
  const g = setup(SIX);
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) seen.push((g as any).drawCultRitual());
  assert.ok(seen.includes('gunsStash'), 'the stash must come back around');
  assert.ok(seen.includes('cultCabinSearch'), 'the cabin search must come back around');
  // Every reshuffled deal is a legal 3/1/1 stack.
  const conv = seen.filter(x => x === 'conversion').length;
  assert.ok(conv >= 20 && conv <= 28, `unexpected conversion rate ${conv}/40`);
});

test('a dropped phone does not freeze the mutiny', () => {
  const g = setup(SIX);
  const others = appoint(g);
  for (const s of others.slice(1)) g.lockGuns(s.id, 0);
  assert.equal(g.phase, 'mutiny');
  assert.equal(g.viewForTable().mutinyResult, undefined);
  g.markConnected(others[0].id, false);
  const tv = g.viewForTable();
  assert.ok(tv.mutinyResult, 'the reveal happens once nobody answerable is left');
  assert.equal(tv.mutinyResult!.success, false);
  assert.equal(tv.mutinyProgress, undefined);
});

test('mutiny progress does not count phones that have dropped', () => {
  const g = setup(SIX);
  const others = appoint(g);
  g.markConnected(others[0].id, false);
  g.lockGuns(others[1].id, 0);
  assert.deepEqual(g.viewForTable().mutinyProgress, { locked: 1, total: others.length - 1 });
});

// The host escape hatch has to actually unstick every phase it is offered in.
test('host force-advance moves every phase forward', () => {
  for (const n of [5, 6, 7, 9, 11]) {
    const g = new Game('TEST');
    for (let i = 0; i < n; i++) g.addSeat('P' + i);
    g.startGame();
    let guard = 0;
    const seen = new Set<string>();
    while (g.phase !== 'ended' && guard++ < 3000) {
      seen.add(g.phase);
      const fingerprint = () => {
        const tv = g.viewForTable();
        return JSON.stringify([g.phase, g.round, g.shipSpace, tv.gate, tv.navStep, tv.mutinyResult,
          (g as any).pending, (g as any).tiePicker, tv.seats]);
      };
      const before = fingerprint();
      assert.ok(g.forceAdvance(), `force-advance refused in phase ${g.phase} (${n}p)`);
      const after = fingerprint();
      assert.notEqual(before, after, `force-advance changed nothing in phase ${g.phase} (${n}p)`);
    }
    assert.equal(g.phase, 'ended', `${n}p game never ended under force-advance`);
    for (const phase of ['appoint', 'mutiny', 'navigation', 'execute', 'offDuty']) {
      assert.ok(seen.has(phase), `${n}p never passed through ${phase}`);
    }
  }
});

test('host undo still rewinds cleanly after a force-advance', () => {
  const g = setup(SIX);
  appoint(g);
  const before = JSON.stringify(g.viewForTable().seats);
  g.pushHistory();
  g.forceAdvance();
  assert.ok(g.undo());
  assert.equal(JSON.stringify(g.viewForTable().seats), before);
});
