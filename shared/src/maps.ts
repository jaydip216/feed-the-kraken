// The game board: a true flat-top hex lattice, every space edge-to-edge with its
// neighbours, no gaps — laid out to the layer counts on the printed map.
//
// A LAYER is the zig-zag band the eye reads across the board. Because flat-top
// hexes interlock, one band spans two half-levels: the lower level carries the
// odd columns, the upper level the even ones. That is what makes the counts come
// out 1 / 3 / 3 / 5 / 5 / 7 / 7, thirty-one spaces in all:
//
//   layer 6   25  26  27  28  29  30  31     Crimson Cove 25-27 | Kraken 28 | Bluewater 29-31
//   layer 5   18  19  20  21  22  23  24     feed the kraken on 20, 21, 22
//   layer 4       13  14  15  16  17         flogging on 14 and 16
//   layer 3        8   9  10  11  12         cabin search on 8, off with the tongue on 10
//   layer 2            5   6   7             cabin search on 5, 6, 7
//   layer 1            2   3   4
//   layer 0                1                 the start, on the southern shore
//
// Coordinates are (col, level): x = col·1.5·s, y = -level·(√3/2)·s, and a space
// exists only where (col + level) is even — the standard flat-top packing. The
// three exits are the three upward edges: north (col, level+2), west
// (col-1, level+1), east (col+1, level+1). Arrows are DERIVED from that same
// movement function, so the drawing can never disagree with the rules.
import type { MapId, MapActionIcon, Direction, Faction } from './types.js';

export type VictoryKind = 'cult' | 'pirate' | 'sailor';

export const VICTORY_LABEL: Record<VictoryKind, string> = {
  cult: 'The Kraken', pirate: 'Crimson Cove', sailor: 'Bluewater Bay',
};
export const VICTORY_BANNER: Record<VictoryKind, string> = {
  cult: 'CULT VICTORY', pirate: 'PIRATE VICTORY', sailor: 'SAILOR VICTORY',
};

export interface Hex {
  id: string;              // the printed space number
  n: number;
  col: number;
  level: number;           // half-row; two levels make one visible layer
  layer: number;
  icon?: MapActionIcon;
  victory?: VictoryKind;
  start?: boolean;
  beyondSupplyLine?: boolean;
}

export interface MapDef {
  id: MapId;
  levels: number;
  layers: number[][];      // space numbers per layer, south to north
  hexes: Hex[];
  startId: string;
  supplyLineLayer: number;
}

export const HEX_COORDS: Record<number, { col: number; level: number; layer: number }> = {
  1:  { col:  0, level:  0, layer: 0 },
  2:  { col: -1, level:  1, layer: 1 },
  3:  { col:  0, level:  2, layer: 1 },
  4:  { col:  1, level:  1, layer: 1 },
  5:  { col: -1, level:  3, layer: 2 },
  6:  { col:  0, level:  4, layer: 2 },
  7:  { col:  1, level:  3, layer: 2 },
  8:  { col: -2, level:  4, layer: 3 },
  9:  { col: -1, level:  5, layer: 3 },
  10: { col:  0, level:  6, layer: 3 },
  11: { col:  1, level:  5, layer: 3 },
  12: { col:  2, level:  4, layer: 3 },
  13: { col: -2, level:  6, layer: 4 },
  14: { col: -1, level:  7, layer: 4 },
  15: { col:  0, level:  8, layer: 4 },
  16: { col:  1, level:  7, layer: 4 },
  17: { col:  2, level:  6, layer: 4 },
  18: { col: -3, level:  7, layer: 5 },
  19: { col: -2, level:  8, layer: 5 },
  20: { col: -1, level:  9, layer: 5 },
  21: { col:  0, level: 10, layer: 5 },
  22: { col:  1, level:  9, layer: 5 },
  23: { col:  2, level:  8, layer: 5 },
  24: { col:  3, level:  7, layer: 5 },
  25: { col: -3, level:  9, layer: 6 },
  26: { col: -2, level: 10, layer: 6 },
  27: { col: -1, level: 11, layer: 6 },
  28: { col:  0, level: 12, layer: 6 },
  29: { col:  1, level: 11, layer: 6 },
  30: { col:  2, level: 10, layer: 6 },
  31: { col:  3, level:  9, layer: 6 },
};

const ICONS: Record<number, MapActionIcon> = {
  5: 'cabinSearch', 6: 'cabinSearch', 7: 'cabinSearch', 8: 'cabinSearch',
  10: 'offWithTongue',
  14: 'flogging', 16: 'flogging',
  20: 'feedTheKraken', 21: 'feedTheKraken', 22: 'feedTheKraken',
};
const VICTORY: Record<number, VictoryKind> = {
  25: 'pirate', 26: 'pirate', 27: 'pirate',
  28: 'cult',
  29: 'sailor', 30: 'sailor', 31: 'sailor',
};
// The supply line follows the upper edges of layer 3, not a horizontal level.
const SUPPLY_LINE_LAYER = 4;

