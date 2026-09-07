import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || undefined;

const PLAYER_ID_KEY = 'cfq-player-id';
const PLAYER_NAME_KEY = 'cfq-player-name';
const LOBBY_CODE_KEY = 'cfq-lobby-code';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode — fall back to an in-memory id for this tab */
  }
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

let cachedPlayerId = null;

/**
 * A durable identity so refreshing or losing connection reclaims your seat and
 * score instead of leaving a ghost player behind in the round.
 */
export function getPlayerId() {
  if (cachedPlayerId) return cachedPlayerId;
  cachedPlayerId = read(PLAYER_ID_KEY) || randomId();
  write(PLAYER_ID_KEY, cachedPlayerId);
  return cachedPlayerId;
}

export function loadPlayerName() {
  return read(PLAYER_NAME_KEY) || '';
}

export function savePlayerName(name) {
  write(PLAYER_NAME_KEY, name);
}

export function rememberLobbyCode(code) {
  write(LOBBY_CODE_KEY, code || null);
}

export function loadLobbyCode() {
  return read(LOBBY_CODE_KEY) || '';
}

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { playerId: getPlayerId() },
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}
