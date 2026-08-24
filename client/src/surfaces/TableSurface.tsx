import { useEffect, useState } from 'react';
import type { TableView, PublicSeat } from '@ftk/shared';
import { emit, lastRoom, clearSession, socket } from '../lib/socket.js';
import { useView } from '../lib/useView.js';
import { FactionChip } from './Faction.js';
import { HexMap } from './HexMap.js';
import { DIRECTIONS, NAV_ACTIONS, SYMBOLS, FACTIONS } from '@ftk/shared';

export function TableSurface() {
  const view = useView<TableView>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const existing = lastRoom.get();
    if (existing) emit('attachTable', { roomCode: existing });
  }, []);

  useEffect(() => {
    const onEnded = () => { clearSession(); location.reload(); };
    socket.on('sessionEnded', onEnded);
    return () => { socket.off('sessionEnded', onEnded); };
  }, []);

  async function newRoom() {
    setCreating(true);
    const r = await emit('createRoom', {});
    if (r?.roomCode) lastRoom.set(r.roomCode);
    setCreating(false);
  }

  if (!view) {
    return (
      <div className="wrap center anim-in" style={{ paddingTop: 90 }}>
        <div style={{ fontSize: 64 }}>🐙</div>
        <h1 className="h1">Feed the Kraken</h1>
        <p className="sub">Open a room, then have the crew join on their phones.</p>
        <button className="btn big" onClick={newRoom} disabled={creating} style={{ marginTop: 24 }}>
          {creating ? 'Opening…' : 'Open a new room'}
        </button>
      </div>
    );
  }
  if (view.phase === 'lobby') return <Lobby v={view} />;
  if (view.phase === 'ended') return <EndGame v={view} />;
  return <Hud v={view} />;
}

/* ---------------- lobby ---------------- */
function Lobby({ v }: { v: TableView }) {
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(v.seats.map(s => s.id)); }, [v.seats.map(s => s.id).join(',')]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    emit('setSeatingOrder', { roomCode: v.roomCode, seatIdsInOrder: next });
  }
  const byId = (id: string) => v.seats.find(s => s.id === id)!;
  const canStart = v.seats.length >= 5 && v.seats.length <= 11;

  return (
    <div className="wrap-wide anim-in">
      <div className="topbar">
        <span className="h2" style={{ color: 'var(--gold-2)' }}>🐙 Feed the Kraken</span>
        <span>join on your phone · room <span className="chip-code">{v.roomCode}</span></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22, alignItems: 'start' }}>
        <div className="panel">
          <h2 className="h2">Seating order</h2>
          <p className="sub">Put the names in physical clockwise order — the Drunk card passes the helm clockwise.</p>
          <div style={{ marginTop: 14 }}>
            {order.map((id, i) => {
              const s = byId(id);
              return (
                <div className="seat anim-in" key={id}>
                  <span className="num">{i + 1}</span>
                  <b style={{ fontSize: 17 }}>{s.name}</b>
                  {i === 0 && <span className="badge b-cap">first captain</span>}
                  {!s.connected && <span className="muted" style={{ fontSize: 12 }}>offline</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="btn ghost" style={{ padding: '4px 12px' }} onClick={() => move(i, -1)}>↑</button>
                    <button className="btn ghost" style={{ padding: '4px 12px' }} onClick={() => move(i, 1)}>↓</button>
                  </span>
                </div>
              );
            })}
            {v.seats.length === 0 && <p className="muted">Waiting for the crew to join…</p>}
          </div>
        </div>
        <div className="panel">
          <h2 className="h2">The journey</h2>
          <div style={{ marginTop: 12, height: 240 }}><HexMap shipSpace={null} size={22} /></div>
          <button className="btn block big" style={{ marginTop: 16 }} disabled={!canStart}
            onClick={() => emit('startGame', { roomCode: v.roomCode })}>
            Deal factions &amp; set sail
          </button>
          <p className="sub center">{canStart ? `${v.seats.length} aboard` : 'Need 5–11 players'}</p>
          <a className="btn ghost block" style={{ marginTop: 10, textAlign: 'center', textDecoration: 'none' }} href="/guide">
            📖 How to play
          </a>
        </div>
      </div>
    </div>
  );
}


