/**
 * End-to-end checks for the lobby server. Every case here is a way the lobby
 * used to get stuck in a round and refuse new players.
 *
 *   npm run test:server
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { io } from 'socket.io-client';

const PORT = Number(process.env.PORT) || 3199;
const URL = `http://localhost:${PORT}`;
const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'index.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const QUESTIONS = [
  { country: 'France', type: 'flag' },
  { country: 'Japan', type: 'capital' },
];

let clients = [];

function client(name) {
  const socket = io(URL, {
    transports: ['websocket'],
    auth: { playerId: `test-${name}-${Math.random().toString(36).slice(2)}` },
    reconnection: false,
  });
  socket.testName = name;
  clients.push(socket);
  return socket;
}

function ready(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function call(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5000);
    const done = (res) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) socket.emit(event, done);
    else socket.emit(event, payload, done);
  });
}

function nextEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waiting for "${event}" timed out`)),
      timeoutMs
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function nextMatching(socket, event, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`no matching "${event}" arrived`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function playRound(socket, score, questionCount = QUESTIONS.length) {
  return call(socket, 'quiz:progress', {
    score,
    correctFirstTry: 1,
    progress: questionCount,
    done: true,
  });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('a finished round leaves the lobby joinable', async () => {
  const host = client('host');
  const guest = client('guest');
  await Promise.all([ready(host), ready(guest)]);

  const { lobby } = await call(host, 'lobby:create', { name: 'Host', settings: {} });
  await call(guest, 'lobby:join', { code: lobby.code, name: 'Guest' });

  const started = nextEvent(guest, 'quiz:started');
  await call(host, 'quiz:start', { problemSet: QUESTIONS });
  assert((await started).problemSet.length === 2, 'guest never received the questions');

  const finished = nextEvent(host, 'quiz:finished');
  await playRound(host, 30);
  await playRound(guest, 20);
  const result = await finished;

  assert(result.standings[0].name === 'Host', 'standings are not ranked by score');
  assert(result.standings[0].rank === 1, 'winner is missing a rank');

  const late = client('late');
  await ready(late);
  const join = await call(late, 'lobby:join', { code: lobby.code, name: 'Late' });
  assert(join.ok, `late join was rejected: ${join.error}`);
  assert(!join.spectating, 'joining an idle lobby should not spectate');
});

test('an idle player cannot wedge the lobby shut', async () => {
  const host = client('host');
  const idle = client('idle');
  await Promise.all([ready(host), ready(idle)]);

  const { lobby } = await call(host, 'lobby:create', { name: 'Host', settings: {} });
  await call(idle, 'lobby:join', { code: lobby.code, name: 'Idle' });
  await call(host, 'quiz:start', { problemSet: QUESTIONS });
  await playRound(host, 30); // the idle player never reports anything

  // Joining mid-round is allowed: you watch this round and play the next one.
  const late = client('late');
  await ready(late);
  const join = await call(late, 'lobby:join', { code: lobby.code, name: 'Late' });
  assert(join.ok, `mid-round join was rejected: ${join.error}`);
  assert(join.spectating, 'mid-round joiner should be spectating');

  // ...and the host can cut the round short instead of waiting.
  const finished = nextEvent(late, 'quiz:finished');
  await call(host, 'quiz:end-round');
  await finished;

  const update = await call(late, 'lobby:sync');
  assert(update.lobby.phase === 'lobby', 'lobby did not reopen after the round');
  const promoted = update.lobby.players.find((p) => p.name === 'Late');
  assert(!promoted.spectating, 'spectator was not promoted for the next round');
});

test('a disconnected player does not hold the round open', async () => {
  const host = client('host');
  const dropper = client('dropper');
  await Promise.all([ready(host), ready(dropper)]);

  const { lobby } = await call(host, 'lobby:create', { name: 'Host', settings: {} });
  await call(dropper, 'lobby:join', { code: lobby.code, name: 'Dropper' });
  await call(host, 'quiz:start', { problemSet: QUESTIONS });

  const finished = nextEvent(host, 'quiz:finished');
  dropper.close();
  await wait(200);
  await playRound(host, 30);
  const result = await finished;
  assert(result.reason === 'complete', `unexpected finish reason: ${result.reason}`);
});

test('the watchdog closes a round nobody finishes', async () => {
  const host = client('host');
  const guest = client('guest');
  await Promise.all([ready(host), ready(guest)]);

  const { lobby } = await call(host, 'lobby:create', { name: 'Host', settings: {} });
  await call(guest, 'lobby:join', { code: lobby.code, name: 'Guest' });
  await call(host, 'quiz:start', { problemSet: QUESTIONS });

  // Neither client ever reports in — CFQ_ROUND_TIMEOUT_MS makes this quick.
  const result = await nextEvent(host, 'quiz:finished', 10_000);
  assert(result.reason === 'timeout', `unexpected finish reason: ${result.reason}`);

  const late = client('late');
  await ready(late);
  const join = await call(late, 'lobby:join', { code: lobby.code, name: 'Late' });
  assert(join.ok, `join after a timed-out round was rejected: ${join.error}`);
});

test('reconnecting mid-round restores the seat, score and progress', async () => {
  const host = client('host');
  const playerId = `test-rejoin-${Math.random().toString(36).slice(2)}`;
  const first = io(URL, { transports: ['websocket'], auth: { playerId }, reconnection: false });
  clients.push(first);
  await Promise.all([ready(host), ready(first)]);

  const { lobby } = await call(host, 'lobby:create', { name: 'Host', settings: {} });
  await call(first, 'lobby:join', { code: lobby.code, name: 'Rejoiner' });
  await call(host, 'quiz:start', { problemSet: QUESTIONS });
  await call(first, 'quiz:progress', { score: 12, correctFirstTry: 1, progress: 1 });
  first.close();
  await wait(200);

  const second = io(URL, { transports: ['websocket'], auth: { playerId }, reconnection: false });
  clients.push(second);
  await ready(second);
  const resumed = await call(second, 'lobby:resume', { code: lobby.code });
  assert(resumed.ok && resumed.resumed, 'resume did not reclaim the seat');
  assert(resumed.problemSet?.length === 2, 'resume did not return the live questions');
  assert(resumed.progress === 1, `resume lost progress: ${resumed.progress}`);
  const mine = resumed.lobby.players.find((p) => p.name === 'Rejoiner');
  assert(mine.score === 12, `resume lost the score: ${mine.score}`);
});

test('the host role moves on when the host leaves', async () => {
  const host = client('host');
  const guest = client('guest');
  await Promise.all([ready(host), ready(guest)]);

  const { lobby } = await call(host, 'lobby:create', { name: 'Host', settings: {} });
  await call(guest, 'lobby:join', { code: lobby.code, name: 'Guest' });

  const update = nextMatching(
    guest,
    'lobby:update',
    (p) => !p.players.some((player) => player.name === 'Host')
  );
  host.emit('lobby:leave');
  const payload = await update;
  const newHost = payload.players.find((p) => p.isHost);
  assert(newHost?.name === 'Guest', 'host was not handed over');

  const start = await call(guest, 'quiz:start', { problemSet: QUESTIONS });
  assert(start.ok, `new host could not start a round: ${start.error}`);
});

test('malformed input is rejected instead of corrupting a lobby', async () => {
  const host = client('host');
  await ready(host);
  const { lobby } = await call(host, 'lobby:create', {
    name: '   ',
    settings: { quizLength: 99999, turnTimer: -5, quizType: 'flag' },
  });
  assert(lobby.players[0].name === 'Player', 'blank name was not defaulted');
  assert(lobby.settings.quizLength === 300, 'question count was not clamped');
  assert(lobby.settings.turnTimer === 0, 'turn timer was not clamped');

  const bad = await call(host, 'quiz:start', { problemSet: [] });
  assert(!bad.ok, 'an empty question set was accepted');

  const guest = client('guest');
  await ready(guest);
  const notFound = await call(guest, 'lobby:join', { code: 'zz!!' });
  assert(!notFound.ok, 'joining a nonexistent lobby succeeded');
});

const server = spawn(process.execPath, [SERVER], {
  env: {
    ...process.env,
    PORT: String(PORT),
    CFQ_ROUND_TIMEOUT_MS: '2000',
    CFQ_DISCONNECT_GRACE_MS: '90000',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${URL}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(100);
  }
  throw new Error('lobby server never became healthy');
}

let failures = 0;
try {
  await waitForServer();
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL ${name}\n       ${err.message}`);
    } finally {
      for (const socket of clients) socket.close();
      clients = [];
      await wait(50);
    }
  }
} finally {
  server.kill();
}

console.log(
  failures ? `\n${failures} of ${tests.length} checks failed` : `\nall ${tests.length} checks passed`
);
process.exit(failures ? 1 : 0);
