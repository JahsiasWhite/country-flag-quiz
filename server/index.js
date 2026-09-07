import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT) || 3001;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const MAX_PLAYERS = 12;
const MAX_LOBBIES = 500;
const MAX_QUESTIONS = 300;
const MAX_NAME_LENGTH = 18;
const MAX_SCORE = 1_000_000;
const VALID_QUESTION_TYPES = new Set(['flag', 'capital', 'name']);

// A player who drops keeps their seat (and score) for this long so refreshes,
// tunnels and sleeping phones don't wipe them out of a running round.
const DISCONNECT_GRACE_MS = Number(process.env.CFQ_DISCONNECT_GRACE_MS) || 60_000;
// A lobby where nobody is connected is collected after this long.
const ABANDONED_LOBBY_TTL_MS = 15 * 60_000;
const WATCHDOG_INTERVAL_MS = 1_000;
const MAX_ROUND_MS = 3 * 60 * 60_000;
// Test hook: shrink the round watchdog so the deadline path is verifiable.
const ROUND_TIMEOUT_OVERRIDE_MS = Number(process.env.CFQ_ROUND_TIMEOUT_MS) || 0;

const lobbies = new Map(); // code -> lobby
const socketsByPlayer = new Map(); // playerId -> socket.id

function createCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!lobbies.has(code)) return code;
  }
  return null;
}

function cleanName(name) {
  const trimmed = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return trimmed || 'Player';
}

function cleanCode(code) {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

function cleanSettings(raw) {
  const settings = {};
  if (!raw || typeof raw !== 'object') return settings;
  if (typeof raw.quizType === 'string') {
    settings.quizType = raw.quizType.slice(0, 24);
  }
  if (raw.quizLength === 'all') {
    settings.quizLength = 'all';
  } else if (Number.isFinite(Number(raw.quizLength))) {
    settings.quizLength = Math.min(
      MAX_QUESTIONS,
      Math.max(1, Math.floor(Number(raw.quizLength)))
    );
  }
  if (typeof raw.ignoreIslands === 'boolean') {
    settings.ignoreIslands = raw.ignoreIslands;
  }
  if (Number.isFinite(Number(raw.turnTimer))) {
    settings.turnTimer = Math.min(600, Math.max(0, Math.floor(Number(raw.turnTimer))));
  }
  return settings;
}

function cleanProblemSet(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const problems = [];
  for (const q of raw.slice(0, MAX_QUESTIONS)) {
    const country = String(q?.country ?? '').slice(0, 80);
    const type = VALID_QUESTION_TYPES.has(q?.type) ? q.type : 'flag';
    if (!country) continue;
    problems.push({ country, type });
  }
  return problems.length ? problems : null;
}

function clampScore(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_SCORE, Math.max(0, n));
}

function makePlayer({ playerId, name, socketId, spectating }) {
  return {
    id: playerId,
    name,
    socketId,
    connected: true,
    disconnectedAt: null,
    // `spectating` players watch the current round and play the next one.
    spectating: Boolean(spectating),
    score: 0,
    correctFirstTry: 0,
    progress: 0,
    total: 0,
    finished: false,
  };
}

function rank(players) {
  return [...players].sort(
    (a, b) =>
      b.score - a.score ||
      b.correctFirstTry - a.correctFirstTry ||
      b.progress - a.progress ||
      a.name.localeCompare(b.name)
  );
}

function publicPlayers(lobby) {
  const players = [...lobby.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    correctFirstTry: p.correctFirstTry,
    progress: p.progress,
    total: p.total,
    finished: p.finished,
    connected: p.connected,
    spectating: p.spectating,
    isHost: p.id === lobby.hostId,
  }));

  if (lobby.phase === 'playing') {
    const ranked = rank(players.filter((p) => !p.spectating));
    ranked.forEach((p, i) => {
      p.rank = i + 1;
    });
  }
  return players;
}

function lobbyPayload(lobby) {
  return {
    code: lobby.code,
    phase: lobby.phase,
    settings: lobby.settings,
    hostId: lobby.hostId,
    roundNumber: lobby.roundNumber,
    lastStandings: lobby.phase === 'lobby' ? lobby.lastStandings : null,
    players: publicPlayers(lobby),
    // Only live rounds carry questions, and they're delivered via quiz:started.
    problemSet: null,
  };
}

