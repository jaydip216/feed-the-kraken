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
  supplyLineLevel: number;
}

// Each layer: the two half-levels it spans, and how far out its columns reach.
const LAYERS: { levels: number[]; halfWidth: number }[] = [
  { levels: [0], halfWidth: 0 },          // 1
  { levels: [1, 2], halfWidth: 1 },       // 3
  { levels: [3, 4], halfWidth: 1 },       // 3
  { levels: [5, 6], halfWidth: 2 },       // 5
  { levels: [7, 8], halfWidth: 2 },       // 5
  { levels: [9, 10], halfWidth: 3 },      // 7
  { levels: [11, 12], halfWidth: 3 },     // 7
];

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
const SUPPLY_LINE_LEVEL = 7;

function buildMap(): MapDef {
  const hexes: Hex[] = [];
  const layers: number[][] = [];
  let n = 0;
  LAYERS.forEach((spec, layer) => {
    // gather this band's spaces, then number them left to right across the zig-zag
    const band: { col: number; level: number }[] = [];
    for (const level of spec.levels) {
      for (let col = -spec.halfWidth; col <= spec.halfWidth; col++) {
        if ((((col + level) % 2) + 2) % 2 !== 0) continue;   // flat-top packing
        band.push({ col, level });
      }
    }
    band.sort((a, b) => a.col - b.col);
    const nums: number[] = [];
    for (const b of band) {
      n += 1;
      nums.push(n);
      hexes.push({
        id: String(n), n, col: b.col, level: b.level, layer,
        icon: ICONS[n], victory: VICTORY[n],
        start: n === 1,
        beyondSupplyLine: b.level >= SUPPLY_LINE_LEVEL,
      });
    }
    layers.push(nums);
  });
  const levels = Math.max(...hexes.map(h => h.level));
  return { id: 'standard', levels, layers, hexes, startId: '1', supplyLineLevel: SUPPLY_LINE_LEVEL };
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

// The three upward edges of a flat-top space. Where the shore cuts the board off,
// the coast turns the ship to the nearest space on that level.
export function move(map: MapDef, fromId: string, dir: Direction): MoveTarget {
  const from = getHex(map, fromId)!;
  const target = dir === 'north' ? { col: from.col, level: from.level + 2 }
    : dir === 'west' ? { col: from.col - 1, level: from.level + 1 }
    : { col: from.col + 1, level: from.level + 1 };

  const exact = hexAt(map, target.col, target.level);
  if (exact) return { kind: 'hex', id: exact.id };

  const onLevel = map.hexes.filter(h => h.level === target.level);
  if (!onLevel.length) return { kind: 'hex', id: fromId };   // the shore blocks the way
  let best = onLevel[0], bestD = Infinity;
  for (const h of onLevel) {
    const d = Math.abs(h.col - target.col);
    if (d < bestD) { bestD = d; best = h; }
  }
  return { kind: 'hex', id: best.id };
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
