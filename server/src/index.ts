import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Rooms } from './rooms.js';
import { Game } from './game/GameState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const rooms = new Rooms();

// Serve the built client (single container). In dev, Vite runs separately.
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Socket rooms: broadcast redacted views to the right audiences.
function tableRoom(code: string) { return `table:${code}`; }
function hostRoom(code: string) { return `host:${code}`; }
function seatRoom(code: string, seatId: string) { return `seat:${code}:${seatId}`; }

function broadcast(g: Game) {
  io.to(tableRoom(g.roomCode)).emit('view', g.viewForTable());
  io.to(hostRoom(g.roomCode)).emit('view', g.viewForHost());
  for (const s of g.seats) {
    const v = g.viewForPlayer(s.id);
    if (v) io.to(seatRoom(g.roomCode, s.id)).emit('view', v);
  }
}

io.on('connection', (socket) => {
  socket.data.roomCode = null as string | null;
  socket.data.seatId = null as string | null;

  socket.on('createRoom', (_p, cb) => {
    const g = rooms.create();
    socket.join(tableRoom(g.roomCode));
    socket.data.roomCode = g.roomCode;
    cb?.({ roomCode: g.roomCode });
    broadcast(g);
  });

  socket.on('attachTable', (p, cb) => {
    const g = rooms.get(p.roomCode);
    if (!g) return cb?.({ ok: false, error: 'Room not found' });
    socket.join(tableRoom(g.roomCode));
    socket.data.roomCode = g.roomCode;
    cb?.({ ok: true });
    socket.emit('view', g.viewForTable());
  });

  socket.on('attachHost', (p, cb) => {
    const g = rooms.get(p.roomCode);
    if (!g) return cb?.({ ok: false, error: 'Room not found' });
    socket.join(hostRoom(g.roomCode));
    socket.data.roomCode = g.roomCode;
    cb?.({ ok: true });
    socket.emit('view', g.viewForHost());
  });

  socket.on('joinRoom', (p, cb) => {
    const g = rooms.get(p.roomCode);
    if (!g) return cb?.({ ok: false, error: 'Room not found' });
    // A double-tapped Join must not deal a second hand: prefer the reconnect
    // token, then the seat this socket already holds, and only then create one.
    let seat = p.reconnectToken ? g.reattach(p.reconnectToken) : undefined;
    if (!seat && socket.data.roomCode === g.roomCode && socket.data.seatId)
      seat = g.seat(socket.data.seatId);
    if (!seat) {
      if (g.phase !== 'lobby') return cb?.({ ok: false, error: 'Game already started' });
      seat = g.addSeat((p.name || 'Sailor').slice(0, 16));
    }
    g.markConnected(seat.id, true);
    socket.join(seatRoom(g.roomCode, seat.id));
    socket.data.roomCode = g.roomCode;
    socket.data.seatId = seat.id;
    cb?.({ ok: true, seatId: seat.id, reconnectToken: seat.reconnectToken });
    broadcast(g);
  });

  const withGame = (fn: (g: Game) => void) => {
    const g = rooms.get(socket.data.roomCode);
    if (g) { fn(g); broadcast(g); }
  };

  socket.on('setSeatingOrder', (p) => withGame(g => g.setSeatingOrder(p.seatIdsInOrder)));
  socket.on('startGame', () => withGame(g => {
    g.pushHistory();
    try { g.startGame(); } catch (e: any) { socket.emit('toast', { kind: 'error', text: e.message }); }
  }));
  socket.on('ackPirateGathering', () => withGame(g => {
    if (socket.data.seatId) g.ackGathering(socket.data.seatId);
  }));

  socket.on('action', (p) => withGame(g => {
    const seat = socket.data.seatId as string | null;
    const P = p.payload ?? {};
    // Actions that don't change turn state (locking a gun) aren't snapshotted;
    // everything else is, so host undo rewinds to a clean prior step.
    const snap = () => g.pushHistory();
    switch (p.type) {
      case 'appoint': snap(); if (seat) g.appointTeam(seat, P.lieutenant, P.navigator); break;
      case 'lockGuns': if (seat) g.lockGuns(seat, P.guns ?? 0); break;
      case 'mutinyContinue': snap(); if (seat) g.continueAfterMutiny(seat); break;
      case 'tieResolution': snap(); if (seat) g.resolveTiePick(seat, P.loser); break;
      // navigation
      case 'navDiscard': snap(); if (seat) g.navDiscard(seat, P.cardId); break;
      case 'navChoose': snap(); if (seat) g.navChoose(seat, P.cardId); break;
      case 'denial': snap(); if (seat) g.denialOfCommand(seat); break;
      case 'emergencyNav': snap(); if (seat) g.designateEmergencyNavigator(seat, P.navId); break;
      // map actions
      case 'mapCabinPick': snap(); if (seat) g.mapCabinPick(seat, P.targetId); break;
      case 'ackCabinResult': if (seat) g.ackCabinResult(seat); break;
      case 'mapFlogPick': snap(); if (seat) g.mapFlogPick(seat, P.targetId); break;
      case 'mapTonguePick': snap(); if (seat) g.mapTonguePick(seat, P.targetId); break;
      case 'mapFeedPick': snap(); if (seat) g.mapFeedPick(seat, P.targetId); break;
      // card actions
      case 'mermaidPick': snap(); if (seat) g.mermaidPick(seat, P.targetId); break;
      case 'ackMermaid': if (seat) g.ackMermaid(seat); break;
      case 'telescopePick': snap(); if (seat) g.telescopePick(seat, P.targetId); break;
      case 'telescopeDecide': snap(); if (seat) g.telescopeDecide(seat, !!P.discard); break;
      // cult rituals
      case 'cultConvert': snap(); if (seat) g.cultConvert(seat, P.targetId); break;
      case 'cultGunsGive': if (seat) g.cultGunsGive(seat, P.targetId); break;
      case 'cultGunsDone': snap(); if (seat) g.cultGunsDone(seat); break;
      case 'ackCultCabin': if (seat) g.ackCultCabin(seat); break;
      // movement steps I / II / III — pressed at the table so everyone follows along
      case 'playStep': snap(); g.playStep(); break;
      // off-duty
      case 'nextRound': snap(); g.nextRound(); break;
      default:
        socket.emit('toast', { kind: 'warn', text: `Unhandled action: ${p.type}` });
    }
  }));

  // Host escape hatches (M0: undo + a demoable end-game reveal).
  socket.on('hostForceAdvance', () => withGame(g => {
    g.pushHistory();
    if (!g.forceAdvance()) socket.emit('toast', { kind: 'warn', text: 'Nothing to force-advance right now.' });
  }));
  socket.on('hostEndGame', (p: any) => withGame(g => {
    g.pushHistory();
    g.endGame(g.winnersFor(p?.winners ?? 'sailor'), p?.reason ?? 'Host ended the game.');
  }));

  socket.on('hostUndo', () => withGame(g => g.undo()));

  // End the session for everyone: every phone's reconnect token dies with the
  // room, so nobody can rejoin the finished game. The table then opens a fresh
  // room and the crew re-joins with the new code.
  socket.on('exitGame', (p: any, cb?: (r: any) => void) => {
    const code = (p?.roomCode ?? socket.data.roomCode) as string | null;
    const g = code ? rooms.get(code) : undefined;
    if (!g) return cb?.({ ok: false, error: 'Room not found' });
    const roomCode = g.roomCode;
    io.to(tableRoom(roomCode)).emit('sessionEnded', { roomCode });
    io.to(hostRoom(roomCode)).emit('sessionEnded', { roomCode });
    for (const s of g.seats) io.to(seatRoom(roomCode, s.id)).emit('sessionEnded', { roomCode });
    rooms.delete(roomCode);
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const g = rooms.get(socket.data.roomCode);
    const seatId = socket.data.seatId;
    if (g && seatId) {
      if (g.seat(seatId)) { g.markConnected(seatId, false); broadcast(g); }
    }
  });
});

// SPA fallback (after static + api). Express 4 style.
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

server.listen(PORT, () => {
  console.log(`Feed the Kraken server on http://localhost:${PORT}`);
});