function standingsPayload(lobby) {
  const contenders = [...lobby.players.values()].filter((p) => !p.spectating);
  return rank(contenders).map((p, i) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    correctFirstTry: p.correctFirstTry,
    progress: p.progress,
    total: p.total,
    finished: p.finished,
    connected: p.connected,
    rank: i + 1,
  }));
}

function emitLobby(io, lobby) {
  io.to(lobby.code).emit('lobby:update', lobbyPayload(lobby));
}

function roundDeadline(questionCount, turnTimer) {
  if (ROUND_TIMEOUT_OVERRIDE_MS) return Date.now() + ROUND_TIMEOUT_OVERRIDE_MS;
  const perQuestion = turnTimer > 0 ? (turnTimer + 15) * 1_000 : 120_000;
  return Date.now() + Math.min(questionCount * perQuestion + 120_000, MAX_ROUND_MS);
}

function startRound(lobby, problemSet) {
  lobby.phase = 'playing';
  lobby.roundNumber += 1;
  lobby.problemSet = problemSet;
  lobby.roundStartedAt = Date.now();
  lobby.roundDeadline = roundDeadline(
    problemSet.length,
    Number(lobby.settings?.turnTimer) || 0
  );

  for (const p of lobby.players.values()) {
    p.score = 0;
    p.correctFirstTry = 0;
    p.progress = 0;
    p.finished = false;
    // Anyone offline when the round starts sits it out rather than blocking it.
    p.spectating = !p.connected;
    p.total = p.spectating ? 0 : problemSet.length;
  }
}

/**
 * Ends the round and reopens the lobby. This is the ONLY way a round ends, and
 * it never depends on a client asking for it — that used to deadlock the lobby.
 */
function finishRound(io, lobby, reason) {
  if (lobby.phase !== 'playing') return;

  const standings = standingsPayload(lobby);
  lobby.phase = 'lobby';
  lobby.problemSet = null;
  lobby.roundDeadline = null;
  lobby.lastStandings = standings;

  for (const p of lobby.players.values()) {
    p.progress = 0;
    p.finished = false;
    p.total = 0;
    // Everyone waiting on the sidelines is in for the next round.
    p.spectating = false;
  }

  io.to(lobby.code).emit('quiz:finished', {
    code: lobby.code,
    roundNumber: lobby.roundNumber,
    reason,
    standings,
  });
  emitLobby(io, lobby);
}

function maybeFinishRound(io, lobby) {
  if (lobby.phase !== 'playing') return;
  const contenders = [...lobby.players.values()].filter((p) => !p.spectating);
  if (contenders.length === 0) {
    finishRound(io, lobby, 'empty');
    return;
  }
  // Disconnected players can't answer, so they don't hold the round hostage.
  const stillPlaying = contenders.filter((p) => !p.finished && p.connected);
  if (stillPlaying.length === 0) finishRound(io, lobby, 'complete');
}

function reassignHost(lobby) {
  const players = [...lobby.players.values()];
  if (players.some((p) => p.id === lobby.hostId)) return;
  const next = players.find((p) => p.connected) || players[0];
  lobby.hostId = next ? next.id : null;
}

function dropPlayer(io, lobby, playerId) {
  if (!lobby.players.delete(playerId)) return;
  if (lobby.players.size === 0) {
    lobbies.delete(lobby.code);
    return;
  }
  reassignHost(lobby);
  maybeFinishRound(io, lobby);
  if (lobbies.has(lobby.code)) emitLobby(io, lobby);
}

function detachSocket(socket) {
  const { lobbyCode, playerId } = socket.data;
  socket.data.lobbyCode = null;
  if (lobbyCode) socket.leave(lobbyCode);
  if (playerId && socketsByPlayer.get(playerId) === socket.id) {
    socketsByPlayer.delete(playerId);
  }
  return lobbyCode ? lobbies.get(lobbyCode) : null;
}

