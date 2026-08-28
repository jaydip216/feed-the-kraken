import { useEffect, useState } from 'react';
import type { PlayerView } from '@ftk/shared';
import { emit, tokenStore, lastRoom, clearSession, socket } from '../lib/socket.js';
import { useView } from '../lib/useView.js';
import { FactionChip, factionWin } from './Faction.js';
import { DIRECTIONS, NAV_ACTIONS, MAP_ACTIONS, SYMBOLS } from '@ftk/shared';

export function PlayerSurface() {
  const view = useView<PlayerView>();
  const [joined, setJoined] = useState(false);
  const [ended, setEnded] = useState(false);

  // Auto-reconnect using stored token (Android sleep/drop resilience).
  useEffect(() => {
    const room = lastRoom.get();
    const token = room ? tokenStore.get(room) : undefined;
    if (room && token) {
      emit('joinRoom', { roomCode: room, name: '', reconnectToken: token })
        .then(r => { if (r?.ok) setJoined(true); });
    }
  }, []);

  // The table ended the session — drop the seat and go back to the join screen.
  useEffect(() => {
    const onEnded = () => { clearSession(); setJoined(false); setEnded(true); };
    socket.on('sessionEnded', onEnded);
    return () => { socket.off('sessionEnded', onEnded); };
  }, []);

  if (ended) return <SessionOver onAgain={() => setEnded(false)} />;
  if (!joined && !view) return <Join onJoined={() => setJoined(true)} />;
  if (!view) return <div className="wrap center" style={{ paddingTop: 80 }}>Connecting…</div>;
  return <PlayerBody v={view} />;
}

function Join({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState(lastRoom.get());
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  async function go() {
    const roomCode = code.trim().toUpperCase();
    const r = await emit('joinRoom', { roomCode, name: name.trim() });
    if (r?.ok) {
      lastRoom.set(roomCode);
      if (r.reconnectToken) tokenStore.set(roomCode, r.reconnectToken);
      onJoined();
    } else setErr(r?.error || 'Could not join');
  }
  return (
    <div className="wrap phone" style={{ paddingTop: 50 }}>
      <div className="card center">
        <div style={{ fontSize: 34 }}>🐙</div>
        <h1 className="h2">Take a seat</h1>
        <p className="sub">Enter the room code shown on the table</p>
        <input className="input" style={{ marginTop: 14, letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center' }}
          value={code} maxLength={4} placeholder="CODE" onChange={e => setCode(e.target.value)} />
        <input className="input" style={{ marginTop: 10 }} value={name} placeholder="Your name"
          maxLength={16} onChange={e => setName(e.target.value)} />
        {err && <p className="sub" style={{ color: 'var(--pirate)' }}>{err}</p>}
        <button className="btn block" style={{ marginTop: 14 }} disabled={!code || !name} onClick={go}>Join</button>
      </div>
    </div>
  );
}

function PlayerBody({ v }: { v: PlayerView }) {
  return (
    <div className="wrap phone">
      <div className="topbar">
        <span>👤 {v.name}{v.isCaptain && ' · Captain'}</span>
        <span>Round {v.round}</span>
      </div>
      {v.faction &&
        <div className="secret anim-in" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: 1 }}>{SYMBOLS.seabag} YOUR SEABAG · ONLY YOU SEE THIS</div>
          <div style={{ marginTop: 10 }}><FactionChip f={v.faction} /></div>
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{factionWin(v.faction)} · {SYMBOLS.gun} {v.guns}</div>
          {/* A cultist converted mid-game recognises their master (rulebook p.15). */}
          {v.cultLeaderName &&
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--sea-4)', fontSize: 12 }}>
              Your master is <b style={{ color: 'var(--cult)' }}>{v.cultLeaderName}</b>
            </div>}
          {v.myConverts && v.myConverts.length > 0 &&
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--sea-4)', fontSize: 12 }}>
              You have converted: <b style={{ color: 'var(--cultist)' }}>{v.myConverts.join(', ')}</b>
            </div>}
          {!v.offDuty ? null : <div className="badge b-off" style={{ marginTop: 8, display: 'inline-block' }}>{SYMBOLS.offDuty} Off-duty this round</div>}
        </div>}
      <Prompt v={v} />
    </div>
  );
}

