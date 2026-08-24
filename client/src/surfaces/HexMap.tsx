import type { Direction } from '@ftk/shared';
import {
  THE_MAP, hexPixel, mapBounds, getHex, seaHexes, victoryHexes, move,
  VICTORY_LABEL, VICTORY_BANNER, MAP_ACTIONS, DIRECTIONS,
} from '@ftk/shared';

const VICT_STYLE: Record<string, { fill: string; edge: string; ink: string }> = {
  cult:   { fill: '#c8a11e', edge: '#f7e9b0', ink: '#3a2c05' },
  pirate: { fill: '#a52a1e', edge: '#f4b8ad', ink: '#fff0ec' },
  sailor: { fill: '#1c4f86', edge: '#bcdcff', ink: '#eef7ff' },
};

// flat-top hexagon — the packing the printed board uses, edge to edge, no gaps
function hexPath(cx: number, cy: number, s: number): string {
  const p: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    p.push(`${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`);
  }
  return `M${p.join('L')}Z`;
}

// arrows sit on the three upward edges of a flat-top space, aimed where that card leads
const H = Math.sqrt(3) / 2;
function Arrow({ cx, cy, dir, s }: { cx: number; cy: number; dir: Direction; s: number }) {
  const dx = dir === 'west' ? -0.75 * s * 0.8 : dir === 'east' ? 0.75 * s * 0.8 : 0;
  const dy = dir === 'north' ? -H * s * 0.78 : -(H / 2) * s * 0.8;
  const rot = dir === 'north' ? 0 : dir === 'west' ? -60 : 60;
  const a = s * 0.17;
  return (
    <g transform={`translate(${cx + dx},${cy + dy}) rotate(${rot})`}>
      <path d={`M0,${-a * 1.15} L${a},${a * 0.72} L0,${a * 0.32} L${-a},${a * 0.72} Z`}
        fill={DIRECTIONS[dir].color} stroke="#fdf6e6" strokeWidth={s * 0.026} strokeLinejoin="round" />
    </g>
  );
}

