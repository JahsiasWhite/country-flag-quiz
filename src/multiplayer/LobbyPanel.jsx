import React, { useEffect, useRef, useState } from 'react';
import { QUESTION_TYPES } from '../constants';
import Select from '../Select';

function readCodeFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get('lobby');
    return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  } catch {
    return '';
  }
}

function stripCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('lobby')) return;
    url.searchParams.delete('lobby');
    window.history.replaceState({}, '', url);
  } catch {
    /* ignore */
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function PlayerRow({ player, isSelf, showProgress, canKick, onKick }) {
  const pct =
    player.total > 0
      ? Math.round((Math.min(player.progress, player.total) / player.total) * 100)
      : 0;

  return (
    <li className={player.connected ? '' : 'is-offline'}>
      <div className="lobby-player-main">
        <span className="lobby-player-name">{player.name}</span>
        {player.isHost && <span className="lobby-host-tag">Host</span>}
        {isSelf && <span className="lobby-you-tag">You</span>}
        {player.spectating && <span className="lobby-wait-tag">Up next</span>}
        {!player.connected && <span className="lobby-offline-tag">Offline</span>}
        {canKick && (
          <button
            type="button"
            className="lobby-kick-button"
            title={`Remove ${player.name}`}
            onClick={() => onKick(player.id)}
          >
            ✕
          </button>
        )}
      </div>

      {showProgress && !player.spectating && (
        <div className="lobby-progress">
          <div className="lobby-progress-track">
            <div className="lobby-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="lobby-progress-label">
            {player.finished
              ? `Finished · ${player.score} pts`
              : `${player.progress}/${player.total} · ${player.score} pts`}
          </span>
        </div>
      )}
    </li>
  );
}

function Standings({ entries, selfId, title }) {
  return (
    <div className="lobby-last-round">
      <h4>{title}</h4>
      <ul className="live-scores">
        {entries.map((p) => (
          <li key={p.id} className={p.id === selfId ? 'is-self' : ''}>
            <span>
              {p.rank}. {p.name}
            </span>
            <span>{p.score} pts</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LobbyPanel({
  quizType,
  quizLength,
  ignoreIslands,
  turnTimer,
  onSettingsChange,
  generateProblemSet,
  lobby,
  me,
  isHost,
  isSpectating,
  status,
  error,
  notice,
  playerName,
  actions,
}) {
  const [joinCode, setJoinCode] = useState(readCodeFromUrl);
  const [copied, setCopied] = useState('');
  const autoJoinedRef = useRef(false);

  const playing = lobby?.phase === 'playing';
  const lobbyCode = lobby?.code;

  // Invite links (?lobby=CODE) drop friends straight into the room.
  useEffect(() => {
    if (autoJoinedRef.current || lobby || status !== 'online') return;
    const code = readCodeFromUrl();
    if (code.length !== 4 || !playerName) return;
    autoJoinedRef.current = true;
    actions.join(code, () => stripCodeFromUrl());
  }, [lobby, status, playerName, actions]);

  // Keep the room's settings in sync with the host's controls.
  useEffect(() => {
    if (!lobbyCode || !isHost || playing) return;
    actions.updateSettings({ quizType, quizLength, ignoreIslands, turnTimer });
  }, [
    quizType,
    quizLength,
    ignoreIslands,
    turnTimer,
    lobbyCode,
    isHost,
    playing,
    actions,
  ]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(''), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyCode() {
    if (await copyText(lobby.code)) setCopied('code');
  }

  async function copyInvite() {
    const url = new URL(window.location.href);
    url.searchParams.set('lobby', lobby.code);
    if (await copyText(url.toString())) setCopied('link');
  }

  function startForEveryone() {
    if (!isHost || !generateProblemSet) return;
    const problems = generateProblemSet();
    actions.startRound(
      problems.map((q) => ({ country: q.country, type: q.type }))
    );
  }

  if (status === 'connecting' && !lobby) {
    return <p className="lobby-status">Connecting to lobby server…</p>;
  }

  if (status === 'error' && !lobby) {
    return (
      <div className="lobby-error-block">
        <p className="form-error">{error}</p>
        <button
          type="button"
          className="secondary-button"
          onClick={actions.retryConnection}
        >
          Retry connection
        </button>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="lobby-setup">
        <div className="form-group">
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            className="form-input"
            value={playerName}
            maxLength={18}
            placeholder="Explorer"
            onChange={(e) => actions.saveName(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="start-button"
          onClick={() =>
            actions.create({ quizType, quizLength, ignoreIslands, turnTimer })
          }
        >
          Create lobby
        </button>

        <div className="lobby-divider">
          <span>or join with a code</span>
        </div>

        <div className="lobby-join-row">
          <input
            className="form-input lobby-code-input"
            value={joinCode}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) =>
              setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && joinCode.length === 4) {
                actions.join(joinCode, () => stripCodeFromUrl());
              }
            }}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => actions.join(joinCode, () => stripCodeFromUrl())}
            disabled={joinCode.length < 4}
          >
            Join
          </button>
        </div>

        <p className="lobby-hint">
          A round already running? Join anyway — you&apos;ll watch the live
          scores and play the next one.
        </p>

        {notice && <p className="lobby-notice">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  const sortedPlayers = playing
    ? [...lobby.players].sort(
        (a, b) =>
          Number(a.spectating) - Number(b.spectating) ||
          b.score - a.score ||
          a.name.localeCompare(b.name)
      )
    : lobby.players;

  const stillPlaying = lobby.players.filter(
    (p) => !p.spectating && !p.finished && p.connected
  ).length;

  const hostControls = (
    <>
      <div className="form-group">
        <label>Question Type</label>
        <Select
          value={quizType}
          onChange={(e) => onSettingsChange?.({ quizType: e.target.value })}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="form-group">
        <label>Number of Questions</label>
        <Select
          value={quizLength}
          onChange={(e) =>
            onSettingsChange?.({
              quizLength: e.target.value === 'all' ? 'all' : Number(e.target.value),
            })
          }
        >
          <option value={5}>5 Questions</option>
          <option value={10}>10 Questions</option>
          <option value={20}>20 Questions</option>
          <option value={50}>50 Questions</option>
          <option value="all">All Countries</option>
        </Select>
      </div>

      <div className="form-group">
        <label>Turn timer (per country)</label>
        <Select
          value={turnTimer}
          onChange={(e) => onSettingsChange?.({ turnTimer: Number(e.target.value) })}
        >
          <option value={0}>Off</option>
          <option value={10}>10 seconds</option>
          <option value={15}>15 seconds</option>
          <option value={20}>20 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={45}>45 seconds</option>
          <option value={60}>60 seconds</option>
        </Select>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={ignoreIslands}
            onChange={(e) => onSettingsChange?.({ ignoreIslands: e.target.checked })}
          />
          Ignore Small Islands
        </label>
      </div>

      <button type="button" className="start-button" onClick={startForEveryone}>
        {lobby.roundNumber > 0 ? 'Start next round' : 'Start for everyone'}
      </button>
    </>
  );

  return (
    <div className="lobby-room">
      <div className="lobby-code-banner">
        <span className="lobby-code-label">Lobby code</span>
        <span className="lobby-code-value">{lobby.code}</span>
        <div className="lobby-code-actions">
          <button type="button" className="lobby-chip" onClick={copyCode}>
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </button>
          {/* <button type="button" className="lobby-chip" onClick={copyInvite}>
            {copied === 'link' ? 'Copied!' : 'Copy invite link'}
          </button> */}
        </div>
      </div>

      {status === 'offline' && (
        <p className="lobby-notice">
          Reconnecting… your seat is held for a minute.
        </p>
      )}

      <div className="lobby-status-card">
        <span className={`lobby-status-dot ${playing ? 'is-live' : 'is-ready'}`} />
        <div className="lobby-status-text">
          <strong>
            {playing
              ? isSpectating
                ? 'Round in progress — you play next'
                : 'Round in progress'
              : 'Waiting to start'}
          </strong>
          <span>
            {lobby.players.length} player
            {lobby.players.length === 1 ? '' : 's'}
            {playing
              ? ` · ${stillPlaying} still answering`
              : isHost
                ? ' · Share the code, then start'
                : ' · Waiting for host to start'}
            {lobby.settings?.turnTimer > 0 &&
              ` · ${lobby.settings.turnTimer}s per country`}
          </span>
        </div>
      </div>

      <ul className="lobby-players">
        {sortedPlayers.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            isSelf={p.id === me?.id}
            showProgress={playing}
            canKick={isHost && p.id !== me?.id}
            onKick={actions.kick}
          />
        ))}
      </ul>

      {playing && (
        <>
          <p className="lobby-status">
            {isSpectating
              ? 'You joined mid-round — you are in the next one automatically.'
              : 'Scores update live as everyone answers.'}
          </p>
          {isHost && (
            <button
              type="button"
              className="secondary-button"
              onClick={actions.endRound}
            >
              End round for everyone
            </button>
          )}
        </>
      )}

      {!playing && lobby.lastStandings?.length > 1 && (
        <Standings
          entries={lobby.lastStandings}
          selfId={me?.id}
          title={`Round ${lobby.roundNumber} results`}
        />
      )}

      {!playing &&
        (isHost ? (
          hostControls
        ) : (
          <p className="lobby-status">
            Waiting for the host to start
            {lobby.roundNumber > 0 ? ' the next round' : ''}…
          </p>
        ))}

      <button type="button" className="ghost-button" onClick={actions.leave}>
        Leave lobby
      </button>

      {notice && <p className="lobby-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