function Prompt({ v }: { v: PlayerView }) {
  const p = v.prompt;
  switch (p.kind) {
    case 'eliminated':
      return <div className="card center"><div style={{ fontSize: 30 }}>🐙</div>
        <b>You're off the ship</b>
        <p className="sub">All actions disabled — but you still win with your team. Stay silent.</p></div>;
    case 'pirateGathering':
      return <PirateGathering v={v} />;
    case 'appoint':
      return <Appoint v={v} />;
    case 'lockGuns':
      return <LockGuns v={v} />;
    case 'mutinyResult':
      return <MutinyResult v={v} />;
    case 'tieResolution':
      return <TieResolution v={v} />;
    case 'navDiscard':
      return <NavDiscard v={v} />;
    case 'navChoose':
      return <NavChoose v={v} />;
    case 'chooseTarget':
      return <ChooseTarget v={v} />;
    case 'cabinResult':
      return <CabinResult v={v} />;
    case 'mermaidView':
      return <CardsView v={v} action="ackMermaid" title="The mermaid reveals the last discards" />;
    case 'telescopeView':
      return <TelescopeView v={v} />;
    case 'cultConvert':
      return <CultConvert v={v} />;
    case 'cultGuns':
      return <CultGuns v={v} />;
    case 'cultCabin':
      return <CultCabin v={v} />;
    case 'lobby':
      return <div className="card center"><b>You're in.</b><p className="sub">Waiting for the host to start.</p></div>;
    case 'idle':
    default:
      return <div className="card center"><div style={{ fontSize: 26 }}>⏳</div>
        <b>{p.title || 'Nothing to do right now'}</b>
        <p className="sub">Keep the table talk going out loud. Your phone lights up when it's your move.</p></div>;
  }
}

function PirateGathering({ v }: { v: PlayerView }) {
  return (
    <div className="card" style={{ background: '#3a1512', color: 'var(--parch)' }}>
      <b style={{ color: '#f0a99f' }}>💀 Secret pirate gathering</b>
      <p style={{ fontSize: 12, color: '#e0b3ab' }}>
        You are {(v.teammates?.length ?? 1)} pirate{(v.teammates?.length ?? 1) > 1 ? 's' : ''}. Memorize your crew — shown once.
      </p>
      {(v.teammates || []).map(t => (
        <div className="seat" key={t.seatId} style={{ background: 'rgba(255,255,255,.06)' }}>
          <span className="num" style={{ background: 'var(--pirate)' }}>P</span>{t.name}
          {t.seatId === v.seatId && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#e0b3ab' }}>you</span>}
        </div>
      ))}
      <button className="btn danger block" style={{ marginTop: 12 }}
        onClick={() => emit('ackPirateGathering', { roomCode: v.roomCode })}>
        I've memorized — dismiss
      </button>
    </div>
  );
}

function Appoint({ v }: { v: PlayerView }) {
  const eligible: { seatId: string; name: string }[] = v.prompt.data?.eligible ?? [];
  const [lt, setLt] = useState<string>('');
  const [nav, setNav] = useState<string>('');
  const pick = (role: 'lt' | 'nav', id: string) => role === 'lt' ? setLt(id) : setNav(id);
  const ready = lt && nav && lt !== nav;
  const list = (role: 'lt' | 'nav', sel: string) => (
    <div>
      {eligible.map(e => {
        const disabled = role === 'lt' ? e.seatId === nav : e.seatId === lt;
        const on = sel === e.seatId;
        return (
          <div key={e.seatId} className="seat"
            style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .4 : 1,
              border: on ? '1px solid var(--gold)' : '1px solid transparent' }}
            onClick={() => !disabled && pick(role, e.seatId)}>
            {e.name}<span style={{ marginLeft: 'auto' }}>{on ? '✓' : '○'}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="card">
      <b>Appoint your navigation team</b>
      <p className="sub">Off-duty players are already filtered out.</p>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, margin: '10px 0 5px' }}>LIEUTENANT</div>
      {list('lt', lt)}
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, margin: '10px 0 5px' }}>NAVIGATOR</div>
      {list('nav', nav)}
      <button className="btn block" style={{ marginTop: 12 }} disabled={!ready}
        onClick={() => emit('action', { roomCode: v.roomCode, type: 'appoint', payload: { lieutenant: lt, navigator: nav } })}>
        Confirm team
      </button>
    </div>
  );
}

