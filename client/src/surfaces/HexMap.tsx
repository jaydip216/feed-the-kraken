import type { Direction } from '@ftk/shared';
import {
  THE_MAP, hexPixel, mapBounds, getHex, seaHexes, victoryHexes, move,
  VICTORY_LABEL, VICTORY_BANNER, MAP_ACTIONS, DIRECTIONS, BOARD_MOVES,
} from '@ftk/shared';

const VICT_STYLE: Record<string, { fill: string; edge: string; ink: string }> = {
  cult:   { fill: '#c8a11e', edge: '#f7e9b0', ink: '#3a2c05' },
  pirate: { fill: '#a52a1e', edge: '#f4b8ad', ink: '#fff0ec' },
  sailor: { fill: '#1c4f86', edge: '#bcdcff', ink: '#eef7ff' },
};

const H = Math.sqrt(3) / 2;

// flat-top hexagon — the packing the printed board uses, edge to edge, no gaps
function hexPath(cx: number, cy: number, s: number): string {
  const p: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    p.push(`${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`);
  }
  return `M${p.join('L')}Z`;
}

function HexArrows({ hex, map, s }: { hex: { id: string; col: number; level: number }; map: typeof THE_MAP; s: number }) {
  const p = hexPixel(hex.col, hex.level, s);
  const n = Number(hex.id);
  const moves = BOARD_MOVES[n];
  if (!moves) return null;

  const dirs: Direction[] = ['west', 'north', 'east'];

  // Group directions by target hex
  const targetMap: Record<number, Direction[]> = {};
  for (const d of dirs) {
    const t = moves[d];
    if (!t) continue;
    if (!targetMap[t]) targetMap[t] = [];
    targetMap[t].push(d);
  }

  const targetGroups: { targetId: number; targetHex: NonNullable<ReturnType<typeof getHex>>; dirs: Direction[] }[] = [];
  for (const [tStr, dList] of Object.entries(targetMap)) {
    const targetId = Number(tStr);
    const targetHex = getHex(map, String(targetId));
    if (targetHex) {
      targetGroups.push({ targetId, targetHex, dirs: dList });
    }
  }

  const a = s * 0.16;
  const baseDist = s * 0.70;

  return (
    <>
      {targetGroups.map(({ targetId, targetHex, dirs: groupDirs }) => {
        const tp = hexPixel(targetHex.col, targetHex.level, s);
        const dx = tp.x - p.x;
        const dy = tp.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const px = -uy;
        const py = ux;
        const rot = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;

        return groupDirs.map((dir, i) => {
          let shift = 0;
          if (groupDirs.length === 2) {
            shift = (i === 0 ? -0.16 : 0.16) * s;
          } else if (groupDirs.length > 2) {
            shift = (i - (groupDirs.length - 1) / 2) * 0.22 * s;
          }

          const ax = p.x + ux * baseDist + px * shift;
          const ay = p.y + uy * baseDist + py * shift;

          return (
            <g key={`${dir}-${targetId}`} transform={`translate(${ax},${ay}) rotate(${rot})`}>
              <path
                d={`M0,${-a * 1.15} L${a},${a * 0.72} L0,${a * 0.32} L${-a},${a * 0.72} Z`}
                fill={DIRECTIONS[dir].color}
                stroke="#fdf6e6"
                strokeWidth={s * 0.026}
                strokeLinejoin="round"
              />
            </g>
          );
        });
      })}
    </>
  );
}

