// Authoritative game state + phase machine + redaction projector.
// The server owns EVERYTHING here; clients only ever receive viewFor* output.
import { nanoid } from 'nanoid';
import type {
  Seat, Faction, MapId, Phase, Direction, NavCard, NavAction, CultRitual,
  TableView, PlayerView, HostView, PublicSeat, LogEntry, PlayerPrompt, Spotlight, Entry,
} from '@ftk/shared';
import {
  TOTAL_GUNS, STARTING_GUNS_PER_PLAYER, MIN_PLAYERS, MAX_PLAYERS,
  mutinyThreshold, offDutyRecipients, RESHUFFLE_THRESHOLD,
  THE_MAP, getHex, move, victoryAt, VICTORY_LABEL, victoryFaction,
  MAP_ACTIONS, NAV_ACTIONS, CULT_RITUALS, DIRECTIONS, MOVEMENT_STEPS,
} from '@ftk/shared';
import { dealFactions } from './deal.js';
import { buildDrawPile, shuffle } from './deck.js';

// Navigation sub-state.
interface NavState {
  step: 'captainDiscard' | 'lieutenantDiscard' | 'navigatorChoose';
  captainCards: NavCard[];
  lieutenantCards: NavCard[];
  logbook: NavCard[];
  navigatorId: string | null; // resolved navigator (badge, or emergency designee)
  lieutenantId: string | null;
  emergency: boolean;
}

// A pending targeted request routed to one seat (captain or cult leader, etc.).
interface Pending {
  type:
    | 'cabinResult' | 'flogNo' | 'tongue' | 'feed'          // map actions
    | 'mapCabinPick' | 'mapFlogPick' | 'mapTonguePick' | 'mapFeedPick'
    | 'mermaidPick' | 'mermaidView' | 'telescopePick' | 'telescopeView' // card actions
    | 'cultConvert' | 'cultGuns' | 'cultCabin'              // rituals
    | 'emergencyNav' | 'tie';
  seatId: string;            // who must act
  data?: any;
}

// Full serialisable state (for host undo/rewind).
interface Snapshot {
  phase: Phase; round: number; supplyPool: number; shipSpace: string | null;
  seats: Seat[]; log: LogEntry[];
  drawPile: NavCard[]; discardPile: NavCard[];
  mutinyCommits: [string, number][]; mutinyResult: any; mutinyResolved: boolean;
  nav: NavState | null; resolveQueue: string[]; currentCard: NavCard | null;
  pending: Pending | null; pendingCultRitual: boolean; cultRitualType: CultRitual | null;
  cultRitualDeck: CultRitual[]; tieCandidates: string[]; tiePicker: string | null;
  revealedCard: NavCard | null;
  teamCaptainId: string | null; teamLieutenantId: string | null; teamNavigatorId: string | null;
  gate: { step: 'move' | 'mapAction' | 'cardAction' } | null; lastPublic: Spotlight | null;
}

export class Game {
  roomCode: string;
  mapId: MapId = 'standard';
  phase: Phase = 'lobby';
  round = 0;
  seats: Seat[] = [];
  supplyPool = TOTAL_GUNS;
  shipSpace: string | null = null;
  log: LogEntry[] = [];

  private gatheringAcks = new Set<string>();
  private mutinyCommits = new Map<string, number>();
  private mutinyResult?: { counts: Record<string, number>; sum: number; threshold: number; success: boolean };
  private mutinyResolved = false;

  private drawPile: NavCard[] = [];
  private discardPile: NavCard[] = [];
  private nav: NavState | null = null;
  private resolveQueue: string[] = [];
  private currentCard: NavCard | null = null;
  private revealedCard: NavCard | null = null;
  private pending: Pending | null = null;
  private pendingCultRitual = false;
  private cultRitualType: CultRitual | null = null;
  private cultRitualDeck: CultRitual[] = [];
  private tieCandidates: string[] = [];
  // Whose turn it is to knock a player out of a mutiny tie (p.9: the captain
  // picks first, then each selected player picks the next).
  private tiePicker: string | null = null;
  // The navigation team as it actually was when the navigation started. Badges
  // move around mid-round (Drunk, denial of command), so off-duty signs and the
  // Cult Cabin Search read these instead of the live badges.
  private teamCaptainId: string | null = null;
  private teamLieutenantId: string | null = null;
  private teamNavigatorId: string | null = null;
  // "Movement Steps I / II / III" gate: when set the table waits for a button.
  private gate: { step: 'move' | 'mapAction' | 'cardAction' } | null = null;
  // Last thing the whole table saw happen (public half of a captain action).
  private lastPublic: Spotlight | null = null;

  private history: Snapshot[] = [];
  private _ended?: { winners: Faction[]; reason: string; factions: Record<string, Faction> };

  constructor(roomCode: string) { this.roomCode = roomCode; }

  private now() { return Date.now(); }
  addLog(text: string) { this.log.push({ t: this.now(), text }); }
  get players() { return this.seats.length; }
  seat(id: string) { return this.seats.find(s => s.id === id); }
  captain() { return this.seats.find(s => s.isCaptain); }
  private badgeSeat(b: 'lieutenant' | 'navigator') { return this.seats.find(s => s.badge === b); }
  private activePlayers() { return this.seats.filter(s => !s.eliminated); }
  // Hand the captain's hat to a seat. The captain never also wears a badge —
  // p.10 forbids the captain appointing himself and forbids one player being
  // both lieutenant and navigator, so the badge is dropped on promotion.
  private setCaptain(seat: Seat) {
    for (const s of this.seats) s.isCaptain = false;
    seat.isCaptain = true;
    seat.badge = undefined;
  }

  // ---------------- host undo / rewind ----------------
  pushHistory() {
    const snap: Snapshot = {
      phase: this.phase, round: this.round, supplyPool: this.supplyPool, shipSpace: this.shipSpace,
      seats: this.seats.map(s => ({ ...s, resume: [...s.resume] })),
      log: [...this.log],
      drawPile: this.drawPile.map(c => ({ ...c })), discardPile: this.discardPile.map(c => ({ ...c })),
      mutinyCommits: [...this.mutinyCommits.entries()],
      mutinyResult: this.mutinyResult ? { ...this.mutinyResult, counts: { ...this.mutinyResult.counts } } : undefined,
      mutinyResolved: this.mutinyResolved,
      nav: this.nav ? JSON.parse(JSON.stringify(this.nav)) : null,
      resolveQueue: [...this.resolveQueue],
      currentCard: this.currentCard ? { ...this.currentCard } : null,
      pending: this.pending ? JSON.parse(JSON.stringify(this.pending)) : null,
      pendingCultRitual: this.pendingCultRitual, cultRitualType: this.cultRitualType,
      cultRitualDeck: [...this.cultRitualDeck], tieCandidates: [...this.tieCandidates],
      tiePicker: this.tiePicker,
      revealedCard: this.revealedCard ? { ...this.revealedCard } : null,
      teamCaptainId: this.teamCaptainId, teamLieutenantId: this.teamLieutenantId,
      teamNavigatorId: this.teamNavigatorId,
      gate: this.gate ? { ...this.gate } : null,
      lastPublic: this.lastPublic ? { ...this.lastPublic } : null,
    };
    this.history.push(snap);
    if (this.history.length > 60) this.history.shift();
  }
  canUndo() { return this.history.length > 0; }
  undo(): boolean {
    const s = this.history.pop();
    if (!s) return false;
    this.phase = s.phase; this.round = s.round; this.supplyPool = s.supplyPool; this.shipSpace = s.shipSpace;
    this.seats = s.seats.map(x => ({ ...x, resume: [...x.resume] }));
    this.log = [...s.log];
    this.drawPile = s.drawPile.map(c => ({ ...c })); this.discardPile = s.discardPile.map(c => ({ ...c }));
    this.mutinyCommits = new Map(s.mutinyCommits);
    this.mutinyResult = s.mutinyResult; this.mutinyResolved = s.mutinyResolved;
    this.nav = s.nav; this.resolveQueue = [...s.resolveQueue]; this.currentCard = s.currentCard;
    this.pending = s.pending; this.pendingCultRitual = s.pendingCultRitual; this.cultRitualType = s.cultRitualType;
    this.cultRitualDeck = [...s.cultRitualDeck]; this.tieCandidates = [...s.tieCandidates];
    this.tiePicker = s.tiePicker;
    this.revealedCard = s.revealedCard;
    this.teamCaptainId = s.teamCaptainId; this.teamLieutenantId = s.teamLieutenantId;
    this.teamNavigatorId = s.teamNavigatorId;
    this.gate = s.gate; this.lastPublic = s.lastPublic;
    this.addLog('Host undid the last action.');
    return true;
  }