/* ---------------- in-game HUD ---------------- */
const PHASE_LABEL: Record<string, string> = {
  pirateGathering: 'Secret pirate gathering', appoint: 'Appointing the navigation team',
  mutiny: 'A question of loyalty', mutinyTieResolution: 'Breaking the tie',
  navigation: 'The navigation', emergencyNavigation: 'Emergency navigation',
  execute: 'Executing the navigation card', cultRitual: 'Cult ritual', offDuty: 'Off-duty',
};

function Hud({ v }: { v: TableView }) {
  return (
    // A TV shows everything at once — no scrolling during play.
    <div className="wrap-wide anim-in"
      style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 14 }}>
      <div className="topbar" style={{ fontSize: 17, marginBottom: 0, flex: '0 0 auto' }}>
        <span><b className="h2" style={{ color: 'var(--gold-2)' }}>Round {v.round}</b>
          <span className="muted"> · {PHASE_LABEL[v.phase] ?? v.phase}</span></span>
        <span className="muted">
          {v.players} crew · {SYMBOLS.supply} supply {v.supplyPool}/40 · {SYMBOLS.deepSea} draw pile {v.drawPileCount}
        </span>
      </div>

      {/* map + crew side by side for a TV */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 20, flex: '1 1 auto', minHeight: 0 }}>
        <div className="panel" style={{ display: 'flex', minHeight: 0, padding: 10 }}>
          <HexMap shipSpace={v.shipSpace} />
        </div>
        <div className="panel" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <h2 className="h2" style={{ marginBottom: 6, flex: '0 0 auto' }}>The crew</h2>
          <CrewTable v={v} />
        </div>
      </div>

      {/* the revealed card and the step/action prompt sit side by side, so a basic
          turn never needs scrolling */}
      <div style={{ display: 'grid', gridTemplateColumns: v.revealedNavCard ? '1fr 1.15fr' : '1fr',
        gap: 16, flex: '0 0 auto', alignItems: 'stretch' }}>
        {v.revealedNavCard && <RevealedCard v={v} />}
        <ActionArea v={v} />
      </div>

      {/* captain's log runs along the bottom */}
      <div className="panel" style={{ flex: '0 0 auto', padding: '8px 14px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <b style={{ color: 'var(--gold-2)', fontSize: 13, whiteSpace: 'nowrap' }}>Captain's log</b>
          <div className="log" style={{ display: 'flex', gap: 18, overflowX: 'auto', whiteSpace: 'nowrap', fontSize: 12 }}>
            {v.log.slice(-4).map((l, i) => <span key={i}>· {l.text}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CrewTable({ v }: { v: TableView }) {
  // Every seat has to be visible at once — up to eleven of them — so the rows
  // share the available height instead of scrolling.
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gap: 4,
      gridTemplateRows: `repeat(${v.seats.length}, minmax(0, 1fr))` }}>
      {v.seats.map((s, i) => <CrewRow key={s.id} s={s} i={i} />)}
    </div>
  );
}

function CrewRow({ s, i }: { s: PublicSeat; i: number }) {
  return (
    <div className="seat" style={{ opacity: s.eliminated ? 0.5 : 1, margin: 0, padding: '4px 10px', minHeight: 0 }}>
      <span className="num" style={{ width: 20, height: 20, fontSize: 11 }}>{i + 1}</span>
      <b style={{ fontSize: 15 }}>{s.name}</b>
      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {s.isCaptain && <span className="badge b-cap anim-drop">{SYMBOLS.captain} Captain</span>}
        {s.badge === 'lieutenant' && <span className="badge b-lt anim-drop">{SYMBOLS.lieutenant} Lieutenant</span>}
        {s.badge === 'navigator' && <span className="badge b-nav anim-drop">{SYMBOLS.navigator} Navigator</span>}
        {s.offDuty && <span className="badge b-off anim-drop">{SYMBOLS.offDuty} Off-duty</span>}
        {!s.hasTongue && <span className="badge b-mute">{SYMBOLS.tongue} Silenced</span>}
        {s.eliminated && <span className="badge b-dead">{SYMBOLS.eliminated} Overboard</span>}
        {s.flogged && <span className="badge" style={{ background: '#5a4a2a', color: '#f0dfae' }}>
          not {FACTIONS[s.flogged].title}
        </span>}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
        {/* résumé: the permanent public record of this captain's watches */}
        <span style={{ display: 'flex', gap: 3 }}>
          {s.resume.map((d, k) => (
            <span key={k} title={DIRECTIONS[d].label}
              style={{ width: 12, height: 17, borderRadius: 3, background: DIRECTIONS[d].color, border: '1px solid #0006' }} />
          ))}
        </span>
        <b style={{ minWidth: 46, textAlign: 'right' }}>
          {SYMBOLS.gun} {s.guns === null ? '—' : s.guns}
        </b>
      </span>
    </div>
  );
}

/* the middle of the table: whatever the crew should be watching right now */
function ActionArea({ v }: { v: TableView }) {
  if (v.phase === 'mutiny' && v.mutinyProgress) {
    const { locked, total } = v.mutinyProgress;
    return (
      <div className="panel center anim-in">
        <h2 className="h2">⚔️ "Show me your loyalty!"</h2>
        <p className="sub">Counts stay hidden until every crew member has locked in.</p>
        <div style={{ margin: '14px auto', maxWidth: 460, height: 12, background: '#0006', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(locked / Math.max(total, 1)) * 100}%`, background: 'var(--sailor)', transition: 'width .3s' }} />
        </div>
        <b style={{ fontSize: 22 }}>{locked} of {total} locked in</b>
      </div>
    );
  }
  if (v.mutinyResult) {
    const r = v.mutinyResult;
    return (
      <div className="panel center anim-pop">
        <h2 className="h2" style={{ color: r.success ? 'var(--pirate)' : 'var(--sailor)' }}>
          {r.success ? '⚔️ Mutiny!' : '🕊️ No mutiny'}
        </h2>
        <p className="sub">{r.sum} guns revealed · {r.threshold} needed</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          {v.seats.filter(s => r.counts[s.id] !== undefined).map(s => (
            <span key={s.id} className="pill" style={{ background: '#ffffff18', color: 'var(--parch)', fontSize: 14 }}>
              {s.name} {SYMBOLS.gun} {r.counts[s.id]}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (v.navigationSilent) {
    return (
      <div className="panel center anim-in">
        <h2 className="h2 pulsing">{SYMBOLS.silence} Silence at the helm</h2>
        <p className="sub">
          {v.emergency ? 'Emergency navigation — ' : ''}
          the {v.navStep === 'captainDiscard' ? 'captain' : v.navStep === 'lieutenantDiscard' ? 'lieutenant' : 'navigator'} is choosing.
          No talking, no signals.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
          {['captainDiscard', 'lieutenantDiscard', 'navigatorChoose'].map((st, i) => (
            <div key={st} className="pill" style={{
              background: v.navStep === st ? 'var(--gold)' : '#ffffff14',
              color: v.navStep === st ? '#2a1e07' : 'var(--muted)', fontSize: 13,
            }}>{[SYMBOLS.captain, SYMBOLS.lieutenant, SYMBOLS.navigator][i]} {['Captain', 'Lieutenant', 'Navigator'][i]}</div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      {v.gate && <GateStep v={v} />}
      {v.spotlight && <SpotlightCard v={v} />}
      {v.phase === 'offDuty' && (
        <div className="panel center anim-in">
          <h2 className="h2">{SYMBOLS.offDuty} Off-duty</h2>
          <p className="sub">Signs handed out; the badges return to the captain.</p>
          <button className="btn big" style={{ marginTop: 10 }}
            onClick={() => emit('action', { roomCode: v.roomCode, type: 'nextRound' })}>
            Begin round {v.round + 1} →
          </button>
        </div>
      )}
    </div>
  );
}

function RevealedCard({ v }: { v: TableView }) {
  const c = v.revealedNavCard!;
  const d = DIRECTIONS[c.direction], a = NAV_ACTIONS[c.action];
  return (
    <div className="panel anim-flip" style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 0 }}>
      <div style={{ background: d.color, borderRadius: 12, padding: '16px 20px', textAlign: 'center', minWidth: 130, border: '3px solid #0004' }}>
        <div style={{ fontSize: 34 }}>{d.symbol}</div>
        <b style={{ fontSize: 16 }}>{d.label}</b>
        <div style={{ fontSize: 12, opacity: .9 }}>{d.dest}</div>
      </div>
      <div>
        <h2 className="h2">{a.symbol} {a.title}</h2>
        <p className="sub" style={{ fontSize: 14, maxWidth: 620 }}>{a.text}</p>
      </div>
    </div>
  );
}

function GateStep({ v }: { v: TableView }) {
  const g = v.gate!;
  return (
    <div className="panel center anim-pop" style={{ borderColor: 'var(--gold)' }}>
      <div className="muted" style={{ fontSize: 12, letterSpacing: 2 }}>MOVEMENT STEP</div>
      <h2 className="h2" style={{ fontSize: 30, color: 'var(--gold-2)' }}>{g.roman} · {g.title}</h2>
      <p className="sub" style={{ fontSize: 14 }}>{g.text}</p>
      <button className="btn big" style={{ marginTop: 12 }}
        onClick={() => emit('action', { roomCode: v.roomCode, type: 'playStep' })}>
        ▶ Play step {g.roman}
      </button>
    </div>
  );
}

function SpotlightCard({ v }: { v: TableView }) {
  const s = v.spotlight!;
  return (
    <div className={`panel anim-in ${s.waiting ? 'pulsing' : ''}`}
      style={{ borderColor: s.waiting ? 'var(--sea-4)' : 'var(--gold)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ fontSize: 38 }}>{s.symbol}</div>
        <div>
          <h2 className="h2" style={{ fontSize: 20 }}>{s.title}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 15 }}>{s.text}</p>
          {s.result && <p style={{ margin: '6px 0 0', fontSize: 16, color: 'var(--gold-2)', fontWeight: 700 }}>{s.result}</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- end ---------------- */
function EndGame({ v }: { v: TableView }) {
  const e = v.ended!;
  const label = e.winners.map(w => FACTIONS[w].title).join(' & ');
  return (
    <div className="wrap-wide center anim-in">
      <div className="topbar"><span>Game over</span><span>{e.reason}</span></div>
      <div style={{ fontSize: 60 }}>{FACTIONS[e.winners[0]].symbol}</div>
      <h1 className="h1">{label} win!</h1>
      <p className="sub">Every seabag is turned face up</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 22 }}>
        {v.seats.map((s, i) => (
          <div className="card anim-pop" key={s.id} style={{ padding: 12, animationDelay: `${i * 60}ms` }}>
            <FactionChip f={e.factions[s.id]} />
            <div style={{ marginTop: 8, fontWeight: 700, fontSize: 17 }}>{s.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{FACTIONS[e.factions[s.id]].win}</div>
          </div>
        ))}
      </div>
      <button className="btn big" style={{ marginTop: 24 }} onClick={async () => {
        // Kills every phone's session, then opens a brand new room.
        await emit('exitGame', { roomCode: v.roomCode });
        clearSession(v.roomCode);
        const r = await emit('createRoom', {});
        if (r?.roomCode) lastRoom.set(r.roomCode);
        location.reload();
      }}>
        ⚓ Exit game &amp; start a fresh voyage
      </button>
      <p className="sub">Ends every player's session and opens a new room code.</p>

      <div className="panel" style={{ marginTop: 22, textAlign: 'left', maxWidth: 900, marginInline: 'auto' }}>
        <h2 className="h2" style={{ fontSize: 18 }}>Captain's log</h2>
        <div className="log">{v.log.map((l, i) => <div key={i}>· {l.text}</div>)}</div>
      </div>
    </div>
  );
}