// Detailed 3D Perspective Sailing Ship
function Ship3D({ s }: { s: number }) {
  return (
    <g className="ship-bob">
      {/* Ocean Wake & Foam Bubbles */}
      <ellipse cx={0} cy={s * 0.36} rx={s * 0.65} ry={s * 0.24} fill="#052433" opacity={0.5} filter="url(#soft)" />
      <ellipse cx={0} cy={s * 0.34} rx={s * 0.52} ry={s * 0.18} fill="#d4f4fa" opacity={0.35} />
      <path
        d={`M${-s * 0.52},${s * 0.34} Q${-s * 0.58},${s * 0.48} ${-s * 0.25},${s * 0.48} Q0,${s * 0.38} ${s * 0.28},${s * 0.48} Q${s * 0.58},${s * 0.48} ${s * 0.52},${s * 0.34}`}
        fill="none" stroke="#ffffffcc" strokeWidth={s * 0.035} strokeLinecap="round"
      />

      {/* 3D Hull Drop Shadow */}
      <ellipse cx={-s * 0.05} cy={s * 0.32} rx={s * 0.44} ry={s * 0.16} fill="#021017" opacity={0.7} filter="url(#soft)" />

      {/* 3D Keel & Lower Hull Planking */}
      <path
        d={`M${-s * 0.44},${s * 0.22} Q${-s * 0.48},${s * 0.38} ${-s * 0.15},${s * 0.42} L${s * 0.26},${s * 0.4} Q${s * 0.48},${s * 0.32} ${s * 0.44},${s * 0.16} L${s * 0.34},${s * 0.18} Q${s * 0.1},${s * 0.25} ${-s * 0.36},${s * 0.16} Z`}
        fill="url(#hull-dark)" stroke="#1a0c04" strokeWidth={s * 0.02}
      />

      {/* Upper Main Wooden Hull with 3D Depth */}
      <path
        d={`M${-s * 0.44},${s * 0.22} Q${-s * 0.48},${s * 0.06} ${-s * 0.38},${-s * 0.04} L${s * 0.28},${-s * 0.06} Q${s * 0.46},${s * 0.02} ${s * 0.44},${s * 0.16} Q${s * 0.2},${s * 0.34} ${-s * 0.44},${s * 0.22} Z`}
        fill="url(#hull-wood)" stroke="#1a0c04" strokeWidth={s * 0.025}
      />

      {/* Golden Gunwale Trim & Railing */}
      <path
        d={`M${-s * 0.38},${-s * 0.04} Q${-s * 0.08},${s * 0.04} ${s * 0.28},${-s * 0.06}`}
        fill="none" stroke="#e0b64a" strokeWidth={s * 0.032} strokeLinecap="round"
      />
      <path
        d={`M${-s * 0.42},${s * 0.09} Q${-s * 0.08},${s * 0.17} ${s * 0.36},${s * 0.07}`}
        fill="none" stroke="#8a5a2a" strokeWidth={s * 0.02}
      />

      {/* Cannon Ports with Gold Trim */}
      {[-0.24, -0.08, 0.08].map((cxRatio, idx) => (
        <g key={idx}>
          <circle cx={s * cxRatio} cy={s * (0.13 + idx * 0.01)} r={s * 0.032} fill="#0d0d0d" stroke="#e0b64a" strokeWidth={s * 0.012} />
          <circle cx={s * cxRatio} cy={s * (0.13 + idx * 0.01)} r={s * 0.014} fill="#000" />
        </g>
      ))}

      {/* Bowsprit (front wooden spar) */}
      <path d={`M${s * 0.28},${-s * 0.06} L${s * 0.58},${-s * 0.24}`} stroke="#633b19" strokeWidth={s * 0.038} strokeLinecap="round" />

      {/* Foremast & Fore Sails */}
      <path d={`M${s * 0.18},${s * 0.04} L${s * 0.18},${-s * 0.54}`} stroke="#4a2a10" strokeWidth={s * 0.04} strokeLinecap="round" />
      <path d={`M${s * 0.06},${-s * 0.3} L${s * 0.3},${-s * 0.34}`} stroke="#3d210b" strokeWidth={s * 0.025} strokeLinecap="round" />
      <path
        d={`M${s * 0.06},${-s * 0.3} Q${s * 0.18},${-s * 0.36} ${s * 0.3},${-s * 0.34} Q${s * 0.34},${-s * 0.12} ${s * 0.28},${-s * 0.08} Q${s * 0.18},${-s * 0.12} ${s * 0.08},${-s * 0.06} Z`}
        fill="url(#sail-grad)" stroke="#c2b090" strokeWidth={s * 0.018}
      />

      {/* Mainmast (Center, Tallest) */}
      <path d={`M${-s * 0.06},${s * 0.06} L${-s * 0.06},${-s * 0.74}`} stroke="#4a2a10" strokeWidth={s * 0.046} strokeLinecap="round" />
      {/* Main Lower Yard */}
      <path d={`M${-s * 0.24},${-s * 0.18} L${s * 0.12},${-s * 0.2}`} stroke="#3d210b" strokeWidth={s * 0.026} strokeLinecap="round" />
      {/* Main Upper Yard */}
      <path d={`M${-s * 0.26},${-s * 0.44} L${s * 0.14},${-s * 0.48}`} stroke="#3d210b" strokeWidth={s * 0.03} strokeLinecap="round" />
      {/* Main Top Yard */}
      <path d={`M${-s * 0.2},${-s * 0.66} L${s * 0.08},${-s * 0.69}`} stroke="#3d210b" strokeWidth={s * 0.024} strokeLinecap="round" />

      {/* Main Lower Sail (Billowing 3D) */}
      <path
        d={`M${-s * 0.24},${-s * 0.44} Q${-s * 0.06},${-s * 0.5} ${s * 0.12},${-s * 0.47} Q${s * 0.18},${-s * 0.24} ${s * 0.12},${-s * 0.2} Q${-s * 0.06},${-s * 0.26} ${-s * 0.22},${-s * 0.18} Z`}
        fill="url(#sail-grad)" stroke="#c2b090" strokeWidth={s * 0.02}
      />
      {/* Main Upper Sail */}
      <path
        d={`M${-s * 0.2},${-s * 0.66} Q${-s * 0.06},${-s * 0.71} ${s * 0.08},${-s * 0.68} Q${s * 0.12},${-s * 0.5} ${s * 0.08},${-s * 0.48} Q${-s * 0.06},${-s * 0.52} ${-s * 0.18},${-s * 0.46} Z`}
        fill="url(#sail-grad-light)" stroke="#c2b090" strokeWidth={s * 0.018}
      />

      {/* Crow's Nest */}
      <rect x={-s * 0.09} y={-s * 0.7} width={s * 0.06} height={s * 0.04} fill="#5a3416" rx={s * 0.01} stroke="#3d210b" strokeWidth={s * 0.008} />

      {/* Main Mast Flag (Red / Golden Swallowtail Pennant) */}
      <path
        d={`M${-s * 0.06},${-s * 0.74} L${-s * 0.28},${-s * 0.8} L${-s * 0.2},${-s * 0.74} L${-s * 0.28},${-s * 0.68} Z`}
        fill="#c0392b" stroke="#ffd700" strokeWidth={s * 0.014}
      />

      {/* Mizzen Mast (Stern / Aft) */}
      <path d={`M${-s * 0.3},${s * 0.04} L${-s * 0.3},${-s * 0.46}`} stroke="#4a2a10" strokeWidth={s * 0.036} strokeLinecap="round" />
      {/* Triangular Lateen Sail */}
      <path
        d={`M${-s * 0.3},${-s * 0.44} L${-s * 0.12},${-s * 0.16} L${-s * 0.4},${-s * 0.08} Z`}
        fill="url(#sail-grad)" stroke="#c2b090" strokeWidth={s * 0.018}
      />

      {/* Stern Castle Lantern */}
      <circle cx={-s * 0.4} cy={-s * 0.05} r={s * 0.038} fill="#f39c12" stroke="#b9770e" strokeWidth={s * 0.012} />
      <circle cx={-s * 0.4} cy={-s * 0.05} r={s * 0.018} fill="#ffffff" />
    </g>
  );
}

