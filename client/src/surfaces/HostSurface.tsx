import { useEffect, useState } from 'react';
import type { HostView } from '@ftk/shared';
import { emit, lastRoom } from '../lib/socket.js';
import { useView } from '../lib/useView.js';

export function HostSurface() {
  const view = useView<HostView>();
  const [code, setCode] = useState(lastRoom.get());

  useEffect(() => {
    const room = lastRoom.get();
    if (room) emit('attachHost', { roomCode: room });
  }, []);

  async function attach() {
    const r = await emit('attachHost', { roomCode: code.trim().toUpperCase() });
    if (r?.ok) lastRoom.set(code.trim().toUpperCase());
  }

  if (!view) {
    return (
      <div className="wrap phone" style={{ paddingTop: 60 }}>
        <div className="card center" style={{ background: '#20242b', color: '#e8e8ea' }}>
          <h1 className="h2">⚙️ Host controls</h1>
          <p className="sub">Admin escape hatch — not a game role.</p>
          <input className="input" style={{ marginTop: 12, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 4 }}
            maxLength={4} value={code} placeholder="ROOM" onChange={e => setCode(e.target.value)} />
          <button className="btn block" style={{ marginTop: 12 }} onClick={attach}>Attach</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="topbar">
        <span>⚙️ Host · Room {view.roomCode}</span>
        <span>Round {view.round} · {view.phase}</span>
      </div>
      <div className="card" style={{ background: '#20242b', color: '#e8e8ea' }}>
        <div className="muted" style={{ fontSize: 11 }}>ESCAPE HATCHES</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn" style={{ background: '#3a3f4a', color: '#e8e8ea' }}
            disabled={!view.canUndo} onClick={() => emit('hostUndo', { roomCode: view.roomCode })}>
            ↩ Undo last action
          </button>
          <button className="btn" style={{ background: '#3a3f4a', color: '#e8e8ea' }}
            onClick={() => emit('hostForceAdvance', { roomCode: view.roomCode })}>
            ⏭ Force-advance phase
          </button>
          <button className="btn danger"
            onClick={() => emit('hostEndGame', { roomCode: view.roomCode, winners: 'sailor', reason: 'Host ended & revealed.' })}>
            🏁 End &amp; reveal
          </button>
        </div>

        <div className="muted" style={{ fontSize: 11, margin: '16px 0 6px' }}>SEATS & CONNECTION</div>
        {view.connected.map(c => {
          const seat = view.seats.find(s => s.id === c.seatId);
          return (
            <div key={c.seatId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333842', fontSize: 13 }}>
              <span>{c.name}{seat?.isCaptain && ' · Captain'}</span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="muted">🔫 {seat?.guns ?? '—'}</span>
                <span style={{ color: c.connected ? '#5dcaa5' : '#e0b64a' }}>
                  {c.connected ? '● online' : '○ reconnecting'}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <h2 className="h2" style={{ marginTop: 16, fontSize: 14 }}>Log</h2>
      <div className="log">{view.log.slice(-12).map((l, i) => <div key={i}>{l.text}</div>)}</div>
    </div>
  );
}