function attachSocket(io, socket, lobby, player) {
  // One identity, one live socket: boot the stale tab out of its room, and out
  // of its lobby entirely if it was sitting somewhere else.
  const previousSocketId = socketsByPlayer.get(player.id);
  if (previousSocketId && previousSocketId !== socket.id) {
    const previous = io.sockets.sockets.get(previousSocketId);
    if (previous) {
      const previousCode = previous.data.lobbyCode;
      previous.data.lobbyCode = null;
      if (previousCode) previous.leave(previousCode);
      previous.emit('lobby:takeover');
      if (previousCode && previousCode !== lobby.code) {
        const abandoned = lobbies.get(previousCode);
        if (abandoned) dropPlayer(io, abandoned, player.id);
      }
    }
  }

  socketsByPlayer.set(player.id, socket.id);
  socket.data.lobbyCode = lobby.code;
  socket.join(lobby.code);
  player.socketId = socket.id;
  player.connected = true;
  player.disconnectedAt = null;
  lobby.lastActivity = Date.now();
}

function currentLobby(socket) {
  const lobby = lobbies.get(socket.data.lobbyCode);
  if (!lobby) return null;
  const player = lobby.players.get(socket.data.playerId);
  if (!player) return null;
  return { lobby, player };
}

function joinLobby(io, socket, lobby, name) {
  const existing = lobby.players.get(socket.data.playerId);
  if (existing) {
    if (name) existing.name = name;
    attachSocket(io, socket, lobby, existing);
    return { ok: true, lobby: lobbyPayload(lobby), spectating: existing.spectating };
  }

  const connectedCount = [...lobby.players.values()].filter((p) => p.connected).length;
  if (connectedCount >= MAX_PLAYERS) {
    return { ok: false, error: 'Lobby is full' };
  }

  // Joining mid-round is always allowed — you spectate, then play the next round.
  const player = makePlayer({
    playerId: socket.data.playerId,
    name: name || 'Player',
    socketId: socket.id,
    spectating: lobby.phase === 'playing',
  });
  lobby.players.set(player.id, player);
  attachSocket(io, socket, lobby, player);
  return { ok: true, lobby: lobbyPayload(lobby), spectating: player.spectating };
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    const players = [...lobbies.values()].reduce((n, l) => n + l.players.size, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, lobbies: lobbies.size, players }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  pingTimeout: 20_000,
});