function LockGuns({ v }: { v: PlayerView }) {
  const d = v.prompt.data ?? {};
  const [guns, setGuns] = useState(0);
  const locked = !!d.locked;
  const max = d.maxGuns ?? 0;
  if (locked) {
    return <div className="card center">
      <div style={{ fontSize: 26 }}>🔒</div>
      <b>Locked in: {d.committed} gun{d.committed === 1 ? '' : 's'}</b>
      <p className="sub">Counts reveal when everyone has committed. No changes now.</p>
    </div>;
  }
  return (
    <div className="card center">
      <b>Commit your guns</b>
      <p className="sub">Secret until everyone locks in · {d.threshold}+ triggers a mutiny</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, margin: '14px 0' }}>
        <button className="btn ghost" style={{ width: 46, padding: 8 }} onClick={() => setGuns(g => Math.max(0, g - 1))}>−</button>
        <div style={{ fontSize: 40, fontWeight: 700, minWidth: 56 }}>{guns}</div>
        <button className="btn ghost" style={{ width: 46, padding: 8 }} onClick={() => setGuns(g => Math.min(max, g + 1))}>+</button>
      </div>
      <p className="sub">You have {max} gun{max === 1 ? '' : 's'}</p>
      <button className="btn lock block" style={{ marginTop: 8 }}
        onClick={() => emit('action', { roomCode: v.roomCode, type: 'lockGuns', payload: { guns } })}>
        🔒 Lock in
      </button>
    </div>
  );
}

function MutinyResult({ v }: { v: PlayerView }) {
  const d = v.prompt.data ?? {};
  return (
    <div className="card center">
      <div style={{ fontSize: 26 }}>{d.success ? '⚔️' : '🕊️'}</div>
      <b>{d.success ? 'Mutiny succeeded' : 'No mutiny'}</b>
      <p className="sub">{d.sum} guns revealed vs threshold {d.threshold}</p>
      {d.canContinue
        ? <button className="btn block" style={{ marginTop: 10 }}
            onClick={() => emit('action', { roomCode: v.roomCode, type: 'mutinyContinue' })}>
            {d.success ? 'Determine new captain' : 'Proceed to navigation'}
          </button>
        : <p className="muted" style={{ fontSize: 12 }}>Waiting for the captain to continue…</p>}
    </div>
  );
}

