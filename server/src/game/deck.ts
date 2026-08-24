// Navigation draw/discard piles. Résumé cards are never in these piles —
// once a card becomes a captain's résumé it is out of circulation for good.
import type { NavCard, MapId } from '@ftk/shared';
import { DECKS, RESHUFFLE_THRESHOLD } from '@ftk/shared';
import { nanoid } from 'nanoid';

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDrawPile(mapId: MapId): NavCard[] {
  const cards: NavCard[] = [];
  for (const spec of DECKS[mapId]) {
    for (let i = 0; i < spec.count; i++) {
      cards.push({ id: nanoid(6), direction: spec.direction, action: spec.action });
    }
  }
  return shuffle(cards);
}

export { RESHUFFLE_THRESHOLD };
