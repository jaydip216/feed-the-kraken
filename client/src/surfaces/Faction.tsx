import type { Faction } from '@ftk/shared';

const LABEL: Record<Faction, string> = {
  sailor: 'Sailor', pirate: 'Pirate', cultLeader: 'Cult Leader', cultist: 'Cultist',
};
const WIN: Record<Faction, string> = {
  sailor: 'Win by reaching Bluewater Bay (east)',
  pirate: 'Win by reaching Crimson Cove (west)',
  cultLeader: 'Win at the Kraken (north) or by being fed to it',
  cultist: 'Win with the Cult Leader',
};

export function FactionChip({ f }: { f: Faction }) {
  return <span className={`pill faction-${f}`}>⚓ {LABEL[f]}</span>;
}
export function factionWin(f: Faction) { return WIN[f]; }