function TieResolution({ v }: { v: PlayerView }) {
  const tied: { seatId: string; name: string }[] = v.prompt.data?.tied ?? [];
  return (
    <div className="card">
      <b>Break the tie</b>
      <p className="sub">Choose a tied player to lower their hand (they won't become captain).</p>
      {tied.map(t => (
        <div key={t.seatId} className="seat" style={{ cursor: 'pointer' }}
          onClick={() => emit('action', { roomCode: v.roomCode, type: 'tieResolution', payload: { loser: t.seatId } })}>
          {t.name}<span style={{ marginLeft: 'auto' }}>lower ↓</span>
        </div>
      ))}
    </div>
  );
}

// ---- navigation card visuals ----
const dirOf = (c: any) => DIRECTIONS[c.direction as 'north' | 'east' | 'west'];
function NavCardTile({ c, selected, onClick }: { c: any; selected?: boolean; onClick?: () => void }) {
  const d = DIRECTIONS[c.direction as 'north' | 'east' | 'west'];
  const a = NAV_ACTIONS[c.action as keyof typeof NAV_ACTIONS];
  return (
    <div className={`navcard${selected ? ' sel' : ''}`} style={{ background: d.color }} onClick={onClick}>
      <div className="sym">{d.symbol}</div>
      <div className="dir">{d.label}</div>
      <div className="act">{a.symbol} {a.title}</div>
      <div className="txt">{a.text}</div>
      <div style={{ fontSize: 10, opacity: .8, marginTop: 6 }}>sails toward {d.dest}</div>
    </div>
  );
}

// Tap a card to select it, then confirm — much clearer than two "Discard X" buttons.
function CardPicker({ v, cards, mode }: { v: PlayerView; cards: any[]; mode: 'discard' | 'keep' }) {
  const [sel, setSel] = useState<string>('');
  const chosen = cards.find(c => c.id === sel);
  const other = cards.find(c => c.id !== sel);
  const confirm = () => {
    if (!chosen) return;
    if (mode === 'discard') emit('action', { roomCode: v.roomCode, type: 'navDiscard', payload: { cardId: chosen.id } });
    else emit('action', { roomCode: v.roomCode, type: 'navChoose', payload: { cardId: chosen.id } });
  };
  return (
    <>
      <div style={{ display: 'flex', gap: 10, margin: '12px 0' }}>
        {cards.map(c => <NavCardTile key={c.id} c={c} selected={sel === c.id} onClick={() => setSel(c.id)} />)}
      </div>
      <p className="sub" style={{ minHeight: 34, textAlign: 'center' }}>
        {!chosen ? 'Tap a card to select it.'
          : mode === 'discard'
            ? <>Discarding <b>{dirOf(chosen).label}</b> into the Deep Sea — keeping <b>{other ? dirOf(other).label : '—'}</b>.</>
            : <>Keeping <b>{dirOf(chosen).label}</b> for the captain to reveal.</>}
      </p>
      <button className="btn block big" disabled={!chosen} onClick={confirm}>
        {mode === 'discard' ? '🌊 Confirm discard' : '✔ Confirm this card'}
      </button>
    </>
  );
}

function NavDiscard({ v }: { v: PlayerView }) {
  const cards: any[] = v.prompt.data?.cards ?? [];
  return (
    <div className="card">
      <b>{v.prompt.title}</b>
      <p className="sub">{SYMBOLS.silence} Stay silent. Shuffling to fake "I had no choice" is not allowed.</p>
      <CardPicker v={v} cards={cards} mode="discard" />
    </div>
  );
}

function NavChoose({ v }: { v: PlayerView }) {
  const cards: any[] = v.prompt.data?.cards ?? [];
  return (
    <div className="card">
      <b>{v.prompt.title}</b>
      <p className="sub">The card you keep is the one the captain reveals to the crew.</p>
      <CardPicker v={v} cards={cards} mode="keep" />
      <button className="btn danger block" style={{ marginTop: 14 }}
        onClick={() => emit('action', { roomCode: v.roomCode, type: 'denial' })}>
        🏊 Denial of command — jump overboard
      </button>
      <p className="sub center" style={{ fontSize: 11 }}>
        You leave the game and stay silent forever; the captain picks an emergency navigator.
      </p>
    </div>
  );
}

function ChooseTarget({ v }: { v: PlayerView }) {
  const d = v.prompt.data ?? {};
  const targets: { seatId: string; name: string }[] = d.targets ?? [];
  const actionType: Record<string, string> = {
    cabinSearch: 'mapCabinPick', flogging: 'mapFlogPick', offWithTongue: 'mapTonguePick',
    feedTheKraken: 'mapFeedPick', mermaid: 'mermaidPick', telescope: 'telescopePick', emergencyNav: 'emergencyNav',
  };
  const type = actionType[d.action] ?? 'mapCabinPick';
  const payloadKey = d.action === 'emergencyNav' ? 'navId' : 'targetId';
  const info = (MAP_ACTIONS as any)[d.action] ?? (NAV_ACTIONS as any)[d.action];
  return (
    <div className="card">
      <b>{info ? `${info.symbol} ${info.title}` : v.prompt.title}</b>
      {info && <p className="sub">{info.text}</p>}
      {targets.map(t => (
        <div key={t.seatId} className="seat" style={{ cursor: 'pointer' }}
          onClick={() => emit('action', { roomCode: v.roomCode, type, payload: { [payloadKey]: t.seatId } })}>
          {t.name}<span style={{ marginLeft: 'auto' }}>choose →</span>
        </div>
      ))}
    </div>
  );
}

function CabinResult({ v }: { v: PlayerView }) {
  const d = v.prompt.data ?? {};
  return (
    <div className="card center">
      <b>{d.name}'s seabag</b>
      <div style={{ margin: '12px 0' }}><FactionChip f={d.faction} /></div>
      {/* p.13: a player converted since the deal signals it with a tentacle gesture. */}
      {d.tentacleSignal &&
        <div style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 10,
          background: '#20280f', color: '#e6c65a', fontSize: 13, textAlign: 'left' }}>
          🐙 {d.name} makes the <b>tentacle gesture</b> — the chip is what they were
          dealt, but they have since been <b>converted to the Cult</b>.
        </div>}
      <p className="sub">Only you saw this. What you tell the crew is up to you.</p>
      <button className="btn block" onClick={() => emit('action', { roomCode: v.roomCode, type: 'ackCabinResult' })}>Done</button>
    </div>
  );
}

