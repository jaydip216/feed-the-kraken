// Rulebook constants and tables encoded as DATA (single source of truth: the PDF).
import type { Direction, NavAction, MapId } from './types.js';

export const TOTAL_GUNS = 40;
export const STARTING_GUNS_PER_PLAYER = 3;
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 11;

// Team composition overview (rulebook p.5/7). 5-player is a special variant.
// For 5 players the bag set is {3 sailor, 2 pirate}, one bag removed at random,
// then the cult leader bag added — so it resolves to either 3S/1P/1C or 2S/2P/1C.
export interface Composition { sailor: number; pirate: number; cultLeader: number; cultist: number; }

export const TEAM_COMPOSITION: Record<number, Composition> = {
  6:  { sailor: 3, pirate: 2, cultLeader: 1, cultist: 0 },
  7:  { sailor: 4, pirate: 2, cultLeader: 1, cultist: 0 },
  8:  { sailor: 4, pirate: 3, cultLeader: 1, cultist: 0 },
  9:  { sailor: 5, pirate: 3, cultLeader: 1, cultist: 0 },
  10: { sailor: 5, pirate: 4, cultLeader: 1, cultist: 0 },
  11: { sailor: 5, pirate: 4, cultLeader: 1, cultist: 1 },
};

// Required sum of guns for a successful mutiny (rulebook p.9).
export function mutinyThreshold(players: number): number {
  if (players <= 7) return 3;
  if (players <= 9) return 4;
  return 5;
}

// Off-duty signs by player count (rulebook p.11).
export function offDutySignCount(players: number): number {
  if (players <= 6) return 1;
  if (players <= 8) return 2;
  return 3;
}

// Which roles receive an off-duty sign after navigation (rulebook p.11).
export function offDutyRecipients(players: number): ('captain' | 'lieutenant' | 'navigator')[] {
  if (players <= 6) return ['navigator'];
  if (players <= 8) return ['lieutenant', 'navigator'];
  return ['captain', 'lieutenant', 'navigator'];
}

// Navigation deck composition (rulebook p.6).
export interface DeckSpec { direction: Direction; action: NavAction; count: number; }

// The full 23-card navigation deck printed on the board's Navigation Codes panel.
export const DECKS: Record<MapId, DeckSpec[]> = {
  standard: [
    { direction: 'north', action: 'cultUprising', count: 6 },
    { direction: 'east',  action: 'drunk',        count: 4 },
    { direction: 'east',  action: 'disarmed',     count: 2 },
    { direction: 'west',  action: 'drunk',        count: 5 },
    { direction: 'west',  action: 'mermaid',      count: 2 },
    { direction: 'west',  action: 'telescope',    count: 2 },
    { direction: 'west',  action: 'armed',        count: 2 },
  ], // 23 cards
};

export const RESHUFFLE_THRESHOLD = 4; // reshuffle if fewer than 4 cards before navigation

export function mapForPlayers(_players: number): MapId {
  return 'standard';
}