export function HexMap({ shipSpace, size = 30, showNumbers = false }:
  { shipSpace: string | null; size?: number; showNumbers?: boolean }) {
  const map = THE_MAP;
  const s = size;
  const b = mapBounds(map, s);
  const pad = s * 2.2;
  const vb = `${(b.minX - pad).toFixed(0)} ${(b.minY - pad).toFixed(0)} ${(b.width + pad * 2).toFixed(0)} ${(b.height + pad * 2).toFixed(0)}`;

  const shipHex = getHex(map, shipSpace ?? map.startId) ?? getHex(map, map.startId)!;
  const shipPos = hexPixel(shipHex.col, shipHex.level, s);

  // Sea depth gradient color
  const shade = (level: number) => {
    const t = level / map.levels;
    const c = (a: number, z: number) => Math.round(a + (z - a) * t);
    return `rgb(${c(145, 20)},${c(210, 85)},${c(225, 140)})`;
  };

  // Supply line running along the upper edges of hexes 8, 9, 10, 11, 12
  const supplyLinePath = `M ${-4 * s},${-4 * H * s} L ${-3.5 * s},${-5 * H * s} L ${-2.5 * s},${-5 * H * s} L ${-2 * s},${-6 * H * s} L ${-s},${-6 * H * s} L ${-0.5 * s},${-7 * H * s} L ${0.5 * s},${-7 * H * s} L ${s},${-6 * H * s} L ${2 * s},${-6 * H * s} L ${2.5 * s},${-5 * H * s} L ${3.5 * s},${-5 * H * s} L ${4 * s},${-4 * H * s}`;

  // Central Island Center Position (between rows 2 & 4: level ~5.5, col 0)
  const islandPos = { x: 0, y: -5.3 * H * s };

  return (
    <svg
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }}
      role="img"
      aria-label="Feed the Kraken Game Map"
    >
      <defs>
        {/* Ocean Background Gradient */}
        <radialGradient id="ocean-bg" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#1e6488" />
          <stop offset="40%" stopColor="#12435c" />
          <stop offset="75%" stopColor="#0a283b" />
          <stop offset="100%" stopColor="#041420" />
        </radialGradient>

        {/* 3D Ship Gradients */}
        <linearGradient id="hull-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a461b" />
          <stop offset="50%" stopColor="#593111" />
          <stop offset="100%" stopColor="#381d09" />
        </linearGradient>
        <linearGradient id="hull-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d1f0b" />
          <stop offset="100%" stopColor="#1f0e04" />
        </linearGradient>
        <linearGradient id="sail-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#f4ede0" />
          <stop offset="100%" stopColor="#d1c0a1" />
        </linearGradient>
        <linearGradient id="sail-grad-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#faf5ea" />
          <stop offset="100%" stopColor="#ded1b8" />
        </linearGradient>

        {/* Atmospheric Fog */}
        <radialGradient id="fog" cx="50%" cy="50%">
          <stop offset="68%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#e8e2d2" stopOpacity="0.25" />
        </radialGradient>
        <clipPath id="board-clip">
          <rect
            x={b.minX - pad}
            y={b.minY - pad}
            width={b.width + pad * 2}
            height={b.height + pad * 2}
            rx={s * 0.6}
          />
        </clipPath>
        <filter id="soft"><feGaussianBlur stdDeviation={s * 0.06} /></filter>
      </defs>

      {/* Map Background: Wallpaper Image */}
      <g clipPath="url(#board-clip)">
        <image
          href="/wallpaper.jpg"
          x={b.minX - pad}
          y={b.minY - pad}
          width={b.width + pad * 2}
          height={b.height + pad * 2}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      {/* Surf Halos Under Every Space */}
      {map.hexes.map(h => {
        const p = hexPixel(h.col, h.level, s);
        return <path key={`surf-${h.id}`} d={hexPath(p.x, p.y, s * 1.05)} fill="#dcf3f5" opacity={0.85} />;
      })}

      {/* Destination Hexes (Top Coast) */}
      {victoryHexes(map).map(h => {
        const p = hexPixel(h.col, h.level, s);
        const st = VICT_STYLE[h.victory!];
        return (
          <g key={h.id}>
            <path d={hexPath(p.x, p.y, s)} fill={st.fill} stroke={st.edge} strokeWidth={s * 0.07} />
            <text x={p.x} y={p.y + s * 0.26} textAnchor="middle" fontSize={s * 0.72}>
              {h.victory === 'cult' ? '🐙' : h.victory === 'pirate' ? '☠️' : '⚓'}
            </text>
            {showNumbers && (
              <text x={p.x} y={p.y - s * 0.5} textAnchor="middle" fontSize={s * 0.28} fill={st.ink} opacity={0.85}>
                {h.n}
              </text>
            )}
          </g>
        );
      })}

      {/* Open Sea Hexes */}
      {seaHexes(map).map(h => {
        const p = hexPixel(h.col, h.level, s);
        const icon = h.icon ? MAP_ACTIONS[h.icon] : null;
        return (
          <g key={h.id}>
            <path d={hexPath(p.x, p.y, s)} fill={shade(h.level)} />
            <path d={hexPath(p.x, p.y, s)} fill="none" stroke="#0b3247" strokeWidth={s * 0.035} opacity={0.45} />
            {icon && (
              <>
                <circle cx={p.x} cy={p.y + s * 0.05} r={s * 0.34} fill="#08283a" opacity={0.25} />
                <circle cx={p.x} cy={p.y + s * 0.05} r={s * 0.34} fill="none" stroke="#e8f6ff" strokeWidth={s * 0.022} opacity={0.5} />
                <text x={p.x} y={p.y + s * 0.25} textAnchor="middle" fontSize={s * 0.5}>{icon.symbol}</text>
              </>
            )}
            {h.start && (
              <text x={p.x} y={p.y + s * 0.62} textAnchor="middle" fontSize={s * 0.22} fill="#06303f" opacity={0.9} fontWeight={700}>
                START
              </text>
            )}
            {showNumbers && (
              <text x={p.x} y={p.y - s * 0.42} textAnchor="middle" fontSize={s * 0.26} fill="#06303f" opacity={0.6}>
                {h.n}
              </text>
            )}
            <HexArrows hex={h} map={map} s={s} />
          </g>
        );
      })}

      {/* Supply Line (Continuous Polyline Across Upper Edges of 8, 9, 10, 11, 12) */}
      <g opacity={0.8}>
        {/* Glow Shadow Under Supply Line */}
        <path
          d={supplyLinePath}
          fill="none"
          stroke="#052433"
          strokeWidth={s * 0.11}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.45}
        />
        {/* White Dashed Supply Line */}
        <path
          d={supplyLinePath}
          fill="none"
          stroke="#ffffff"
          strokeWidth={s * 0.065}
          strokeDasharray={`${s * 0.22} ${s * 0.14}`}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Golden Dash Accent */}
        <path
          d={supplyLinePath}
          fill="none"
          stroke="#e0b64a"
          strokeWidth={s * 0.022}
          strokeDasharray={`${s * 0.22} ${s * 0.14}`}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Left & Right Supply Line Brass End Cleats */}
        <circle cx={-4 * s} cy={-4 * H * s} r={s * 0.085} fill="#e0b64a" stroke="#2a1a08" strokeWidth={s * 0.02} />
        <circle cx={4 * s} cy={-4 * H * s} r={s * 0.085} fill="#e0b64a" stroke="#2a1a08" strokeWidth={s * 0.02} />
      </g>

      {/* Tilted Coast Banners (Aligned with respective coastlines) */}
      {/* 1. Pirate Victory Banner (Tilted -26° along North-West coast) */}
      {(() => {
        const pHex = getHex(map, '26') ?? { col: -2, level: 10 };
        const p = hexPixel(pHex.col, pHex.level, s);
        const st = VICT_STYLE.pirate;
        const w = s * 3.8, hh = s * 0.72;
        return (
          <g transform={`translate(${p.x - s * 0.4},${p.y - s * 1.35}) rotate(-26)`}>
            <path
              d={`M${-w / 2},${-hh / 2} L${w / 2},${-hh / 2} L${w / 2 + hh * 0.4},0 L${w / 2},${hh / 2} L${-w / 2},${hh / 2} L${-w / 2 - hh * 0.4},0 Z`}
              fill={st.fill}
              stroke="#ffd7d0"
              strokeWidth={s * 0.035}
            />
            <text y={-s * 0.03} textAnchor="middle" fontSize={s * 0.28} fill={st.ink} fontWeight={700}>
              {VICTORY_BANNER.pirate}
            </text>
            <text y={s * 0.24} textAnchor="middle" fontSize={s * 0.18} fill={st.ink} opacity={0.9}>
              {VICTORY_LABEL.pirate}
            </text>
          </g>
        );
      })()}

      {/* 2. Sailor Victory Banner (Tilted +26° along North-East coast) */}
      {(() => {
        const sHex = getHex(map, '30') ?? { col: 2, level: 10 };
        const p = hexPixel(sHex.col, sHex.level, s);
        const st = VICT_STYLE.sailor;
        const w = s * 3.8, hh = s * 0.72;
        return (
          <g transform={`translate(${p.x + s * 0.4},${p.y - s * 1.35}) rotate(26)`}>
            <path
              d={`M${-w / 2},${-hh / 2} L${w / 2},${-hh / 2} L${w / 2 + hh * 0.4},0 L${w / 2},${hh / 2} L${-w / 2},${hh / 2} L${-w / 2 - hh * 0.4},0 Z`}
              fill={st.fill}
              stroke="#cfe2ff"
              strokeWidth={s * 0.035}
            />
            <text y={-s * 0.03} textAnchor="middle" fontSize={s * 0.28} fill={st.ink} fontWeight={700}>
              {VICTORY_BANNER.sailor}
            </text>
            <text y={s * 0.24} textAnchor="middle" fontSize={s * 0.18} fill={st.ink} opacity={0.9}>
              {VICTORY_LABEL.sailor}
            </text>
          </g>
        );
      })()}

      {/* 3. The Kraken (Cult Victory) Caption at Top Center */}
      {(() => {
        const k = victoryHexes(map).find(v => v.victory === 'cult')!;
        const p = hexPixel(k.col, k.level, s);
        const w = s * 3.4, hh = s * 0.68;
        return (
          <g transform={`translate(${p.x},${p.y - s * 1.35})`}>
            <path
              d={`M${-w / 2},${-hh / 2} L${w / 2},${-hh / 2} L${w / 2 + hh * 0.35},0 L${w / 2},${hh / 2} L${-w / 2},${hh / 2} L${-w / 2 - hh * 0.35},0 Z`}
              fill="#c8a11e"
              stroke="#fef5d1"
              strokeWidth={s * 0.035}
            />
            <text y={-s * 0.02} textAnchor="middle" fontSize={s * 0.28} fill="#3a2c05" fontWeight={700}>
              {VICTORY_LABEL.cult}
            </text>
            <text y={s * 0.24} textAnchor="middle" fontSize={s * 0.18} fill="#3a2c05" opacity={0.85}>
              {VICTORY_BANNER.cult}
            </text>
          </g>
        );
      })()}

      {/* Vintage Brass Compass Rose */}
      <g transform={`translate(${b.minX - s * 0.5},${b.minY + b.height * 0.95})`} opacity={0.7}>
        <circle r={s * 0.55} fill="#142c38" stroke="#d4af37" strokeWidth={s * 0.05} />
        <circle r={s * 0.48} fill="none" stroke="#d4af37" strokeWidth={s * 0.02} strokeDasharray={`${s * 0.08} ${s * 0.04}`} />
        {/* 8-Point Compass Star */}
        <path d={`M0,${-s * 0.44} L${s * 0.1},${-s * 0.1} L${s * 0.44},0 L${s * 0.1},${s * 0.1} L0,${s * 0.44} L${-s * 0.1},${s * 0.1} L${-s * 0.44},0 L${-s * 0.1},${-s * 0.1} Z`} fill="#d4af37" />
        <path d={`M0,${-s * 0.44} L${s * 0.1},${-s * 0.1} L0,0 L${-s * 0.1},${-s * 0.1} Z`} fill="#c0392b" />
        <circle r={s * 0.08} fill="#ffffff" stroke="#d4af37" strokeWidth={s * 0.02} />
        <text y={-s * 0.56} textAnchor="middle" fontSize={s * 0.24} fill="#e0b64a" fontWeight={700}>N</text>
      </g>

      {/* Atmospheric Fog / Parchment Overlay */}
      <rect
        x={b.minX - pad}
        y={b.minY - pad}
        width={b.width + pad * 2}
        height={b.height + pad * 2}
        fill="url(#fog)"
        pointerEvents="none"
        rx={s * 0.6}
      />

      {/* 3D Sailing Ship Token */}
      <g className="ship-move" style={{ transform: `translate(${shipPos.x}px, ${shipPos.y}px)` }}>
        <Ship3D s={s} />
      </g>
    </svg>
  );
}