function CardsView({ v, action, title }: { v: PlayerView; action: string; title: string }) {
  const cards: any[] = v.prompt.data?.cards ?? [];
  return (
    <div className="card">
      <b>{title}</b>
      <p className="sub">You may talk about what you saw — truthfully or not.</p>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        {cards.length ? cards.map((c, i) => <NavCardTile key={i} c={c} />) : <p className="muted">No cards in the Deep Sea yet.</p>}
      </div>
      <button className="btn block" onClick={() => emit('action', { roomCode: v.roomCode, type: action })}>Done</button>
    </div>
  );
}

function TelescopeView({ v }: { v: PlayerView }) {
  const c = v.prompt.data?.card;
  return (
    <div className="card">
      <b>Top of the draw pile</b>
      <p className="sub">Leave it, or discard it to the Deep Sea. You may talk about it — or bluff.</p>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {c ? <NavCardTile c={c} /> : <p className="muted">Draw pile is empty.</p>}
      </div>
      <button className="btn block" onClick={() => emit('action', { roomCode: v.roomCode, type: 'telescopeDecide', payload: { discard: false } })}>Leave it on top</button>
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => emit('action', { roomCode: v.roomCode, type: 'telescopeDecide', payload: { discard: true } })}>Discard to Deep Sea</button>
    </div>
  );
}

function CultConvert({ v }: { v: PlayerView }) {
  const targets: { seatId: string; name: string }[] = v.prompt.data?.targets ?? [];
  return (
    <div className="card" style={{ background: '#20280f', color: 'var(--parch)' }}>
      <b style={{ color: '#e6c65a' }}>🐙 Conversion to Cult</b>
      <p style={{ fontSize: 12, color: '#c9c39a' }}>Choose a convertible player. Examined players can't be converted.</p>
      {targets.length ? targets.map(t => (
        <div key={t.seatId} className="seat" style={{ background: 'rgba(255,255,255,.05)', cursor: 'pointer' }}
          onClick={() => emit('action', { roomCode: v.roomCode, type: 'cultConvert', payload: { targetId: t.seatId } })}>
          {t.name}<span style={{ marginLeft: 'auto' }}>convert →</span>
        </div>
      )) : <p className="muted">No convertible players remain.</p>}
    </div>
  );
}

function CultGuns({ v }: { v: PlayerView }) {
  const d = v.prompt.data ?? {};
  const targets: { seatId: string; name: string }[] = d.targets ?? [];
  return (
    <div className="card" style={{ background: '#20280f', color: 'var(--parch)' }}>
      <b style={{ color: '#e6c65a' }}>🔫 The cult's guns stash</b>
      <p style={{ fontSize: 12, color: '#c9c39a' }}>Hand out {d.remaining} more gun{d.remaining === 1 ? '' : 's'} from the supply (tap a player per gun).</p>
      {targets.map(t => (
        <div key={t.seatId} className="seat" style={{ background: 'rgba(255,255,255,.05)', cursor: 'pointer' }}
          onClick={() => emit('action', { roomCode: v.roomCode, type: 'cultGunsGive', payload: { targetId: t.seatId } })}>
          {t.name}<span style={{ marginLeft: 'auto' }}>+1 🔫</span>
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 10 }} onClick={() => emit('action', { roomCode: v.roomCode, type: 'cultGunsDone' })}>Done distributing</button>
    </div>
  );
}

function CultCabin({ v }: { v: PlayerView }) {
  const team: { name: string; faction: any }[] = v.prompt.data?.team ?? [];
  return (
    <div className="card" style={{ background: '#20280f', color: 'var(--parch)' }}>
      <b style={{ color: '#e6c65a' }}>🔍 Cult cabin search</b>
      <p style={{ fontSize: 12, color: '#c9c39a' }}>The navigation team's true factions (only you see this):</p>
      {team.map((m, i) => (
        <div key={i} className="seat" style={{ background: 'rgba(255,255,255,.05)' }}>
          {m.name}<span style={{ marginLeft: 'auto' }}><FactionChip f={m.faction} /></span>
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 10 }} onClick={() => emit('action', { roomCode: v.roomCode, type: 'ackCultCabin' })}>Done</button>
    </div>
  );
}


function SessionOver({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="wrap phone anim-in" style={{ paddingTop: 70 }}>
      <div className="card center">
        <div style={{ fontSize: 34 }}>🐙</div>
        <b>That voyage is over</b>
        <p className="sub">The table has closed the game. Ask for the new room code to sail again.</p>
        <button className="btn block" style={{ marginTop: 12 }} onClick={onAgain}>Join a new game</button>
      </div>
    </div>
  );
}