io.use((socket, next) => {
  const raw = socket.handshake.auth?.playerId;
  const playerId = String(raw ?? '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
  // Identity is the durable player id, not the socket id, so a reconnect keeps
  // your seat and score instead of leaving a ghost behind in the round.
  socket.data.playerId = playerId || `anon-${socket.id}`;
  socket.data.lobbyCode = null;
  next();
});

io.on('connection', (socket) => {
  const ack = (fn, payload) => {
    if (typeof fn === 'function') fn(payload);
  };

  socket.on('lobby:create', ({ name, settings } = {}, cb) => {
    if (lobbies.size >= MAX_LOBBIES) {
      ack(cb, { ok: false, error: 'Server is at capacity — try again shortly' });
      return;
    }
    const code = createCode();
    if (!code) {
      ack(cb, { ok: false, error: 'Could not allocate a lobby code' });
      return;
    }

    const previous = detachSocket(socket);
    if (previous) dropPlayer(io, previous, socket.data.playerId);

    const lobby = {
      code,
      hostId: socket.data.playerId,
      phase: 'lobby',
      settings: cleanSettings(settings),
      problemSet: null,
      roundNumber: 0,
      roundStartedAt: null,
      roundDeadline: null,
      lastStandings: null,
      players: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    const player = makePlayer({
      playerId: socket.data.playerId,
      name: cleanName(name),
      socketId: socket.id,
      spectating: false,
    });
    lobby.players.set(player.id, player);
    lobbies.set(code, lobby);
    attachSocket(io, socket, lobby, player);

    const payload = lobbyPayload(lobby);
    ack(cb, { ok: true, lobby: payload });
    socket.emit('lobby:update', payload);
  });

  socket.on('lobby:join', ({ code, name } = {}, cb) => {
    const room = cleanCode(code);
    const lobby = lobbies.get(room);
    if (!lobby) {
      ack(cb, { ok: false, error: 'Lobby not found' });
      return;
    }

    if (socket.data.lobbyCode && socket.data.lobbyCode !== room) {
      const previous = detachSocket(socket);
      if (previous) dropPlayer(io, previous, socket.data.playerId);
    }

    const result = joinLobby(io, socket, lobby, cleanName(name));
    ack(cb, result);
    if (result.ok) emitLobby(io, lobby);
  });

  // Called after a reconnect/refresh to reclaim a seat without losing progress.
  socket.on('lobby:resume', ({ code, name } = {}, cb) => {
    const room = cleanCode(code);
    const lobby = lobbies.get(room);
    if (!lobby) {
      ack(cb, { ok: false, error: 'Lobby not found' });
      return;
    }
    const wasMember = lobby.players.has(socket.data.playerId);
    const result = joinLobby(io, socket, lobby, name ? cleanName(name) : null);
    if (!result.ok) {
      ack(cb, result);
      return;
    }
    const player = lobby.players.get(socket.data.playerId);
    const rejoinedRound =
      lobby.phase === 'playing' && wasMember && !player.spectating && !player.finished;
    ack(cb, {
      ...result,
      resumed: wasMember,
      // Hand the questions back so a refresh mid-round can pick up where it left off.
      problemSet: rejoinedRound ? lobby.problemSet : null,
      progress: rejoinedRound ? player.progress : 0,
    });
    emitLobby(io, lobby);
  });

  socket.on('lobby:sync', (cb) => {
    const current = currentLobby(socket);
    ack(
      cb,
      current
        ? { ok: true, lobby: lobbyPayload(current.lobby) }
        : { ok: false, error: 'Not in a lobby' }
    );
  });

  socket.on('lobby:settings', ({ settings } = {}) => {
    const current = currentLobby(socket);
    if (!current) return;
    const { lobby } = current;
    if (lobby.hostId !== socket.data.playerId || lobby.phase !== 'lobby') return;
    lobby.settings = { ...lobby.settings, ...cleanSettings(settings) };
    emitLobby(io, lobby);
  });

  socket.on('lobby:name', ({ name } = {}) => {
    const current = currentLobby(socket);
    if (!current) return;
    current.player.name = cleanName(name);
    emitLobby(io, current.lobby);
  });

  socket.on('lobby:kick', ({ playerId } = {}) => {
    const current = currentLobby(socket);
    if (!current) return;
    const { lobby } = current;
    if (lobby.hostId !== socket.data.playerId) return;
    if (playerId === lobby.hostId) return;
    const target = lobby.players.get(playerId);
    if (!target) return;
    const targetSocket = io.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.leave(lobby.code);
      targetSocket.data.lobbyCode = null;
      targetSocket.emit('lobby:kicked', { code: lobby.code });
    }
    socketsByPlayer.delete(playerId);
    dropPlayer(io, lobby, playerId);
  });

  socket.on('quiz:start', ({ problemSet } = {}, cb) => {
    const current = currentLobby(socket);
    if (!current) {
      ack(cb, { ok: false, error: 'Not in a lobby' });
      return;
    }
    const { lobby } = current;
    if (lobby.hostId !== socket.data.playerId) {
      ack(cb, { ok: false, error: 'Only the host can start' });
      return;
    }
    if (lobby.phase === 'playing') {
      ack(cb, { ok: false, error: 'A round is already running' });
      return;
    }
    const problems = cleanProblemSet(problemSet);
    if (!problems) {
      ack(cb, { ok: false, error: 'Invalid question set' });
      return;
    }

    startRound(lobby, problems);
    const payload = lobbyPayload(lobby);
    for (const p of lobby.players.values()) {
      const target = io.sockets.sockets.get(p.socketId);
      if (!target) continue;
      if (p.spectating) {
        target.emit('lobby:update', payload);
      } else {
        target.emit('quiz:started', { ...payload, problemSet: problems });
      }
    }
    ack(cb, { ok: true });
  });

  const handleProgress = ({ score, correctFirstTry, progress, done } = {}, cb) => {
    const current = currentLobby(socket);
    if (!current) {
      ack(cb, { ok: false, error: 'Not in a lobby' });
      return;
    }
    const { lobby, player } = current;
    if (lobby.phase !== 'playing' || player.spectating) {
      // Round already closed (or you're watching) — drop it, don't reopen anything.
      ack(cb, { ok: false, stale: true });
      return;
    }

    player.score = clampScore(score);
    player.correctFirstTry = clampScore(correctFirstTry);
    if (Number.isFinite(Number(progress))) {
      player.progress = Math.min(player.total, Math.max(0, Math.floor(Number(progress))));
    }
    if (done) {
      player.finished = true;
      player.progress = player.total;
    }
    lobby.lastActivity = Date.now();

    emitLobby(io, lobby);
    maybeFinishRound(io, lobby);
    ack(cb, { ok: true });
  };

  socket.on('quiz:progress', handleProgress);
  // Older clients still speak quiz:score.
  socket.on('quiz:score', handleProgress);

  // Host can cut a round short when someone goes AFK.
  socket.on('quiz:end-round', (cb) => {
    const current = currentLobby(socket);
    if (!current) {
      ack(cb, { ok: false, error: 'Not in a lobby' });
      return;
    }
    const { lobby } = current;
    if (lobby.hostId !== socket.data.playerId) {
      ack(cb, { ok: false, error: 'Only the host can end the round' });
      return;
    }
    finishRound(io, lobby, 'host-ended');
    ack(cb, { ok: true });
  });

  socket.on('lobby:leave', () => {
    const lobby = detachSocket(socket);
    if (lobby) dropPlayer(io, lobby, socket.data.playerId);
  });

  socket.on('disconnect', () => {
    const code = socket.data.lobbyCode;
    if (socketsByPlayer.get(socket.data.playerId) === socket.id) {
      socketsByPlayer.delete(socket.data.playerId);
    }
    const lobby = code ? lobbies.get(code) : null;
    if (!lobby) return;
    const player = lobby.players.get(socket.data.playerId);
    if (!player || player.socketId !== socket.id) return;

    // Hold the seat during the grace period; the watchdog reaps it if they
    // never come back, and the round finishes without them either way.
    player.connected = false;
    player.disconnectedAt = Date.now();
    reassignHostIfOffline(lobby);
    maybeFinishRound(io, lobby);
    if (lobbies.has(code)) emitLobby(io, lobby);
  });
});

function reassignHostIfOffline(lobby) {
  const host = lobby.players.get(lobby.hostId);
  if (host?.connected) return;
  const next = [...lobby.players.values()].find((p) => p.connected);
  if (next) lobby.hostId = next.id;
}

// Nothing in this loop needs a client to be well behaved, which is what keeps a
// lobby from getting permanently wedged in the middle of a round.
setInterval(() => {
  const now = Date.now();
  for (const lobby of [...lobbies.values()]) {
    let changed = false;

    for (const player of [...lobby.players.values()]) {
      if (player.connected) continue;
      if (now - player.disconnectedAt < DISCONNECT_GRACE_MS) continue;
      lobby.players.delete(player.id);
      socketsByPlayer.delete(player.id);
      changed = true;
    }

    if (lobby.players.size === 0) {
      lobbies.delete(lobby.code);
      continue;
    }
    if (changed) reassignHost(lobby);

    if (lobby.phase === 'playing' && lobby.roundDeadline && now > lobby.roundDeadline) {
      finishRound(io, lobby, 'timeout');
      continue;
    }

    maybeFinishRound(io, lobby);
    if (!lobbies.has(lobby.code)) continue;

    const anyoneHome = [...lobby.players.values()].some((p) => p.connected);
    if (!anyoneHome && now - lobby.lastActivity > ABANDONED_LOBBY_TTL_MS) {
      lobbies.delete(lobby.code);
      continue;
    }
    if (anyoneHome) lobby.lastActivity = now;
    if (changed) emitLobby(io, lobby);
  }
}, WATCHDOG_INTERVAL_MS).unref?.();

httpServer.listen(PORT, () => {
  console.log(`Lobby server listening on http://localhost:${PORT}`);
});
