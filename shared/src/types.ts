// Domain types shared between server and clients.
// NOTE: the server is authoritative. Full types below describe SERVER state.
// Clients only ever receive the redacted view models at the bottom of this file.

export type Faction = 'sailor' | 'pirate' | 'cultLeader' | 'cultist';

// One board, matching the printed map.
export type MapId = 'standard';

export type Badge = 'lieutenant' | 'navigator';

// Compass direction of a navigation card / ship move.
export type Direction = 'north' | 'east' | 'west';

// Navigation card action symbols (rulebook: Navigation Card Actions).
export type NavAction =
  | 'drunk'
  | 'mermaid'
  | 'telescope'
  | 'armed'
  | 'disarmed'
  | 'cultUprising';

export interface NavCard {
  id: string;
  direction: Direction;
  action: NavAction;
}

// Map-space icons (rulebook: Map Actions). Resolved after the ship moves.
export type MapActionIcon =
  | 'cabinSearch'
  | 'flogging'
  | 'offWithTongue'
  | 'feedTheKraken';

// Cult ritual card types (rulebook: Cult Ritual Cards).
export type CultRitual = 'gunsStash' | 'cultCabinSearch' | 'conversion';

export type Phase =
  | 'lobby'
  | 'setup'
  | 'pirateGathering'
  | 'appoint'
  | 'mutiny'
  | 'mutinyTieResolution'
  | 'navigation'
  | 'emergencyNavigation'
  | 'execute'
  | 'cultRitual'
  | 'offDuty'
  | 'ended';

export interface Seat {
  id: string;              // stable seat id
  reconnectToken: string;  // secret, stored in the player's localStorage
  name: string;
  order: number;           // physical seating order, 0-based, clockwise
  connected: boolean;
  faction: Faction;
  guns: number;            // personal gun supply (public outside mutinies)
  isCaptain: boolean;
  badge?: Badge;
  offDuty: boolean;
  eliminated: boolean;     // fed to the kraken / jumped overboard
  hasTongue: boolean;      // false after "off with the tongue"
  examined: boolean;       // cabin-searched or flogged => unconvertible
  flogged?: Faction;       // public "is NOT this faction" result from flogging
  // Rulebook p.15: a CONVERTED cultist opens their eyes and "recognises their new
  // master", so they learn who the Cult Leader is. A cultist dealt at setup in an
  // 11-player game (p.8) does not — hence this is a flag, not a derived value.
  knowsCultLeader?: boolean;
  resume: Direction[];     // face-up navigation cards; never reshuffled
}

export type SurfaceRole = 'table' | 'player' | 'host';

// ---- Client -> Server events ----
export interface ClientEvents {
  createRoom: (p: { mapId?: MapId }, cb: (r: { roomCode: string }) => void) => void;
  joinRoom: (
    p: { roomCode: string; name: string; reconnectToken?: string },
    cb: (r: { ok: boolean; seatId?: string; reconnectToken?: string; error?: string }) => void
  ) => void;
  attachTable: (p: { roomCode: string }, cb: (r: { ok: boolean; error?: string }) => void) => void;
  attachHost: (p: { roomCode: string }, cb: (r: { ok: boolean; error?: string }) => void) => void;

  setSeatingOrder: (p: { roomCode: string; seatIdsInOrder: string[] }) => void;
  startGame: (p: { roomCode: string }) => void;

  ackPirateGathering: (p: { roomCode: string }) => void;
  // generic action envelope for phase actions (appoint, lockGuns, etc.)
  action: (p: { roomCode: string; type: string; payload?: any }) => void;

  // host escape hatches
  hostUndo: (p: { roomCode: string }) => void;
  hostForceAdvance: (p: { roomCode: string }) => void;
}

// ---- Server -> Client events ----
export interface ServerEvents {
  // each client receives only the view its seat/surface is entitled to
  view: (v: TableView | PlayerView | HostView) => void;
  toast: (m: { kind: 'info' | 'warn' | 'error'; text: string }) => void;
}

// ================= REDACTED VIEW MODELS (what clients render) =================

export interface PublicSeat {
  id: string;
  name: string;
  order: number;
  connected: boolean;
  guns: number | null;   // null while secret (during a mutiny)
  isCaptain: boolean;
  badge?: Badge;
  offDuty: boolean;
  eliminated: boolean;
  hasTongue: boolean;
  resume: Direction[];
  flogged?: Faction;     // public "is not a ___" info from flogging
}

export interface LogEntry { t: number; text: string; }

export interface Spotlight {
  kind: string;        // 'cabinSearch' | 'mermaid' | 'cultRitual' | ...
  symbol: string;
  title: string;
  text: string;        // public sentence, e.g. "Ada is searching Kel's cabin"
  result?: string;     // public outcome, e.g. "Kel is NOT a Pirate"
  waiting?: boolean;   // true while we are still waiting on that player
}

export interface TableView {
  surface: 'table';
  roomCode: string;
  phase: Phase;
  round: number;
  mapId: MapId;
  players: number;
  seats: PublicSeat[];
  supplyPool: number;
  drawPileCount: number;
  shipSpace: string | null;
  mutinyProgress?: { locked: number; total: number }; // never partial counts
  mutinyResult?: { counts: Record<string, number>; sum: number; threshold: number; success: boolean };
  navigationSilent?: boolean;
  navStep?: string;                 // which sub-step of navigation we're in
  emergency?: boolean;              // emergency navigation in progress
  revealedNavCard?: { direction: Direction; action: NavAction } | null;
  cultRitualType?: CultRitual | null;
  // What the whole table can see happening right now. Captain actions happen in
  // the open at a real table, so they are announced here — but only the PUBLIC
  // half (who acted on whom); secret results never reach this payload.
  spotlight?: Spotlight | null;
  // The "Movement Steps I / II / III" gate printed on the board. When set, the
  // table is waiting for someone to press the button to resolve this step.
  gate?: { step: 'move' | 'mapAction' | 'cardAction'; roman: string; title: string; text: string } | null;
  log: LogEntry[];
  ended?: { winners: Faction[]; reason: string; factions: Record<string, Faction> };
}

// A minimal description of what the local player must do right now.
export interface PlayerPrompt {
  kind: string;                 // 'idle' | 'appoint' | 'lockGuns' | 'navDiscard' | ...
  title?: string;
  data?: any;                   // prompt-specific (eligible players, own cards, etc.)
}

export interface PlayerView {
  surface: 'player';
  roomCode: string;
  seatId: string;
  name: string;
  faction: Faction | null;      // your own faction only
  guns: number;
  isCaptain: boolean;
  badge?: Badge;
  offDuty: boolean;
  eliminated: boolean;
  phase: Phase;
  round: number;
  prompt: PlayerPrompt;         // what your phone shows right now
  teammates?: { seatId: string; name: string }[]; // pirate gathering only
  cultLeaderName?: string;      // only for a cultist converted mid-game
  myConverts?: string[];        // only for the cult leader: who they converted
}

export interface HostView {
  surface: 'host';
  roomCode: string;
  phase: Phase;
  round: number;
  captainSeatId: string | null;
  seats: PublicSeat[];
  connected: { seatId: string; name: string; connected: boolean }[];
  canUndo: boolean;
  log: LogEntry[];
}
