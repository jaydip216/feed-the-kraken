// Single source of truth for every symbol and rules explanation in the app.
// Used by the phone cards, the table view and the gameplay guide, so the wording
// a player reads mid-game is exactly the wording the tutorial taught them.
import type { Faction, Direction, NavAction, MapActionIcon, CultRitual } from './types.js';

export interface Entry { symbol: string; title: string; text: string; }

export const FACTIONS: Record<Faction, Entry & { color: string; win: string }> = {
  sailor: {
    symbol: '⚓', title: 'Sailor', color: '#2f7fd0',
    win: 'Reach Bluewater Bay in the east',
    text: 'Honest crew. Steer the ship east and work out who is lying. There is no reason for you to pretend to be a Pirate.',
  },
  pirate: {
    symbol: '☠️', title: 'Pirate', color: '#c0392b',
    win: 'Reach Crimson Cove in the west',
    text: 'Argue and behave like a Sailor, but steer west at the moments that matter. Staying passive is not enough — you must actively push the ship.',
  },
  cultLeader: {
    symbol: '🐙', title: 'Cult Leader', color: '#c8a11e',
    win: 'Reach the Kraken in the north, or be fed to the Kraken',
    text: 'Balance the ship toward the middle so you can reach either the Kraken or a Feed the Kraken space. Yellow cards let you convert others to your Cult.',
  },
  cultist: {
    symbol: '🦑', title: 'Cultist', color: '#4a9e5e',
    win: 'Win together with the Cult Leader',
    text: 'You serve the Cult now and no longer win with your old team. If you were converted mid-game you know your master; a Cultist dealt at setup does not.',
  },
};

export const DIRECTIONS: Record<Direction, { symbol: string; label: string; dest: string; color: string }> = {
  north: { symbol: '⬆', label: 'North', dest: 'The Kraken', color: '#c8a11e' },
  east:  { symbol: '↗', label: 'East',  dest: 'Bluewater Bay', color: '#2f7fd0' },
  west:  { symbol: '↖', label: 'West',  dest: 'Crimson Cove', color: '#c0392b' },
};

export const NAV_ACTIONS: Record<NavAction, Entry> = {
  drunk: {
    symbol: '🍾', title: 'Drunk',
    text: 'The captain loses their position. The captaincy moves clockwise to the next player who has the fewest navigation cards in front of them.',
  },
  mermaid: {
    symbol: '🧜', title: 'Mermaid',
    text: 'The captain chooses another player. That player secretly looks at the last three cards discarded into the Deep Sea. They may talk about what they saw — truthfully or not.',
  },
  telescope: {
    symbol: '🔭', title: 'Telescope',
    text: 'The captain chooses another player. That player looks at the top card of the draw pile and either leaves it there or discards it into the Deep Sea.',
  },
  armed: {
    symbol: '➕', title: 'Armed',
    text: 'The navigator receives 1 gun from the general supply. (Long Journey only.)',
  },
  disarmed: {
    symbol: '➖', title: 'Disarmed',
    text: 'The navigator must discard 1 gun from their personal supply, if they have any.',
  },
  cultUprising: {
    symbol: '🕯️', title: 'Cult Uprising',
    text: 'A cult ritual is carried out at the end of the navigation. The captain reveals a random face-down cult ritual card.',
  },
};

export const MAP_ACTIONS: Record<MapActionIcon, Entry> = {
  cabinSearch: {
    symbol: '🔍', title: 'Cabin Search',
    text: 'The captain chooses another player and secretly inspects their seabag, learning their true faction. The captain may talk about what they found — but they might be lying. A searched player can never be converted to the Cult.',
  },
  flogging: {
    symbol: '🪢', title: 'Flogging',
    text: 'The captain chooses another player. That player is publicly revealed NOT to belong to one faction. This information is public and stays in front of them for the rest of the game. A flogged player can never be converted to the Cult.',
  },
  offWithTongue: {
    symbol: '🗡️', title: 'Off with the Tongue',
    text: 'The captain chooses another player, who may no longer speak words and can never become captain. They still take part in mutinies, but their guns count as 0 when deciding the next captain.',
  },
  feedTheKraken: {
    symbol: '🐙', title: 'Feed the Kraken',
    text: 'The captain chooses another player, who is immediately eliminated and must stay silent. If the Cult Leader is fed to the Kraken, the Cult wins the game instantly.',
  },
};

export const CULT_RITUALS: Record<CultRitual, Entry> = {
  conversion: {
    symbol: '🦑', title: 'Conversion to Cult',
    text: 'The Cult Leader secretly turns one convertible player into a Cultist. That player now wins only with the Cult. Players already examined by a Cabin Search or a Flogging cannot be converted.',
  },
  gunsStash: {
    symbol: '🔫', title: "The Cult's Guns Stash",
    text: 'The Cult Leader secretly hands out three guns from the general supply to any players they choose — possibly including themselves.',
  },
  cultCabinSearch: {
    symbol: '🔎', title: 'Cult Cabin Search',
    text: 'The Cult Leader secretly learns the factions of the current captain, lieutenant and navigator.',
  },
};

export const SYMBOLS = {
  gun: '🔫', captain: '🎖️', lieutenant: '🧭', navigator: '🗺️', offDuty: '💤',
  resume: '📜', supply: '📦', kraken: '🐙', ship: '⛵', silence: '🤫',
  eliminated: '💀', tongue: '🚫', seabag: '🎒', logbook: '📕', deepSea: '🌊',
};

// The three resolution steps printed on the physical board.
export const MOVEMENT_STEPS: Entry[] = [
  { symbol: 'I', title: 'Move the ship', text: 'Move the ship one space in the direction of the revealed card.' },
  { symbol: 'II', title: 'Map action', text: 'If the space the ship moved to shows an icon, carry out that map action.' },
  { symbol: 'III', title: 'Card action', text: 'Finally, carry out the action printed on the navigation card itself.' },
];

export interface Tip { faction: Faction | 'all'; text: string; }

export const TIPS: Tip[] = [
  { faction: 'all', text: 'Talk. Staying quiet reveals nothing, but it also wins nothing — the game is decided by what the crew believes.' },
  { faction: 'all', text: 'Discussing the cards you drew and discarded is the heart of the game. Shy players should be encouraged to talk.' },
  { faction: 'all', text: 'Watch the résumés. The face-up cards in front of each captain are a permanent public record of where the ship went on their watch.' },
  { faction: 'pirate', text: 'Bluff as a Sailor early by picking blue cards, but do not be afraid to burn your cover when it counts.' },
  { faction: 'pirate', text: 'Collaborate with the Cult to drag the ship west. Passive Pirates lose.' },
  { faction: 'sailor', text: 'Stick to the truth and find your allies. If you tell a tricky lie to expose someone, explain it quickly or it will be your undoing.' },
  { faction: 'cultLeader', text: 'Keep the ship near the middle so both the Kraken and the Feed the Kraken spaces stay in reach.' },
  { faction: 'cultLeader', text: 'Convert players who are trusted and still hold guns — then sow distrust about anyone dangerous to you.' },
  { faction: 'cultist', text: 'Being fed to the Kraken is a win for your team if it is the Cult Leader who goes overboard — protect them accordingly.' },
];
