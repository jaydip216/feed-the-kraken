// Faction dealing per the rulebook player-count table, including the 5-player variant.
import type { Faction } from '@ftk/shared';
import { TEAM_COMPOSITION } from '@ftk/shared';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns one faction per player (order randomized).
export function dealFactions(players: number): Faction[] {
  if (players === 5) {
    // Build 5 "sailor/pirate" bags: 3 sailor + 2 pirate, remove one at random,
    // then add the cult leader bag => 4 remaining crew bags + 1 cult = 5 players.
    const crew: Faction[] = shuffle<Faction>([
      'sailor', 'sailor', 'sailor', 'pirate', 'pirate',
    ]);
    crew.pop(); // remove one bag without revealing => 3S1P or 2S2P
    const bags: Faction[] = shuffle<Faction>([...crew, 'cultLeader']);
    return bags;
  }
  const comp = TEAM_COMPOSITION[players];
  if (!comp) throw new Error(`unsupported player count: ${players}`);
  const bag: Faction[] = [
    ...Array(comp.sailor).fill('sailor'),
    ...Array(comp.pirate).fill('pirate'),
    ...Array(comp.cultLeader).fill('cultLeader'),
    ...Array(comp.cultist).fill('cultist'),
  ];
  return shuffle(bag);
}