export function HexMap({ shipSpace, size = 30, showNumbers = false }:
  { shipSpace: string | null; size?: number; showNumbers?: boolean }) {
  const map = THE_MAP;
  const s = size;
  const b = mapBounds(map, s);
  const pad = s * 1.9;
  const vb = `${(b.minX - pad).toFixed(0)} ${(b.minY - pad).toFixed(0)} ${(b.width + pad * 2).toFixed(0)} ${(b.height + pad * 2).toFixed(0)}`;

  const shipHex = getHex(map, shipSpace ?? map.startId) ?? getHex(map, map.startId)!;
  const shipPos = hexPixel(shipHex.col, shipHex.level, s);

  // the sea deepens as the ship runs north
  const shade = (level: number) => {
    const t = level / map.levels;
    const c = (a: number, z: number) => Math.round(a + (z - a) * t);
    return `rgb(${c(158, 40)},${c(219, 112)},${c(222, 160)})`;
  };

  // the supply line runs along the hex edges it actually separates
  const supplySegs: number[][] = [];
  for (const h of map.hexes) {
    if (h.level >= map.supplyLineLevel) continue;
    const p = hexPixel(h.col, h.level, s);
    const ups: [Direction, number, number][] = [
      ['west', h.col - 1, h.level + 1],
      ['north', h.col, h.level + 2],
      ['east', h.col + 1, h.level + 1],
    ];
    for (const [d, c, l] of ups) {
      if (l < map.supplyLineLevel) continue;
      if (!map.hexes.some(o => o.col === c && o.level === l)) continue;
      if (d === 'north') supplySegs.push([p.x - s / 2, p.y - H * s, p.x + s / 2, p.y - H * s]);
      else if (d === 'west') supplySegs.push([p.x - s, p.y, p.x - s / 2, p.y - H * s]);
      else supplySegs.push([p.x + s / 2, p.y - H * s, p.x + s, p.y]);
    }
  }

  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }} role="img" aria-label="Game map">
      <defs>
        <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cbb68c" />
          <stop offset="55%" stopColor="#b39a6f" />
          <stop offset="100%" stopColor="#8e7a55" />
        </linearGradient>
        <radialGradient id="fog" cx="50%" cy="50%">
          <stop offset="64%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#e8e2d2" stopOpacity="0.45" />
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation={s * 0.05} /></filter>
      </defs>

      <rect x={b.minX - pad} y={b.minY - pad} width={b.width + pad * 2} height={b.height + pad * 2}
        fill="url(#land)" rx={s * 0.5} />

      {/* surf ring under every space */}
      {map.hexes.map(h => {
        const p = hexPixel(h.col, h.level, s);
        return <path key={`s${h.id}`} d={hexPath(p.x, p.y, s * 1.02)} fill="#e7f3f2" opacity={0.9} />;
      })}

      {/* the far coast: three spaces per cove, one for the Kraken */}
      {victoryHexes(map).map(h => {
        const p = hexPixel(h.col, h.level, s);
        const st = VICT_STYLE[h.victory!];
        return (
          <g key={h.id}>
            <path d={hexPath(p.x, p.y, s)} fill={st.fill} stroke={st.edge} strokeWidth={s * 0.07} />
            <text x={p.x} y={p.y + s * 0.26} textAnchor="middle" fontSize={s * 0.72}>
              {h.victory === 'cult' ? '🐙' : h.victory === 'pirate' ? '☠️' : '⚓'}
            </text>
            {showNumbers && <text x={p.x} y={p.y - s * 0.5} textAnchor="middle" fontSize={s * 0.28} fill={st.ink} opacity={0.8}>{h.n}</text>}
          </g>
        );
      })}

      {/* open sea */}
      {seaHexes(map).map(h => {
        const p = hexPixel(h.col, h.level, s);
        const icon = h.icon ? MAP_ACTIONS[h.icon] : null;
        return (
          <g key={h.id}>
            <path d={hexPath(p.x, p.y, s)} fill={shade(h.level)} />
            <path d={hexPath(p.x, p.y, s)} fill="none" stroke="#0b3247" strokeWidth={s * 0.035} opacity={0.45} />
            {icon && (
              <>
                <circle cx={p.x} cy={p.y + s * 0.05} r={s * 0.34} fill="#08283a" opacity={0.22} />
                <circle cx={p.x} cy={p.y + s * 0.05} r={s * 0.34} fill="none" stroke="#e8f6ff" strokeWidth={s * 0.022} opacity={0.5} />
                <text x={p.x} y={p.y + s * 0.25} textAnchor="middle" fontSize={s * 0.5}>{icon.symbol}</text>
              </>
            )}
            {h.start && <text x={p.x} y={p.y + s * 0.62} textAnchor="middle" fontSize={s * 0.22}
              fill="#06303f" opacity={0.85} fontWeight={700}>START</text>}
            {showNumbers && <text x={p.x} y={p.y - s * 0.42} textAnchor="middle" fontSize={s * 0.26}
              fill="#06303f" opacity={0.55}>{h.n}</text>}
            {(['west', 'north', 'east'] as Direction[]).map(d => <Arrow key={d} cx={p.x} cy={p.y} dir={d} s={s} />)}
          </g>
        );
      })}

      {/* supply line, tracing the edges it separates */}
      {supplySegs.map((g, i) => (
        <line key={i} x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} stroke="#fffdf5"
          strokeWidth={s * 0.1} strokeDasharray={`${s * 0.24} ${s * 0.18}`} strokeLinecap="round" />
      ))}

      {/* coast banners */}
      {(['pirate', 'sailor'] as const).map(kind => {
        const group = victoryHexes(map).filter(v => v.victory === kind).sort((a, z) => a.col - z.col);
        const mid = group[Math.floor(group.length / 2)];
        const p = hexPixel(mid.col, mid.level, s);
        const st = VICT_STYLE[kind];
        const w = s * 3.5, hh = s * 0.66;
        return (
          <g key={kind} transform={`translate(${p.x},${p.y - s * 1.32})`}>
            <path d={`M${-w / 2},${-hh / 2} L${w / 2},${-hh / 2} L${w / 2 + hh * 0.4},0 L${w / 2},${hh / 2} L${-w / 2},${hh / 2} L${-w / 2 - hh * 0.4},0 Z`}
              fill={st.fill} stroke="#00000055" strokeWidth={s * 0.03} />
            <text y={-s * 0.02} textAnchor="middle" fontSize={s * 0.26} fill={st.ink} fontWeight={700}>{VICTORY_BANNER[kind]}</text>
            <text y={s * 0.23} textAnchor="middle" fontSize={s * 0.17} fill={st.ink} opacity={0.85}>{VICTORY_LABEL[kind]}</text>
          </g>
        );
      })}

      {/* the Kraken's own caption */}
      {(() => {
        const k = victoryHexes(map).find(v => v.victory === 'cult')!;
        const p = hexPixel(k.col, k.level, s);
        return (
          <g transform={`translate(${p.x},${p.y - s * 1.32})`}>
            <text y={-s * 0.02} textAnchor="middle" fontSize={s * 0.28} fill="#4a3a12" fontWeight={700}>{VICTORY_LABEL.cult}</text>
            <text y={s * 0.24} textAnchor="middle" fontSize={s * 0.18} fill="#4a3a12" opacity={0.8}>{VICTORY_BANNER.cult}</text>
          </g>
        );
      })()}

      {/* compass */}
      <g transform={`translate(${b.minX - s * 0.7},${b.minY + b.height * 0.93})`} opacity={0.45}>
        <circle r={s * 0.48} fill="none" stroke="#5b4a2c" strokeWidth={s * 0.05} />
        <path d={`M0,${-s * 0.4} L${s * 0.12},0 L0,${s * 0.4} L${-s * 0.12},0 Z`} fill="#5b4a2c" />
        <text y={-s * 0.58} textAnchor="middle" fontSize={s * 0.24} fill="#5b4a2c" fontWeight={700}>N</text>
      </g>

      <rect x={b.minX - pad} y={b.minY - pad} width={b.width + pad * 2} height={b.height + pad * 2}
        fill="url(#fog)" pointerEvents="none" rx={s * 0.5} />

      <g className="ship-move" style={{ transform: `translate(${shipPos.x}px, ${shipPos.y}px)` }}>
        <ellipse rx={s * 0.4} ry={s * 0.18} cy={s * 0.34} fill="#00131d" opacity={0.35} filter="url(#soft)" />
        <text y={s * 0.3} textAnchor="middle" fontSize={s * 0.9}>⛵</text>
      </g>
    </svg>
  );
}
