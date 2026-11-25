import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  PLAYERS_META,
  BOT_NAMES,
  LADDER_MAP,
  SNAKE_MAP,
  TURN_DURATION_MS,
} from './src/boardData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 4175;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];
  let filePath = path.join(__dirname, cleanUrl === '/' ? 'index.html' : cleanUrl);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(resolved).pipe(res);
  });
});

const wss = new WebSocketServer({ server });

// Active multiplayer rooms: code -> room
const rooms = new Map();
const clients = new Map(); // ws -> { id, roomCode, seatIndex, name }

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return rooms.has(code) ? makeRoomCode() : code;
}

function send(ws, payload) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastOnlineCount() {
  const count = wss.clients.size;
  const msg = JSON.stringify({ type: 'online_count', count });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function makeEmptySeat(idx) {
  const meta = PLAYERS_META[idx];
  return {
    id: idx,
    key: meta.key,
    colorHex: meta.colorHex,
    avatar: meta.avatar,
    kind: 'vacant', // 'human' | 'bot' | 'vacant'
    name: 'Open Seat',
    clientId: null,
    connected: false,
    position: 0,
    rolls: 0,
    sixes: 0,
    laddersClimbed: 0,
    snakesBitten: 0,
  };
}

function serializeRoom(room) {
  return {
    code: room.code,
    roomName: room.roomName,
    hostSeat: room.hostSeat,
    phase: room.phase, // 'lobby' | 'playing' | 'finished'
    turnIndex: room.turnIndex,
    consecutiveSixes: room.consecutiveSixes,
    turnDeadline: room.turnDeadline,
    turnBusy: room.turnBusy,
    winnerId: room.winnerId,
    lastEvent: room.lastEvent,
    recentLogs: room.recentLogs.slice(-4),
    seats: room.seats.map((s) => ({
      id: s.id,
      key: s.key,
      colorHex: s.colorHex,
      avatar: s.avatar,
      kind: s.kind,
      name: s.name,
      connected: s.connected,
      position: s.position,
      rolls: s.rolls,
      sixes: s.sixes,
      laddersClimbed: s.laddersClimbed,
      snakesBitten: s.snakesBitten,
    })),
  };
}

function broadcastRoom(room, extra = null) {
  const state = serializeRoom(room);
  for (const [ws, info] of clients.entries()) {
    if (info.roomCode === room.code) {
      send(ws, {
        type: 'room_state',
        state,
        mySeat: info.seatIndex,
        event: extra,
      });
    }
  }
}

function clearRoomTimers(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  if (room.unlockTimer) {
    clearTimeout(room.unlockTimer);
    room.unlockTimer = null;
  }
}

function activeSeats(room) {
  return room.seats.filter((s) => s.kind !== 'vacant');
}

function nextActiveSeatIndex(room, fromIndex) {
  for (let offset = 1; offset <= 4; offset++) {
    const idx = (fromIndex + offset) % 4;
    if (room.seats[idx].kind !== 'vacant') return idx;
  }
  return fromIndex;
}

function scheduleTurn(room) {
  clearRoomTimers(room);
  if (room.phase !== 'playing') return;

  const seat = room.seats[room.turnIndex];
  if (!seat || seat.kind === 'vacant') {
    room.turnIndex = nextActiveSeatIndex(room, room.turnIndex);
    scheduleTurn(room);
    return;
  }

  room.turnBusy = false;
  room.turnDeadline = Date.now() + TURN_DURATION_MS;
  broadcastRoom(room);

  if (seat.kind === 'bot') {
    room.botTimer = setTimeout(() => {
      executeRoll(room, seat.id, false);
    }, 1050);
  } else {
    room.turnTimer = setTimeout(() => {
      executeRoll(room, seat.id, true);
    }, TURN_DURATION_MS + 150);
  }
}

function executeRoll(room, seatId, isAuto = false) {
  if (room.phase !== 'playing' || room.turnBusy || room.turnIndex !== seatId) return;
  const seat = room.seats[seatId];
  if (!seat || seat.kind === 'vacant') return;

  clearRoomTimers(room);
  room.turnBusy = true;

  const roll = crypto.randomInt(1, 7);
  seat.rolls += 1;
  if (roll === 6) seat.sixes += 1;

  const from = seat.position;
  let stepTarget = from + roll;
  let finalPos = from;
  let outcome = 'move'; // 'move' | 'ladder' | 'snake' | 'overshoot' | 'triple_six' | 'win'
  let ladder = null;
  let snake = null;
  let extraTurn = false;
  let logText = '';

  // Classic rule: 3 consecutive sixes forfeits the 3rd move and ends turn
  if (roll === 6 && room.consecutiveSixes >= 2) {
    outcome = 'triple_six';
    stepTarget = from;
    finalPos = from;
    room.consecutiveSixes = 0;
    extraTurn = false;
    logText = `${seat.name} rolled 3 sixes in a row! Turn forfeited.`;
  } else if (stepTarget > 100) {
    outcome = 'overshoot';
    stepTarget = from;
    finalPos = from;
    extraTurn = roll === 6;
    room.consecutiveSixes = roll === 6 ? room.consecutiveSixes + 1 : 0;
    logText = `${seat.name} rolled ${roll} (needs exact ${100 - from} to win).`;
  } else {
    finalPos = stepTarget;
    if (LADDER_MAP.has(stepTarget)) {
      ladder = LADDER_MAP.get(stepTarget);
      finalPos = ladder.to;
      outcome = 'ladder';
      seat.laddersClimbed += 1;
      logText = `${seat.name} rolled ${roll} & climbed ladder ${ladder.from} → ${ladder.to}!`;
    } else if (SNAKE_MAP.has(stepTarget)) {
      snake = SNAKE_MAP.get(stepTarget);
      finalPos = snake.to;
      outcome = 'snake';
      seat.snakesBitten += 1;
      logText = `${seat.name} rolled ${roll} & got bitten by ${snake.name} (${snake.from} → ${snake.to})!`;
    } else if (finalPos === 100) {
      outcome = 'win';
      logText = `${seat.name} rolled ${roll} and reached 100! 👑`;
    } else {
      logText = `${seat.name} rolled ${roll} → tile ${finalPos}${isAuto ? ' (auto)' : ''}`;
    }

    seat.position = finalPos;

    if (outcome === 'win') {
      room.phase = 'finished';
      room.winnerId = seat.id;
      room.consecutiveSixes = 0;
      extraTurn = false;
    } else if (roll === 6) {
      extraTurn = true;
      room.consecutiveSixes += 1;
    } else {
      extraTurn = false;
      room.consecutiveSixes = 0;
    }
  }

  const evt = {
    seq: ++room.seq,
    type: 'roll_result',
    seatId,
    playerName: seat.name,
    roll,
    from,
    stepTarget,
    finalPos,
    outcome,
    ladder,
    snake,
    extraTurn,
    isAuto,
    consecutiveSixes: room.consecutiveSixes,
    logText,
  };

  room.lastEvent = evt;
  room.recentLogs.push({
    id: evt.seq,
    seatId,
    colorHex: seat.colorHex,
    avatar: seat.avatar,
    text: logText,
    outcome,
  });
  if (room.recentLogs.length > 12) room.recentLogs.shift();

  // Compute animation duration before unlocking next turn
  const hopMs = outcome === 'overshoot' || outcome === 'triple_six' ? 950 : 950 + roll * 240;
  const specialMs = outcome === 'ladder' ? 1250 : outcome === 'snake' ? 2750 : outcome === 'win' ? 1400 : 250;
  const totalAnimMs = hopMs + specialMs;

  broadcastRoom(room, evt);

  if (room.phase === 'playing') {
    room.unlockTimer = setTimeout(() => {
      if (room.phase !== 'playing') return;
      if (!extraTurn) {
        room.turnIndex = nextActiveSeatIndex(room, seatId);
      }
      scheduleTurn(room);
    }, totalAnimMs);
  }
}

function startMatch(room) {
  clearRoomTimers(room);
  room.phase = 'playing';
  room.winnerId = null;
  room.consecutiveSixes = 0;
  room.lastEvent = null;
  room.recentLogs = [];

  for (const s of room.seats) {
    s.position = 0;
    s.rolls = 0;
    s.sixes = 0;
    s.laddersClimbed = 0;
    s.snakesBitten = 0;
  }

  const firstSeat = activeSeats(room)[0];
  room.turnIndex = firstSeat ? firstSeat.id : 0;
  scheduleTurn(room);
}

function leaveCurrentRoom(ws) {
  const info = clients.get(ws);
  if (!info || !info.roomCode) return;
  const room = rooms.get(info.roomCode);
  info.roomCode = null;
  const prevSeat = info.seatIndex;
  info.seatIndex = -1;

  if (!room) return;

  const seat = room.seats[prevSeat];
  if (seat && seat.clientId === info.id) {
    if (room.phase === 'lobby') {
      room.seats[prevSeat] = makeEmptySeat(prevSeat);
      // Reassign host if host left
      if (room.hostSeat === prevSeat) {
        const nextHuman = room.seats.find((s) => s.kind === 'human');
        room.hostSeat = nextHuman ? nextHuman.id : -1;
      }
    } else {
      // Mid-game disconnect: mark disconnected, convert to bot after short grace if still gone
      seat.connected = false;
    }
  }

  const anyConnectedHuman = room.seats.some((s) => s.kind === 'human' && s.connected);
  if (!anyConnectedHuman) {
    clearRoomTimers(room);
    rooms.delete(room.code);
  } else {
    broadcastRoom(room);
  }
}

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  clients.set(ws, { id: clientId, roomCode: null, seatIndex: -1, name: 'Player' });
  broadcastOnlineCount();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const info = clients.get(ws);
    if (!info) return;

    if (msg.type === 'create_room') {
      leaveCurrentRoom(ws);
      const name = String(msg.name || 'Player').trim().slice(0, 18) || 'Player';
      const roomName = String(msg.roomName || '').trim().slice(0, 24);
      const code = makeRoomCode();
      const seats = [0, 1, 2, 3].map((i) => makeEmptySeat(i));
      seats[0].kind = 'human';
      seats[0].name = name;
      seats[0].clientId = info.id;
      seats[0].connected = true;

      const room = {
        code,
        roomName: roomName || `Jungle ${code}`,
        hostSeat: 0,
        phase: 'lobby',
        turnIndex: 0,
        consecutiveSixes: 0,
        turnDeadline: 0,
        turnBusy: false,
        winnerId: null,
        lastEvent: null,
        recentLogs: [],
        seq: 0,
        seats,
        turnTimer: null,
        botTimer: null,
        unlockTimer: null,
      };
      rooms.set(code, room);
      info.roomCode = code;
      info.seatIndex = 0;
      info.name = name;
      broadcastRoom(room);
      return;
    }

    if (msg.type === 'join_room') {
      leaveCurrentRoom(ws);
      const query = String(msg.codeOrName || '').trim().toLowerCase();
      const name = String(msg.name || 'Player').trim().slice(0, 18) || 'Player';

      let targetRoom = rooms.get(query.toUpperCase());
      if (!targetRoom) {
        for (const r of rooms.values()) {
          if (r.roomName.toLowerCase() === query) {
            targetRoom = r;
            break;
          }
        }
      }

      if (!targetRoom) {
        send(ws, { type: 'error', message: 'Room not found. Check the code or room name.' });
        return;
      }

      // Allow rejoin if matching disconnected player name
      let seat = targetRoom.seats.find(
        (s) => s.kind === 'human' && !s.connected && s.name.toLowerCase() === name.toLowerCase()
      );
      if (seat) {
        seat.clientId = info.id;
        seat.connected = true;
      } else {
        if (targetRoom.phase !== 'lobby') {
          send(ws, { type: 'error', message: 'Match already started in this room.' });
          return;
        }
        seat = targetRoom.seats.find((s) => s.kind === 'vacant');
        if (!seat) {
          send(ws, { type: 'error', message: 'Room is full (4/4 players).' });
          return;
        }
        seat.kind = 'human';
        seat.name = name;
        seat.clientId = info.id;
        seat.connected = true;
      }

      info.roomCode = targetRoom.code;
      info.seatIndex = seat.id;
      info.name = name;
      broadcastRoom(targetRoom, { type: 'player_joined', seatId: seat.id, name: seat.name });
      return;
    }

    const room = info.roomCode ? rooms.get(info.roomCode) : null;
    if (!room) return;

    if (msg.type === 'add_bot') {
      if (info.seatIndex !== room.hostSeat || room.phase !== 'lobby') return;
      const vacant = room.seats.find((s) => s.kind === 'vacant');
      if (!vacant) return;
      const used = new Set(room.seats.map((s) => s.name));
      const botName = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${vacant.id + 1}`;
      vacant.kind = 'bot';
      vacant.name = botName;
      vacant.connected = true;
      broadcastRoom(room);
      return;
    }

    if (msg.type === 'remove_bot') {
      if (info.seatIndex !== room.hostSeat || room.phase !== 'lobby') return;
      const idx = Number(msg.seatId);
      if (room.seats[idx] && room.seats[idx].kind === 'bot') {
        room.seats[idx] = makeEmptySeat(idx);
        broadcastRoom(room);
      }
      return;
    }

    if (msg.type === 'start_game') {
      if (info.seatIndex !== room.hostSeat || room.phase !== 'lobby') return;
      if (activeSeats(room).length < 2) {
        send(ws, { type: 'error', message: 'Add at least 1 friend or AI bot before starting!' });
        return;
      }
      startMatch(room);
      return;
    }

    if (msg.type === 'roll_dice') {
      executeRoll(room, info.seatIndex, false);
      return;
    }

    if (msg.type === 'request_rematch') {
      if (info.seatIndex !== room.hostSeat) return;
      startMatch(room);
      return;
    }

    if (msg.type === 'send_emoji') {
      const emoji = String(msg.emoji || '🔥').slice(0, 8);
      const seat = room.seats[info.seatIndex];
      if (!seat) return;
      for (const [cWs, cInfo] of clients.entries()) {
        if (cInfo.roomCode === room.code) {
          send(cWs, {
            type: 'emoji_burst',
            seatId: seat.id,
            senderName: seat.name,
            colorHex: seat.colorHex,
            emoji,
          });
        }
      }
      return;
    }

    if (msg.type === 'leave_room') {
      leaveCurrentRoom(ws);
    }
  });

  ws.on('close', () => {
    leaveCurrentRoom(ws);
    clients.delete(ws);
    broadcastOnlineCount();
  });
});

server.listen(PORT, () => {
  console.log(`Snakes & Ladders 3D Enchanted Jungle running on http://localhost:${PORT}`);
});