function buildMap(): MapDef {
  const hexes: Hex[] = [];
  const layers: number[][] = [
    [1],
    [2, 3, 4],
    [5, 6, 7],
    [8, 9, 10, 11, 12],
    [13, 14, 15, 16, 17],
    [18, 19, 20, 21, 22, 23, 24],
    [25, 26, 27, 28, 29, 30, 31],
  ];

  for (let n = 1; n <= 31; n++) {
    const coord = HEX_COORDS[n];
    hexes.push({
      id: String(n),
      n,
      col: coord.col,
      level: coord.level,
      layer: coord.layer,
      icon: ICONS[n],
      victory: VICTORY[n],
      start: n === 1,
      beyondSupplyLine: coord.layer >= SUPPLY_LINE_LAYER,
    });
  }

  const levels = Math.max(...hexes.map(h => h.level));
  return { id: 'standard', levels, layers, hexes, startId: '1', supplyLineLayer: SUPPLY_LINE_LAYER };
}

export const THE_MAP: MapDef = buildMap();
export const MAPS: Record<MapId, MapDef> = { standard: THE_MAP };

export function getHex(map: MapDef, id: string): Hex | undefined {
  return map.hexes.find(h => h.id === id);
}
export function hexAt(map: MapDef, col: number, level: number): Hex | undefined {
  return map.hexes.find(h => h.col === col && h.level === level);
}
export function seaHexes(map: MapDef): Hex[] { return map.hexes.filter(h => !h.victory); }
export function victoryHexes(map: MapDef): Hex[] { return map.hexes.filter(h => !!h.victory); }

export type MoveTarget = { kind: 'hex'; id: string };

export const BOARD_MOVES: Record<number, Record<Direction, number>> = {
  1:  { west: 2,  north: 3,  east: 4 },
  2:  { west: 5,  north: 5,  east: 3 },
  3:  { west: 5,  north: 6,  east: 7 },
  4:  { west: 3,  north: 7,  east: 7 },
  5:  { west: 8,  north: 9,  east: 6 },
  6:  { west: 9,  north: 9, east: 11 },
  7:  { west: 6, north: 11, east: 12 },
  8:  { west: 13, north: 13, east: 9 },
  9:  { west: 13, north: 14, east: 10 },
  10: { west: 14, north: 15, east: 16 },
  11: { west: 10, north: 16, east: 17 },
  12: { west: 11, north: 17, east: 17 },
  13: { west: 18, north: 19, east: 14 },
  14: { west: 19, north: 20, east: 15 },
  15: { west: 20, north: 21, east: 22 },
  16: { west: 15, north: 22, east: 23 },
  17: { west: 16, north: 23, east: 24 },
  18: { west: 25, north: 19, east: 19 },
  19: { west: 26, north: 20, east: 20 },
  20: { west: 26, north: 27, east: 21 },
  21: { west: 27, north: 28, east: 29 },
  22: { west: 21, north: 29, east: 30 },
  23: { west: 22, north: 22, east: 30 },
  24: { west: 23, north: 23, east: 31 },
};

// Movement lookup directly follows the official board arrows and navigation tracks.
export function move(map: MapDef, fromId: string, dir: Direction): MoveTarget {
  const n = Number(fromId);
  const next = BOARD_MOVES[n]?.[dir];
  if (next) return { kind: 'hex', id: String(next) };
  return { kind: 'hex', id: fromId };
}

export function exitsOf(map: MapDef, id: string): Record<Direction, MoveTarget> {
  return { north: move(map, id, 'north'), west: move(map, id, 'west'), east: move(map, id, 'east') };
}
export function victoryAt(map: MapDef, id: string | null): VictoryKind | undefined {
  return id ? getHex(map, id)?.victory : undefined;
}
export function victoryFaction(v: VictoryKind): Faction[] {
  return v === 'cult' ? ['cultLeader', 'cultist'] : [v];
}

// ---- rendering geometry: flat-top, perfectly packed ----
export function hexPixel(col: number, level: number, size: number) {
  return { x: col * 1.5 * size, y: -level * (Math.sqrt(3) / 2) * size };
}
export function mapBounds(map: MapDef, size: number) {
  const pts = map.hexes.map(h => hexPixel(h.col, h.level, size));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs) - size, maxX = Math.max(...xs) + size;
  const minY = Math.min(...ys) - size * 0.9, maxY = Math.max(...ys) + size * 0.9;
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