  // ---------------- lobby ----------------
  addSeat(name: string): Seat {
    const seat: Seat = {
      id: nanoid(8), reconnectToken: nanoid(24), name, order: this.seats.length,
      connected: true, faction: 'sailor', guns: 0, isCaptain: false,
      offDuty: false, eliminated: false, hasTongue: true, examined: false, resume: [],
    };
    this.seats.push(seat);
    this.addLog(`${name} joined.`);
    return seat;
  }
  reattach(token: string): Seat | undefined {
    const s = this.seats.find(x => x.reconnectToken === token);
    if (s) { s.connected = true; this.addLog(`${s.name} reconnected.`); }
    return s;
  }
  setSeatingOrder(idsInOrder: string[]) {
    idsInOrder.forEach((id, i) => { const s = this.seat(id); if (s) s.order = i; });
    this.seats.sort((a, b) => a.order - b.order);
  }

  // ---------------- setup / deal ----------------
  startGame() {
    if (this.players < MIN_PLAYERS || this.players > MAX_PLAYERS)
      throw new Error(`need ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
    this.seats.sort((a, b) => a.order - b.order);
    const factions = dealFactions(this.players);
    this.seats.forEach((s, i) => { s.faction = factions[i]; s.guns = STARTING_GUNS_PER_PLAYER; });
    this.supplyPool = TOTAL_GUNS - STARTING_GUNS_PER_PLAYER * this.players;
    this.shipSpace = THE_MAP.startId;
    this.drawPile = buildDrawPile(this.mapId);
    this.discardPile = [];
    // 5 cult ritual cards: 3 conversion, 1 guns stash, 1 cult cabin search.
    this.cultRitualDeck = shuffle<CultRitual>(['conversion', 'conversion', 'conversion', 'gunsStash', 'cultCabinSearch']);
    // First captain is seat #1 in the physical seating order (not random), so the
    // table always knows who starts. After this, captaincy only changes through a
    // mutiny or a Drunk card, exactly as the rulebook says.
    const cap = this.seats[0];
    cap.isCaptain = true;
    this.round = 1;
    this.addLog('Factions dealt. Game begins.');
    if (this.seats.some(s => s.faction === 'pirate')) {
      this.phase = 'pirateGathering'; this.gatheringAcks.clear();
      this.addLog('Secret pirate gathering.');
    } else this.phase = 'appoint';
  }
  ackGathering(seatId: string) {
    this.gatheringAcks.add(seatId);
    const pirates = this.seats.filter(s => s.faction === 'pirate');
    if (pirates.every(p => this.gatheringAcks.has(p.id))) {
      this.phase = 'appoint';
      this.addLog(`Round ${this.round}: appoint a navigation team.`);
    }
  }

  // ---------------- appoint ----------------
  // p.10 restricts the team to: not the captain, not off-duty, not eliminated.
  // Losing a tongue only bars you from becoming captain (p.13) — a silent player
  // is still a perfectly legal lieutenant or navigator.
  private eligibleForTeam(): Seat[] {
    const aboard = this.seats.filter(s => !s.isCaptain && !s.eliminated);
    const onDuty = aboard.filter(s => !s.offDuty);
    // p.11: "Off-duty signs are ignored if there aren't enough available players
    // left for the captain to choose their navigation team."
    return onDuty.length >= 2 ? onDuty : aboard;
  }
  appointTeam(seatId: string, lieutenantId: string, navigatorId: string) {
    const cap = this.captain();
    if (!cap || this.phase !== 'appoint') return;
    if (cap.id !== seatId) return;              // only the captain appoints
    if (lieutenantId === navigatorId) return;
    const eligible = this.eligibleForTeam();
    const lt = this.seat(lieutenantId), nav = this.seat(navigatorId);
    const ok = (s?: Seat) => !!s && eligible.includes(s);
    if (!ok(lt) || !ok(nav)) return;
    this.assignTeam(lt!, nav!);
    this.addLog(`${cap.name} appointed ${lt!.name} (Lieutenant) & ${nav!.name} (Navigator).`);
    this.beginMutiny();
  }
  private assignTeam(lt?: Seat, nav?: Seat) {
    for (const s of this.seats) if (s.badge) s.badge = undefined;
    if (lt) lt.badge = 'lieutenant';
    if (nav) nav.badge = 'navigator';
    this.teamLieutenantId = lt?.id ?? null;
    this.teamNavigatorId = nav?.id ?? null;
  }

  // ---------------- mutiny ----------------
  private mutinyEligible(): Seat[] { return this.seats.filter(s => !s.isCaptain && !s.eliminated); }
  // Whom we are still genuinely waiting on. A player whose phone dropped can't
  // lock anything, so they'd otherwise freeze the phase forever; they commit 0.
  private mutinyPending(): Seat[] {
    return this.mutinyEligible().filter(s => s.connected && !this.mutinyCommits.has(s.id));
  }
  // Called when a socket connects/disconnects, so a drop mid-mutiny resolves it.
  markConnected(seatId: string, connected: boolean) {
    const s = this.seat(seatId);
    if (!s || s.connected === connected) return;
    s.connected = connected;
    if (!connected && this.phase === 'mutiny' && !this.mutinyResolved && this.mutinyPending().length === 0)
      this.resolveMutinyReveal();
  }
  beginMutiny() {
    // No crew left to mutiny — the captain sails straight to navigation.
    if (this.mutinyEligible().length === 0) { this.addLog('No crew to question — on to navigation.'); this.beginNavigation(); return; }
    this.phase = 'mutiny';
    this.mutinyCommits.clear(); this.mutinyResult = undefined; this.mutinyResolved = false;
    this.addLog('A question of loyalty — crew, lock in your guns.');
  }
  lockGuns(seatId: string, guns: number) {
    if (this.phase !== 'mutiny' || this.mutinyResolved) return;
    const s = this.seat(seatId);
    if (!s || s.isCaptain || s.eliminated) return;
    const g = Math.max(0, Math.min(Math.floor(guns) || 0, s.guns));
    this.mutinyCommits.set(seatId, g);
    if (this.mutinyPending().length === 0) this.resolveMutinyReveal();
  }
  private resolveMutinyReveal() {
    const counts: Record<string, number> = {}; let sum = 0;
    for (const e of this.mutinyEligible()) { const g = this.mutinyCommits.get(e.id) ?? 0; counts[e.id] = g; sum += g; }
    const threshold = mutinyThreshold(this.players);
    const success = sum >= threshold;
    this.mutinyResult = { counts, sum, threshold, success };
    this.mutinyResolved = true;
    this.addLog(`Loyalty revealed: ${sum} guns vs threshold ${threshold} — ${success ? 'MUTINY!' : 'no mutiny'}.`);
  }
  continueAfterMutiny(seatId?: string) {
    if (this.phase !== 'mutiny' || !this.mutinyResolved || !this.mutinyResult) return;
    if (seatId && this.captain()?.id !== seatId) return;   // only the captain continues
    const r = this.mutinyResult;
    if (!r.success) { this.addLog('The captain proceeds to navigation.'); this.beginNavigation(); return; }
    // successful mutiny: most revealed guns wins; tongueless count as 0 for this.
    const scored = Object.entries(r.counts).map(([id, g]) => [id, this.seat(id)?.hasTongue ? g : 0] as [string, number]);
    const max = Math.max(...scored.map(([, g]) => g));
    const tied = scored.filter(([, g]) => g === max && max > 0).map(([id]) => id);
    if (tied.length === 1) this.installNewCaptain(tied[0]);
    else if (tied.length === 0) {
      // The mutiny carried, but every player who raised guns is tongueless and so
      // counts as 0 (p.13) — nobody can take the helm. The revealed guns are still
      // discarded (p.9) and the round ends without a navigation.
      this.discardRevealedGuns();
      this.addLog('The mutiny carried, but no eligible player can take the helm — the round ends.');
      this.beginRound();
    }
    else this.beginTieResolution(tied);
  }
  private discardRevealedGuns() {
    for (const [id, g] of this.mutinyCommits) { const s = this.seat(id); if (s) { s.guns -= g; this.supplyPool += g; } }
  }
  private installNewCaptain(seatId: string) {
    this.discardRevealedGuns();
    const nc = this.seat(seatId)!;
    this.setCaptain(nc);
    this.addLog(`${nc.name} wins the mutiny and becomes the new captain.`);
    this.beginRound();
  }
  private beginTieResolution(tied: string[]) {
    this.phase = 'mutinyTieResolution'; this.tieCandidates = tied.slice();
    this.tiePicker = this.captain()?.id ?? null;
    this.addLog(`Tie for most guns between ${tied.map(id => this.seat(id)?.name).join(', ')} — captain breaks it.`);
  }
  // p.9: the captain in office knocks one tied player out, then THAT player
  // knocks out the next, and so on until one raised hand is left.
  resolveTiePick(seatId: string, loserId: string) {
    if (this.phase !== 'mutinyTieResolution') return;
    if (this.tiePicker && this.tiePicker !== seatId) return;
    if (!this.tieCandidates.includes(loserId)) return;
    this.tieCandidates = this.tieCandidates.filter(id => id !== loserId);
    this.addLog(`${this.seat(loserId)?.name} lowers their hand.`);
    if (this.tieCandidates.length === 1) {
      this.tiePicker = null; this.phase = 'mutiny';
      this.installNewCaptain(this.tieCandidates[0]);
    } else {
      this.tiePicker = loserId;   // the player just selected chooses next
    }
  }

  private beginRound() {
    this.round += 1;
    for (const s of this.seats) s.badge = undefined;
    this.phase = 'appoint';
    this.mutinyResolved = false; this.mutinyResult = undefined; this.mutinyCommits.clear();
    this.nav = null; this.currentCard = null; this.revealedCard = null; this.resolveQueue = [];
    this.pending = null; this.pendingCultRitual = false; this.cultRitualType = null;
    this.gate = null; this.lastPublic = null;
    this.tieCandidates = []; this.tiePicker = null;
    this.teamCaptainId = null; this.teamLieutenantId = null; this.teamNavigatorId = null;
    this.addLog(`Round ${this.round}: appoint a navigation team.`);
    this.maybeAutoResolveAppoint();
  }

  // Sub-three-players fallback (rulebook p.12): open positions resolved randomly.
  private maybeAutoResolveAppoint() {
    if (this.phase !== 'appoint') return;
    // p.12 applies ONLY below three players aboard. With three or more the
    // captain always chooses — off-duty signs are simply ignored when they would
    // leave too few candidates (handled in eligibleForTeam).
    if (this.activePlayers().length >= 3) return; // normal path
    const cap = this.captain();
    if (!cap) return;
    const pool = shuffle(this.eligibleForTeam());
    this.assignTeam(pool[0], pool[1]);
    this.addLog('Fewer than three aboard — open positions are resolved randomly.');
    this.beginMutiny();
  }

  // ---------------- navigation ----------------
  private reshuffleIfNeeded() {
    if (this.drawPile.length < RESHUFFLE_THRESHOLD) {
      this.drawPile = shuffle([...this.drawPile, ...this.discardPile]);
      this.discardPile = [];
      this.addLog('Draw pile ran low — the Deep Sea was reshuffled into the Map Archive.');
    }
  }
  private draw(n: number): NavCard[] {
    const out: NavCard[] = [];
    for (let i = 0; i < n; i++) {
      if (this.drawPile.length === 0) { this.drawPile = shuffle(this.discardPile); this.discardPile = []; }
      const c = this.drawPile.shift(); if (c) out.push(c);
    }
    return out;
  }
  private toDeepSea(cards: NavCard[]) { for (const c of cards) this.discardPile.push(c); }

  beginNavigation(navigatorId?: string, emergency = false) {
    this.phase = 'navigation';
    this.reshuffleIfNeeded();
    const lt = (this.teamLieutenantId ? this.seat(this.teamLieutenantId) : undefined) ?? this.badgeSeat('lieutenant');
    const navSeat = navigatorId
      ? this.seat(navigatorId)
      : (this.teamNavigatorId ? this.seat(this.teamNavigatorId) : undefined) ?? this.badgeSeat('navigator');
    // p.11: off-duty signs go to "the players involved in the current
    // navigation" — snapshot them now, before Drunk can move the hat.
    this.teamCaptainId = this.captain()?.id ?? null;
    this.teamLieutenantId = lt?.id ?? null;
    this.teamNavigatorId = navSeat?.id ?? null;
    this.nav = {
      step: 'captainDiscard',
      captainCards: this.draw(2),
      lieutenantCards: this.draw(2),
      logbook: [],
      navigatorId: navSeat?.id ?? null,
      lieutenantId: lt?.id ?? null,
      emergency,
    };
    this.mutinyResult = undefined; this.mutinyResolved = false;
    this.addLog(emergency ? 'Emergency navigation begins.' : 'Navigation begins — silence at the helm.');
    this.maybeAutoCaptain();
  }
  // With 0 or 1 cards the captain has no real choice — auto-advance.
  private maybeAutoCaptain() {
    const n = this.nav!;
    if (n.step !== 'captainDiscard') return;
    if (n.captainCards.length <= 1) {
      this.keepOne(n.captainCards, ''); n.captainCards = [];
      n.step = 'lieutenantDiscard';
      this.maybeAutoLieutenant();
    }
  }

  // Keep one card into the logbook, discarding the rest. Robust to a depleted
  // deck: with 1 card it is simply kept, with 0 nothing happens (rulebook notes
  // you can run out of cards mid-navigation late in a long game).
  private keepOne(cards: NavCard[], discardId: string) {
    if (cards.length === 0) return;
    if (cards.length === 1) { this.nav!.logbook.push(cards[0]); return; }
    const disc = cards.find(c => c.id === discardId) ?? cards[0];
    const keep = cards.find(c => c.id !== disc.id)!;
    this.toDeepSea([disc]); this.nav!.logbook.push(keep);
  }
  // captain or lieutenant discards one of their drawn cards (keeps the other).
  navDiscard(seatId: string, cardId: string) {
    if (this.phase !== 'navigation' || !this.nav) return;
    const n = this.nav;
    if (n.step === 'captainDiscard' && this.captain()?.id === seatId) {
      this.keepOne(n.captainCards, cardId); n.captainCards = [];
      n.step = 'lieutenantDiscard';
      this.maybeAutoLieutenant();
    } else if (n.step === 'lieutenantDiscard' && n.lieutenantId === seatId) {
      this.doLieutenantDiscard(cardId);
    }
  }
  private maybeAutoLieutenant() {
    if (!this.nav || this.nav.step !== 'lieutenantDiscard') return;
    const lt = this.nav.lieutenantId ? this.seat(this.nav.lieutenantId) : null;
    // Auto-resolve when there's no lieutenant, or no real choice (<=1 card).
    if (!lt || lt.eliminated || this.nav.lieutenantCards.length <= 1) {
      const cards = this.nav.lieutenantCards;
      const rand = cards[Math.floor(Math.random() * cards.length)];
      this.doLieutenantDiscard(rand?.id ?? '', !lt || lt.eliminated);
    }
  }
  private doLieutenantDiscard(cardId: string, auto = false) {
    const n = this.nav!;
    this.keepOne(n.lieutenantCards, cardId); n.lieutenantCards = [];
    n.logbook = shuffle(n.logbook); // close & shake the logbook
    if (auto) this.addLog('No lieutenant — the captain resolved it randomly.');
    if (n.logbook.length === 0) {
      // No cards survived (deck exhausted) — nothing to navigate this round.
      this.addLog('The Map Archive is empty — the ship drifts and holds course.');
      this.revealedCard = null; this.nav = null; this.beginOffDuty(); return;
    }
    n.step = 'navigatorChoose';
    this.maybeAutoNavigator();
  }
  private maybeAutoNavigator() {
    if (!this.nav) return;
    const nav = this.nav.navigatorId ? this.seat(this.nav.navigatorId) : null;
    if (!nav || nav.eliminated) {
      const keep = this.nav.logbook[Math.floor(Math.random() * this.nav.logbook.length)];
      if (keep) { this.addLog('No navigator — the captain resolved it randomly.'); this.navChoose(this.nav.navigatorId ?? '', keep.id, true); }
    }
  }
  // navigator keeps one logbook card (discards the other), or denies command.
  navChoose(seatId: string, cardId: string, auto = false) {
    if (this.phase !== 'navigation' || !this.nav || this.nav.step !== 'navigatorChoose') return;
    if (!auto && this.nav.navigatorId !== seatId) return;
    const keep = this.nav.logbook.find(c => c.id === cardId);
    const disc = this.nav.logbook.find(c => c.id !== cardId);
    if (!keep) return;
    if (disc) this.toDeepSea([disc]);
    this.revealedCard = keep;
    this.addLog(`The captain reveals the navigation card: ${keep.direction.toUpperCase()} (${keep.action}).`);
    this.beginExecute(keep);
  }
  // p.12: the captain may designate ANY remaining player — even an off-duty one.
  // The lieutenant keeps their post, so they can't double as the navigator.
  private emergencyNavCandidates(): Seat[] {
    return this.seats.filter(s => !s.eliminated && !s.isCaptain && s.id !== this.teamLieutenantId);
  }
  denialOfCommand(seatId: string) {
    if (this.phase !== 'navigation' || !this.nav || this.nav.step !== 'navigatorChoose') return;
    if (this.nav.navigatorId !== seatId) return;
    const nav = this.seat(seatId)!;
    this.toDeepSea(this.nav.logbook); this.nav.logbook = [];
    nav.eliminated = true; nav.badge = undefined;
    if (this.teamNavigatorId === nav.id) this.teamNavigatorId = null;
    this.nav = null;
    this.addLog(`${nav.name} denies command and jumps overboard!`);
    // Emergency navigation: the captain designates an emergency navigator. If
    // nobody is left to designate, p.12's "open positions are resolved randomly"
    // rule takes over rather than leaving the table with nothing to press.
    const cap = this.captain();
    if (!cap || this.emergencyNavCandidates().length === 0) {
      this.addLog('Nobody left to take the helm — the emergency navigation resolves itself.');
      this.beginNavigation(undefined, true);
      return;
    }
    this.pending = { type: 'emergencyNav', seatId: cap.id };
    this.phase = 'emergencyNavigation';
  }
  designateEmergencyNavigator(seatId: string, navId: string) {
    if (this.phase !== 'emergencyNavigation' || this.pending?.type !== 'emergencyNav') return;
    if (this.captain()?.id !== seatId) return;
    const nav = this.seat(navId);
    if (!nav || !this.emergencyNavCandidates().includes(nav)) return;
    this.pending = null;
    this.addLog(`${this.captain()!.name} designates ${nav.name} as emergency navigator.`);
    this.beginNavigation(navId, true);
  }

  // ---------------- execute (ordered resolution) ----------------
  private beginExecute(card: NavCard) {
    this.phase = 'execute';
    this.currentCard = card;
    // The card becomes the captain's résumé — never returns to the piles.
    const cap = this.captain();
    if (cap) cap.resume.push(card.direction);
    this.lastPublic = null;
    // The physical board prints "Movement Steps I / II / III". Each is gated behind
    // a button on the table so the whole crew watches it happen, in rulebook order:
    // move the ship -> resolve the space's icon -> resolve the card's own action.
    this.resolveQueue = [
      'gate:move', 'move', 'victory',
      'gate:mapAction', 'mapAction',
      'gate:cardAction', 'cardAction',
      'cultRitual', 'offDuty',
    ];
    this.advance();
  }

  // Process the queue until a step needs player input.
  private advance() {
    while (this.resolveQueue.length && !this.pending && !this.gate && this.phase !== 'ended') {
      const step = this.resolveQueue.shift()!;
      if (this.doStep(step)) return; // returns true if it set a pending prompt
    }
    if (this._ended) this.phase = 'ended';
  }
  // Returns true if the step paused for input.
  private doStep(step: string): boolean {
    switch (step) {
      case 'gate:move': return this.setGate('move');
      case 'gate:mapAction': {
        // Only pause for step II when the space the ship landed on actually has an icon.
        const hex = this.shipSpace ? getHex(THE_MAP, this.shipSpace) : undefined;
        return hex?.icon ? this.setGate('mapAction') : false;
      }
      case 'gate:cardAction': return this.setGate('cardAction');
      case 'move': this.stepMove(); return false;
      case 'mapAction': return this.stepMapAction();
      case 'cardAction': return this.stepCardAction();
      case 'victory': this.stepVictory(); return false;
      case 'cultRitual': return this.stepCultRitual();
      case 'offDuty': this.beginOffDuty(); return false;
      default: return false;
    }
  }

  private setGate(step: 'move' | 'mapAction' | 'cardAction'): boolean {
    this.gate = { step };
    return true;
  }
  // The table presses the Movement Step button; resolution continues.
  playStep() {
    if (!this.gate) return;
    this.gate = null;
    this.advance();
  }

  private stepMove() {
    const card = this.currentCard!;
    const map = THE_MAP;
    const from = this.shipSpace!;
    if (victoryAt(map, from)) return;               // already ashore
    const fromHex = getHex(map, from);
    const destHex = getHex(map, move(map, from, card.direction).id)!;
    const dir = DIRECTIONS[card.direction];
    this.shipSpace = destHex.id;
    if (destHex.victory) {
      this.addLog(`The ship sails ${dir.label.toLowerCase()} and reaches ${VICTORY_LABEL[destHex.victory]}!`);
      return;
    }
    this.addLog(`The ship sails ${dir.label.toLowerCase()} ${dir.symbol}.`);
    // Crossing the supply line refills every crew back up to three guns.
    const beforeLevel = fromHex?.level ?? 0;
    if (beforeLevel < map.supplyLineLevel && destHex.level >= map.supplyLineLevel) this.supplyLineRefill();
  }
  private supplyLineRefill() {
    let given = 0;
    for (const s of this.activePlayers()) {
      while (s.guns < STARTING_GUNS_PER_PLAYER && this.supplyPool > 0) { s.guns++; this.supplyPool--; given++; }
    }
    if (given) this.addLog(`Supply line crossed — crews refilled (${given} guns handed out).`);
  }

  // Announce the PUBLIC half of an action to the whole table. Secret results
  // (a faction seen, cards spied, a convert chosen) are never passed in here.
  private publish(kind: string, symbol: string, title: string, text: string, result?: string) {
    this.lastPublic = { kind, symbol, title, text, result };
  }

  private otherActive(cap: Seat) { return this.seats.some(x => x.id !== cap.id && !x.eliminated); }

  private stepMapAction(): boolean {
    const hex = getHex(THE_MAP, this.shipSpace!);
    if (!hex?.icon) return false;
    const cap = this.captain()!;
    if (!this.otherActive(cap)) { this.addLog('No one left to target — the map action passes.'); return false; }
    switch (hex.icon) {
      case 'cabinSearch': this.pending = { type: 'mapCabinPick', seatId: cap.id }; return true;
      case 'flogging':    this.pending = { type: 'mapFlogPick', seatId: cap.id }; return true;
      case 'offWithTongue': this.pending = { type: 'mapTonguePick', seatId: cap.id }; return true;
      case 'feedTheKraken': this.pending = { type: 'mapFeedPick', seatId: cap.id }; return true;
    }
    return false;
  }

  private stepCardAction(): boolean {
    const a = this.currentCard!.action as NavAction;
    const cap = this.captain()!;
    switch (a) {
      case 'drunk': this.applyDrunk(); return false;
      case 'armed': { const nav = this.nav?.navigatorId ? this.seat(this.nav.navigatorId) : this.badgeSeat('navigator');
        if (nav && this.supplyPool > 0) { nav.guns++; this.supplyPool--;
          this.publish('armed', NAV_ACTIONS.armed.symbol, NAV_ACTIONS.armed.title, `${nav.name} is armed.`, `${nav.name} takes 1 gun from the supply.`);
          this.addLog(`${nav.name} is armed (+1 gun).`); } return false; }
      case 'disarmed': { const nav = this.nav?.navigatorId ? this.seat(this.nav.navigatorId) : this.badgeSeat('navigator');
        if (nav && nav.guns > 0) { nav.guns--; this.supplyPool++;
          this.publish('disarmed', NAV_ACTIONS.disarmed.symbol, NAV_ACTIONS.disarmed.title, `${nav.name} is disarmed.`, `${nav.name} returns 1 gun to the supply.`);
          this.addLog(`${nav.name} is disarmed (-1 gun).`); } return false; }
      case 'mermaid': if (!this.otherActive(cap)) { this.addLog('No one to consult the mermaid — it passes.'); return false; } this.pending = { type: 'mermaidPick', seatId: cap.id }; return true;
      case 'telescope': if (!this.otherActive(cap)) { this.addLog('No one to hand the telescope — it passes.'); return false; } this.pending = { type: 'telescopePick', seatId: cap.id }; return true;
      case 'cultUprising': this.pendingCultRitual = true; this.addLog('A cult uprising stirs…'); return false;
    }
    return false;
  }

  private applyDrunk() {
    // Captaincy moves clockwise to the next player with the fewest résumés
    // (tongueless players are ignored).
    const eligible = this.seats.filter(s => !s.eliminated && s.hasTongue);
    if (!eligible.length) return;
    const minResume = Math.min(...eligible.map(s => s.resume.length));
    const capIdx = this.seats.findIndex(s => s.isCaptain);
    let chosen: Seat | undefined;
    for (let i = 1; i <= this.seats.length; i++) {
      const s = this.seats[(capIdx + i) % this.seats.length];
      if (!s.eliminated && s.hasTongue && s.resume.length === minResume) { chosen = s; break; }
    }
    if (!chosen) return;
    const before = this.captain();
    this.setCaptain(chosen);
    const da = NAV_ACTIONS.drunk;
    this.publish('drunk', da.symbol, da.title,
      `${before?.name ?? 'The captain'} is drunk and loses the helm.`,
      `${chosen.name} is the new captain.`);
    this.addLog(`The captain is drunk! Captaincy passes clockwise to ${chosen.name}.`);
  }

  private stepVictory() {
    const v = victoryAt(THE_MAP, this.shipSpace);
    if (v) this.endGame(victoryFaction(v), `The ship reached ${VICTORY_LABEL[v]}.`);
  }

  // The five ritual cards are revealed one at a time; there are six Cult Uprising
  // navigation cards, so the stack is reshuffled once it is exhausted rather than
  // silently defaulting to Conversion forever.
  private drawCultRitual(): CultRitual {
    if (this.cultRitualDeck.length === 0) {
      this.cultRitualDeck = shuffle<CultRitual>(['conversion', 'conversion', 'conversion', 'gunsStash', 'cultCabinSearch']);
      this.addLog('The cult ritual cards are shuffled anew.');
    }
    return this.cultRitualDeck.shift()!;
  }

  private stepCultRitual(): boolean {
    if (!this.pendingCultRitual) return false;
    this.pendingCultRitual = false;
    const leader = this.seats.find(s => s.faction === 'cultLeader' && !s.eliminated);
    if (!leader) { this.addLog('The cult uprising fizzles — no cult leader aboard.'); return false; }
    const ritual = this.drawCultRitual();
    this.cultRitualType = ritual;
    this.phase = 'cultRitual';
    const ra = CULT_RITUALS[ritual];
    this.publish('cultRitual', ra.symbol, ra.title,
      `A cult ritual card is flipped: ${ra.title}. The Cult Leader acts in secret.`);
    this.addLog(`Cult ritual revealed: ${ra.title}.`);
    switch (ritual) {
      case 'conversion': {
        const convertible = this.seats.some(x => !x.eliminated && !x.examined && x.faction !== 'cultist' && x.faction !== 'cultLeader');
        if (!convertible) { this.addLog('No convertible souls remain — the ritual fizzles.'); this.cultRitualType = null; return false; }
        this.pending = { type: 'cultConvert', seatId: leader.id }; return true;
      }
      case 'gunsStash':
        if (this.supplyPool <= 0) { this.addLog('The supply is empty — the guns stash yields nothing.'); this.cultRitualType = null; return false; }
        this.pending = { type: 'cultGuns', seatId: leader.id, data: { remaining: 3, given: {} } }; return true;
      case 'cultCabinSearch': this.pending = { type: 'cultCabin', seatId: leader.id }; return true;
    }
    return false;
  }

  // ---------------- map action resolvers (captain input) ----------------
  mapCabinPick(seatId: string, targetId: string) {
    if (this.pending?.type !== 'mapCabinPick' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    if (!t || t.id === seatId || t.eliminated) return;
    t.examined = true;
    this.pending = { type: 'cabinResult', seatId, data: { targetId, faction: t.faction, name: t.name } };
    const a = MAP_ACTIONS.cabinSearch;
    this.publish('cabinSearch', a.symbol, a.title,
      `${this.captain()!.name} searches ${t.name}'s seabag. Only the captain sees the result.`);
    this.addLog(`${this.captain()!.name} searches ${t.name}'s cabin.`);
  }
  ackCabinResult(seatId: string) {
    if (this.pending?.type !== 'cabinResult' || this.pending.seatId !== seatId) return;
    this.pending = null; this.continueExecute();
  }
  mapFlogPick(seatId: string, targetId: string) {
    if (this.pending?.type !== 'mapFlogPick' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    if (!t || t.id === seatId || t.eliminated) return;
    t.examined = true;
    const mapped: Faction = t.faction === 'cultist' ? 'cultLeader' : t.faction; // green/yellow both = cult
    const options: Faction[] = (['pirate', 'sailor', 'cultLeader'] as Faction[]).filter(f => f !== mapped);
    const not = options[Math.floor(Math.random() * options.length)];
    t.flogged = not;
    const fa = MAP_ACTIONS.flogging;
    this.publish('flogging', fa.symbol, fa.title,
      `${this.captain()!.name} has ${t.name} flogged.`,
      `${t.name} is NOT ${this.factionLabel(not)}.`);
    this.addLog(`${t.name} is flogged — publicly shown NOT to be ${this.factionLabel(not)}.`);
    this.pending = null; this.continueExecute();
  }
  mapTonguePick(seatId: string, targetId: string) {
    if (this.pending?.type !== 'mapTonguePick' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    if (!t || t.id === seatId || t.eliminated) return;
    t.hasTongue = false;
    const ta = MAP_ACTIONS.offWithTongue;
    this.publish('offWithTongue', ta.symbol, ta.title,
      `${this.captain()!.name} silences ${t.name}.`,
      `${t.name} may no longer speak and can never become captain.`);
    this.addLog(`${t.name} loses their tongue — they can no longer become captain.`);
    this.pending = null; this.continueExecute();
  }
  mapFeedPick(seatId: string, targetId: string) {
    if (this.pending?.type !== 'mapFeedPick' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    if (!t || t.id === seatId || t.eliminated) return;
    t.eliminated = true; t.badge = undefined;
    const ka = MAP_ACTIONS.feedTheKraken;
    this.publish('feedTheKraken', ka.symbol, ka.title,
      `${this.captain()!.name} feeds ${t.name} to the Kraken!`,
      `${t.name} is eliminated and must stay silent.`);
    this.addLog(`${t.name} is fed to the Kraken!`);
    this.pending = null;
    if (t.faction === 'cultLeader') { this.endGame(victoryFaction('cult'), 'The Cult Leader was fed to the Kraken.'); return; }
    this.continueExecute();
  }

  // ---------------- card action resolvers ----------------
  mermaidPick(seatId: string, targetId: string) {
    if (this.pending?.type !== 'mermaidPick' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    if (!t || t.eliminated || t.id === seatId) return;
    const last3 = this.discardPile.slice(-3).map(c => ({ direction: c.direction, action: c.action }));
    this.pending = { type: 'mermaidView', seatId: t.id, data: { cards: last3 } };
    const ma = NAV_ACTIONS.mermaid;
    this.publish('mermaid', ma.symbol, ma.title,
      `${this.captain()!.name} asks ${t.name} to consult the mermaid. Only ${t.name} sees the cards.`);
    this.addLog(`${this.captain()!.name} asks ${t.name} to consult the mermaid.`);
  }
  ackMermaid(seatId: string) {
    if (this.pending?.type !== 'mermaidView' || this.pending.seatId !== seatId) return;
    this.pending = null; this.continueExecute();
  }
  telescopePick(seatId: string, targetId: string) {
    if (this.pending?.type !== 'telescopePick' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    if (!t || t.eliminated || t.id === seatId) return;
    const top = this.drawPile[0];
    this.pending = { type: 'telescopeView', seatId: t.id, data: { card: top ? { direction: top.direction, action: top.action } : null } };
    const te = NAV_ACTIONS.telescope;
    this.publish('telescope', te.symbol, te.title,
      `${this.captain()!.name} hands ${t.name} the telescope. Only ${t.name} sees the card.`);
    this.addLog(`${this.captain()!.name} hands ${t.name} the telescope.`);
  }
  telescopeDecide(seatId: string, discard: boolean) {
    if (this.pending?.type !== 'telescopeView' || this.pending.seatId !== seatId) return;
    const who = this.seat(seatId)?.name ?? '';
    const te2 = NAV_ACTIONS.telescope;
    if (discard && this.drawPile.length) {
      const c = this.drawPile.shift()!; this.discardPile.push(c);
      this.publish('telescope', te2.symbol, te2.title, `${who} looked through the telescope.`, `${who} discarded the card into the Deep Sea.`);
      this.addLog(`${who} discards the spied card to the Deep Sea.`);
    } else {
      this.publish('telescope', te2.symbol, te2.title, `${who} looked through the telescope.`, `${who} left the card on the draw pile.`);
      this.addLog(`${who} leaves the card on the draw pile.`);
    }
    this.pending = null; this.continueExecute();
  }

  // ---------------- cult ritual resolvers ----------------
  cultConvert(seatId: string, targetId: string) {
    if (this.pending?.type !== 'cultConvert' || this.pending.seatId !== seatId) return;
    const t = this.seat(targetId);
    // convertible: not examined, not eliminated, not already cult, not the leader.
    if (!t || t.eliminated || t.examined || t.faction === 'cultist' || t.faction === 'cultLeader') return;
    t.faction = 'cultist';
    // Rulebook p.15: the converted player opens their eyes while the Cult Leader
    // is touching their fist — so they learn who their master is. (A cultist dealt
    // at setup in an 11-player game never learns this.)
    t.knowsCultLeader = true;
    this.addLog(`The cult claims a new soul…`);
    this.pending = null; this.finishCultRitual();
  }
  cultGunsGive(seatId: string, targetId: string) {
    if (this.pending?.type !== 'cultGuns' || this.pending.seatId !== seatId) return;
    const d = this.pending.data as { remaining: number; given: Record<string, number> };
    const t = this.seat(targetId);
    if (!t || t.eliminated || d.remaining <= 0 || this.supplyPool <= 0) return;
    t.guns++; this.supplyPool--; d.remaining--;
    d.given[targetId] = (d.given[targetId] ?? 0) + 1;
    if (d.remaining <= 0 || this.supplyPool <= 0) { this.addLog('The cult distributes guns from its stash.'); this.pending = null; this.finishCultRitual(); }
  }
  cultGunsDone(seatId: string) {
    if (this.pending?.type !== 'cultGuns' || this.pending.seatId !== seatId) return;
    this.addLog('The cult distributes guns from its stash.');
    this.pending = null; this.finishCultRitual();
  }
  ackCultCabin(seatId: string) {
    if (this.pending?.type !== 'cultCabin' || this.pending.seatId !== seatId) return;
    this.pending = null; this.finishCultRitual();
  }
  private finishCultRitual() {
    this.phase = 'execute';
    this.continueExecute();
  }

  // Called by every resolver to resume the queue after input.
  private continueExecute() { if (this.phase !== 'ended') { this.phase = 'execute'; this.advance(); } }

  // ---------------- off-duty & round end ----------------
  private beginOffDuty() {
    this.phase = 'offDuty';
    const recipients = offDutyRecipients(this.players);
    // previous off-duty players become available again
    for (const s of this.seats) s.offDuty = false;
    // p.11: "the corresponding players who were involved in the current
    // navigation" — the snapshot taken at beginNavigation, not the live badges,
    // because Drunk (step III) and emergency navigation both move them.
    const nav = (this.teamNavigatorId ? this.seat(this.teamNavigatorId) : undefined) ?? this.badgeSeat('navigator');
    const lt = (this.teamLieutenantId ? this.seat(this.teamLieutenantId) : undefined) ?? this.badgeSeat('lieutenant');
    const cap = (this.teamCaptainId ? this.seat(this.teamCaptainId) : undefined) ?? this.captain();
    // A player can hold only one sign; skip a slot whose player already has one.
    if (recipients.includes('navigator') && nav && !nav.eliminated) nav.offDuty = true;
    if (recipients.includes('lieutenant') && lt && !lt.eliminated) lt.offDuty = true;
    if (recipients.includes('captain') && cap && !cap.eliminated) cap.offDuty = true;
    this.addLog('Off-duty signs handed out; the navigation team stands down.');
  }
  // Table/host taps "next round" after off-duty (or auto could advance).
  nextRound() {
    if (this.phase !== 'offDuty') return;
    this.beginRound();
  }

  // ---------------- host escape hatch ----------------
  // Unsticks whatever the table is waiting on. A phone dies, a player walks off,
  // a browser is closed mid-prompt — without this the round has no legal move for
  // anybody. It follows the rulebook's own fallback (p.12: "any open position is
  // resolved randomly by the captain") rather than inventing new outcomes.
  forceAdvance(): boolean {
    if (this.phase === 'lobby' || this.phase === 'ended') return false;
    if (this.gate) { this.addLog('Host advanced the movement step.'); this.playStep(); return true; }
    if (this.pending) return this.forcePending();
    switch (this.phase) {
      case 'pirateGathering': {
        for (const pir of this.seats.filter(x => x.faction === 'pirate')) this.gatheringAcks.add(pir.id);
        this.addLog('Host closed the pirate gathering.');
        this.phase = 'appoint';
        this.addLog(`Round ${this.round}: appoint a navigation team.`);
        return true;
      }
      case 'appoint': {
        const pool = shuffle(this.eligibleForTeam());
        this.assignTeam(pool[0], pool[1]);
        this.addLog('Host resolved the navigation team randomly.');
        this.beginMutiny();
        return true;
      }
      case 'mutiny':
        if (!this.mutinyResolved) { this.addLog('Host called the loyalty check early.'); this.resolveMutinyReveal(); }
        else { this.addLog('Host continued past the mutiny.'); this.continueAfterMutiny(); }
        return true;
      case 'mutinyTieResolution': {
        const loser = this.pickOne(this.tieCandidates.map(id => this.seat(id)!).filter(Boolean));
        if (!loser) return false;
        this.addLog('Host broke the tie randomly.');
        this.resolveTiePick(this.tiePicker ?? '', loser.id);
        return true;
      }
      case 'navigation': return this.forceNavigation();
      case 'emergencyNavigation': {
        this.pending = null;
        const nav = this.pickOne(this.emergencyNavCandidates());
        this.addLog('Host designated the emergency navigator randomly.');
        this.beginNavigation(nav?.id, true);
        return true;
      }
      case 'execute':
      case 'cultRitual':
        this.addLog('Host resumed the navigation.');
        this.continueExecute();
        return true;
      case 'offDuty':
        this.addLog('Host started the next round.');
        this.nextRound();
        return true;
    }
    return false;
  }
  private pickOne<T>(xs: T[]): T | undefined { return xs.length ? xs[Math.floor(Math.random() * xs.length)] : undefined; }

  // Resolve whichever navigation sub-step is stalled, exactly as the engine
  // already does when the seat holding it is absent.
  private forceNavigation(): boolean {
    const n = this.nav;
    if (!n) return false;
    if (n.step === 'captainDiscard') {
      this.addLog("Host resolved the captain's draw randomly.");
      this.navDiscard(this.captain()?.id ?? '', this.pickOne(n.captainCards)?.id ?? '');
      return true;
    }
    if (n.step === 'lieutenantDiscard') {
      this.addLog("Host resolved the lieutenant's draw randomly.");
      this.doLieutenantDiscard(this.pickOne(n.lieutenantCards)?.id ?? '', true);
      return true;
    }
    this.addLog("Host resolved the navigator's choice randomly.");
    this.navChoose(n.navigatorId ?? '', this.pickOne(n.logbook)?.id ?? '', true);
    return true;
  }

  // Resolve a targeted prompt on the absent player's behalf. Mandatory actions
  // (the map icons) get a random legal target; "look at this" prompts are simply
  // acknowledged; anything optional is dropped.
  private forcePending(): boolean {
    const p = this.pending!;
    const who = p.seatId;
    const others = this.seats.filter(x => x.id !== who && !x.eliminated);
    const t = this.pickOne(others);
    this.addLog(`Host resolved a stalled prompt (${p.type}).`);
    switch (p.type) {
      case 'emergencyNav': {
        this.pending = null;
        this.beginNavigation(this.pickOne(this.emergencyNavCandidates())?.id, true);
        return true;
      }
      case 'mapCabinPick':   if (t) { this.mapCabinPick(who, t.id); return true; } break;
      case 'mapFlogPick':    if (t) { this.mapFlogPick(who, t.id); return true; } break;
      case 'mapTonguePick':  if (t) { this.mapTonguePick(who, t.id); return true; } break;
      case 'mapFeedPick':    if (t) { this.mapFeedPick(who, t.id); return true; } break;
      case 'mermaidPick':    if (t) { this.mermaidPick(who, t.id); return true; } break;
      case 'telescopePick':  if (t) { this.telescopePick(who, t.id); return true; } break;
      case 'cabinResult':    this.ackCabinResult(who); return true;
      case 'mermaidView':    this.ackMermaid(who); return true;
      case 'telescopeView':  this.telescopeDecide(who, false); return true;
      case 'cultCabin':      this.ackCultCabin(who); return true;
      case 'cultGuns':       this.cultGunsDone(who); return true;
      case 'cultConvert':    break;   // conversion is the leader's choice — skip it
      case 'tie':            break;
    }
    // Nothing legal to pick: drop the prompt and carry on with the queue.
    this.pending = null;
    if (this.phase === 'cultRitual') this.finishCultRitual(); else this.continueExecute();
    return true;
  }

  // ---------------- end game ----------------
  endGame(winners: Faction[], reason: string) {
    this.phase = 'ended';
    this.pending = null; this.resolveQueue = []; this.gate = null;
    this.addLog(`Game over: ${reason}`);
    this._ended = { winners, reason, factions: Object.fromEntries(this.seats.map(s => [s.id, s.faction])) };
  }
  winnersFor(kind: 'sailor' | 'pirate' | 'cult'): Faction[] { return victoryFaction(kind); }

  private factionLabel(f: Faction) {
    return f === 'sailor' ? 'a Sailor' : f === 'pirate' ? 'a Pirate' : f === 'cultLeader' ? 'the Cult Leader' : 'a Cultist';
  }

  // ================= REDACTION =================
  private gunsAreSecret() { return this.phase === 'mutiny' || this.phase === 'mutinyTieResolution'; }
  private publicSeat(s: Seat, gunsSecret: boolean): PublicSeat {
    return {
      id: s.id, name: s.name, order: s.order, connected: s.connected,
      guns: gunsSecret ? null : s.guns, isCaptain: s.isCaptain, badge: s.badge,
      offDuty: s.offDuty, eliminated: s.eliminated, hasTongue: s.hasTongue,
      resume: [...s.resume], flogged: s.flogged,
    };
  }

  // What the table is waiting for, or the last public thing that happened.
  private spotlight(): Spotlight | null {
    // While we're waiting on somebody, show what they're being asked to do.
    // Otherwise show the last thing the whole table saw happen — including
    // actions that resolve instantly (armed / disarmed / drunk), which would
    // otherwise flash past with nothing on screen.
    return this.pendingSpotlight() ?? this.lastPublic;
  }

  private gateInfo() {
    if (!this.gate) return null;
    const idx = this.gate.step === 'move' ? 0 : this.gate.step === 'mapAction' ? 1 : 2;
    const m = MOVEMENT_STEPS[idx];
    return { step: this.gate.step, roman: m.symbol, title: m.title, text: m.text };
  }

  // Metadata for the action we are currently waiting on, so the spotlight shows
  // that action's own symbol and title rather than borrowing the previous one's.
  private pendingSpotlight(): Spotlight | null {
    const p = this.pending;
    if (!p) return null;
    const who = this.seat(p.seatId)?.name ?? '';
    const M: Record<string, { kind: string; entry: Entry; text: string }> = {
      mapCabinPick:   { kind: 'cabinSearch',   entry: MAP_ACTIONS.cabinSearch,     text: `${who} is choosing a cabin to search` },
      cabinResult:    { kind: 'cabinSearch',   entry: MAP_ACTIONS.cabinSearch,     text: `${who} is inspecting a seabag` },
      mapFlogPick:    { kind: 'flogging',      entry: MAP_ACTIONS.flogging,        text: `${who} is choosing who to flog` },
      mapTonguePick:  { kind: 'offWithTongue', entry: MAP_ACTIONS.offWithTongue,   text: `${who} is choosing whose tongue to take` },
      mapFeedPick:    { kind: 'feedTheKraken', entry: MAP_ACTIONS.feedTheKraken,   text: `${who} is choosing who to feed to the Kraken` },
      mermaidPick:    { kind: 'mermaid',       entry: NAV_ACTIONS.mermaid,         text: `${who} is choosing who consults the mermaid` },
      mermaidView:    { kind: 'mermaid',       entry: NAV_ACTIONS.mermaid,         text: `${who} is consulting the mermaid` },
      telescopePick:  { kind: 'telescope',     entry: NAV_ACTIONS.telescope,       text: `${who} is choosing who looks through the telescope` },
      telescopeView:  { kind: 'telescope',     entry: NAV_ACTIONS.telescope,       text: `${who} is looking through the telescope` },
      cultConvert:    { kind: 'cultRitual',    entry: CULT_RITUALS.conversion,     text: 'The cult leader is choosing a convert' },
      cultGuns:       { kind: 'cultRitual',    entry: CULT_RITUALS.gunsStash,      text: 'The cult leader is distributing guns' },
      cultCabin:      { kind: 'cultRitual',    entry: CULT_RITUALS.cultCabinSearch, text: 'The cult leader is reading the navigation team' },
      emergencyNav:   { kind: 'emergencyNav',  entry: { symbol: '🏊', title: 'Emergency navigation', text: '' },
                        text: `${who} is designating an emergency navigator` },
    };
    const m = M[p.type];
    if (!m) return null;
    return { kind: m.kind, symbol: m.entry.symbol, title: m.entry.title, text: m.text, waiting: true };
  }

  viewForTable(): TableView {
    const secret = this.gunsAreSecret();
    return {
      surface: 'table', roomCode: this.roomCode, phase: this.phase, round: this.round,
      mapId: this.mapId, players: this.players,
      seats: this.seats.map(s => this.publicSeat(s, secret)),
      supplyPool: this.supplyPool, drawPileCount: this.drawPile.length, shipSpace: this.shipSpace,
      mutinyProgress: this.phase === 'mutiny' && !this.mutinyResolved
        ? {
            locked: this.mutinyEligible().filter(s => this.mutinyCommits.has(s.id)).length,
            total: this.mutinyEligible().filter(s => s.connected || this.mutinyCommits.has(s.id)).length,
          }
        : undefined,
      mutinyResult: this.mutinyResolved ? this.mutinyResult : undefined,
      navigationSilent: this.phase === 'navigation',
      navStep: this.nav?.step,
      emergency: this.nav?.emergency,
      revealedNavCard: this.revealedCard ? { direction: this.revealedCard.direction, action: this.revealedCard.action } : null,
      cultRitualType: this.phase === 'cultRitual' ? this.cultRitualType : null,
      spotlight: this.spotlight(),
      gate: this.gateInfo(),
      log: this.log.slice(-40),
      ended: this._ended,
    };
  }

  viewForPlayer(seatId: string): PlayerView | null {
    const s = this.seat(seatId);
    if (!s) return null;
    let teammates: { seatId: string; name: string }[] | undefined;
    if (this.phase === 'pirateGathering' && s.faction === 'pirate')
      teammates = this.seats.filter(x => x.faction === 'pirate').map(x => ({ seatId: x.id, name: x.name }));
    // A converted cultist knows their master; the leader knows who they converted.
    const leader = this.seats.find(x => x.faction === 'cultLeader');
    const cultLeaderName = s.faction === 'cultist' && s.knowsCultLeader ? leader?.name : undefined;
    const myConverts = s.faction === 'cultLeader'
      ? this.seats.filter(x => x.faction === 'cultist' && x.knowsCultLeader).map(x => x.name)
      : undefined;
    return {
      surface: 'player', roomCode: this.roomCode, seatId: s.id, name: s.name,
      faction: this.phase === 'lobby' ? null : s.faction,
      guns: s.guns, isCaptain: s.isCaptain, badge: s.badge, offDuty: s.offDuty, eliminated: s.eliminated,
      phase: this.phase, round: this.round, prompt: this.promptFor(s), teammates,
      cultLeaderName, myConverts,
    };
  }

  // The three players who carried out the current navigation, de-duplicated —
  // p.14's Cult Cabin Search shows the captain, lieutenant and navigator.
  private navigationTeam(): Seat[] {
    const ids = [
      this.teamCaptainId ?? this.captain()?.id,
      this.teamLieutenantId,
      this.teamNavigatorId,
    ];
    const out: Seat[] = [];
    for (const id of ids) {
      if (!id) continue;
      const st = this.seat(id);
      if (st && !out.includes(st)) out.push(st);
    }
    return out;
  }

  private otherSeats(excludeSelf: Seat, opts?: { noEliminated?: boolean }) {
    return this.seats
      .filter(x => x.id !== excludeSelf.id && (!opts?.noEliminated || !x.eliminated))
      .map(x => ({ seatId: x.id, name: x.name }));
  }

  private promptFor(s: Seat): PlayerPrompt {
    if (s.eliminated) return { kind: 'eliminated' };
    // pending targeted prompts take priority
    if (this.pending && this.pending.seatId === s.id) {
      const p = this.pending;
      switch (p.type) {
        case 'mapCabinPick': return { kind: 'chooseTarget', title: 'Cabin search — choose a player', data: { action: 'cabinSearch', targets: this.otherSeats(s, { noEliminated: true }) } };
        case 'cabinResult': return { kind: 'cabinResult', title: 'Cabin search result', data: p.data };
        case 'mapFlogPick': return { kind: 'chooseTarget', title: 'Flogging — choose a player', data: { action: 'flogging', targets: this.otherSeats(s, { noEliminated: true }) } };
        case 'mapTonguePick': return { kind: 'chooseTarget', title: 'Off with the tongue — choose a player', data: { action: 'offWithTongue', targets: this.otherSeats(s, { noEliminated: true }) } };
        case 'mapFeedPick': return { kind: 'chooseTarget', title: 'Feed the Kraken — choose a player', data: { action: 'feedTheKraken', targets: this.otherSeats(s, { noEliminated: true }) } };
        case 'mermaidPick': return { kind: 'chooseTarget', title: 'Mermaid — choose a player', data: { action: 'mermaid', targets: this.otherSeats(s, { noEliminated: true }) } };
        case 'mermaidView': return { kind: 'mermaidView', title: 'The mermaid shows the last discards', data: p.data };
        case 'telescopePick': return { kind: 'chooseTarget', title: 'Telescope — choose a player', data: { action: 'telescope', targets: this.otherSeats(s, { noEliminated: true }) } };
        case 'telescopeView': return { kind: 'telescopeView', title: 'Top of the draw pile', data: p.data };
        case 'cultConvert': {
          const convertible = this.seats.filter(x => !x.eliminated && !x.examined && x.faction !== 'cultist' && x.faction !== 'cultLeader').map(x => ({ seatId: x.id, name: x.name }));
          return { kind: 'cultConvert', title: 'Conversion — choose a convertible player', data: { targets: convertible } };
        }
        case 'cultGuns': return { kind: 'cultGuns', title: 'Distribute guns from the stash', data: { remaining: (p.data?.remaining ?? 0), targets: this.activePlayers().map(x => ({ seatId: x.id, name: x.name })) } };
        case 'cultCabin': {
          const team = this.navigationTeam().map(x => ({ name: x.name, faction: x.faction }));
          return { kind: 'cultCabin', title: 'The navigation team\'s factions', data: { team } };
        }
        case 'emergencyNav': return { kind: 'chooseTarget', title: 'Designate an emergency navigator', data: { action: 'emergencyNav', targets: this.emergencyNavCandidates().map(x => ({ seatId: x.id, name: x.name })) } };
      }
    }
    switch (this.phase) {
      case 'lobby': return { kind: 'lobby' };
      case 'pirateGathering':
        if (s.faction === 'pirate') return this.gatheringAcks.has(s.id)
          ? { kind: 'idle', title: 'Waiting for the other pirates…' }
          : { kind: 'pirateGathering' };
        return { kind: 'idle', title: 'Close your eyes — the pirates are meeting.' };
      case 'appoint':
        if (s.isCaptain) return { kind: 'appoint', title: 'Appoint your navigation team', data: { eligible: this.eligibleForTeam().map(x => ({ seatId: x.id, name: x.name })) } };
        return { kind: 'idle', title: 'The captain is choosing a team.' };
      case 'mutiny':
        if (this.mutinyResolved) {
          const r = this.mutinyResult!;
          return { kind: 'mutinyResult', title: r.success ? 'Mutiny succeeded' : 'No mutiny',
            data: { success: r.success, sum: r.sum, threshold: r.threshold, canContinue: s.isCaptain } };
        }
        if (s.isCaptain) return { kind: 'idle', title: '"Show me your loyalty!" — waiting for the crew.' };
        return { kind: 'lockGuns', title: 'Commit your guns', data: { maxGuns: s.guns, threshold: mutinyThreshold(this.players), locked: this.mutinyCommits.has(s.id), committed: this.mutinyCommits.get(s.id) ?? 0 } };
      case 'mutinyTieResolution':
        if (this.tiePicker === s.id) return { kind: 'tieResolution', title: 'Break the tie — choose who lowers their hand', data: { tied: this.tieCandidates.map(id => ({ seatId: id, name: this.seat(id)?.name })) } };
        return { kind: 'idle', title: `${this.seat(this.tiePicker ?? '')?.name ?? 'The captain'} is breaking the tie.` };
      case 'navigation': {
        const n = this.nav;
        if (n) {
          if (n.step === 'captainDiscard' && s.isCaptain)
            return { kind: 'navDiscard', title: 'Discard one card (keep the other)', data: { cards: n.captainCards.map(c => ({ id: c.id, direction: c.direction, action: c.action })) } };
          if (n.step === 'lieutenantDiscard' && n.lieutenantId === s.id)
            return { kind: 'navDiscard', title: 'Discard one card (keep the other)', data: { cards: n.lieutenantCards.map(c => ({ id: c.id, direction: c.direction, action: c.action })) } };
          if (n.step === 'navigatorChoose' && n.navigatorId === s.id)
            return { kind: 'navChoose', title: 'Keep one card — or deny command', data: { cards: n.logbook.map(c => ({ id: c.id, direction: c.direction, action: c.action })) } };
        }
        return { kind: 'idle', title: 'Silence at the helm — the team is navigating.' };
      }
      case 'emergencyNavigation':
        return { kind: 'idle', title: 'The captain is choosing an emergency navigator.' };
      case 'execute':
      case 'cultRitual':
        return { kind: 'idle', title: 'Resolving the navigation…' };
      case 'offDuty':
        return { kind: 'idle', title: 'Off-duty signs handed out.' };
      default: return { kind: 'idle' };
    }
  }

  viewForHost(): HostView {
    return {
      surface: 'host', roomCode: this.roomCode, phase: this.phase, round: this.round,
      captainSeatId: this.captain()?.id ?? null,
      seats: this.seats.map(s => this.publicSeat(s, false)),
      connected: this.seats.map(s => ({ seatId: s.id, name: s.name, connected: s.connected })),
      canUndo: this.canUndo(), log: this.log.slice(-60),
    };
  }
}
