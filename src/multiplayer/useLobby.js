import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  connectSocket,
  getPlayerId,
  getSocket,
  loadLobbyCode,
  loadPlayerName,
  rememberLobbyCode,
  savePlayerName,
} from './socket';

const CONNECT_HELP =
  'Could not reach the lobby server.';

/**
 * Single source of truth for lobby state. This lives above the quiz screen so
 * the listeners stay mounted for the whole round — the lobby panel unmounting
 * mid-quiz used to mean missed round events.
 */
export default function useLobby({
  enabled = true,
  onRoundStart,
  onRoundFinish,
} = {}) {
  const playerId = getPlayerId();
  const [lobby, setLobby] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [playerName, setPlayerName] = useState(loadPlayerName);

  const callbacksRef = useRef({ onRoundStart, onRoundFinish });
  const nameRef = useRef(playerName);

  useEffect(() => {
    callbacksRef.current = { onRoundStart, onRoundFinish };
  }, [onRoundStart, onRoundFinish]);

  useEffect(() => {
    nameRef.current = playerName;
  }, [playerName]);

  useEffect(() => {
    // Solo players never touch the network.
    if (!enabled) return undefined;
    const socket = connectSocket();

    const applyLobby = (payload) => {
      setLobby(payload);
      rememberLobbyCode(payload?.code);
    };

    const clearLobby = () => {
      setLobby(null);
      rememberLobbyCode(null);
    };

    const onConnect = () => {
      setStatus('online');
      setError('');

      const code = loadLobbyCode();
      if (!code) return;
      socket.emit(
        'lobby:resume',
        { code, name: nameRef.current || undefined },
        (res) => {
          if (!res?.ok) {
            clearLobby();
            return;
          }
          applyLobby(res.lobby);
          if (res.problemSet?.length) {
            // Refreshed or dropped mid-round — rejoin the round in progress.
            callbacksRef.current.onRoundStart?.({
              ...res.lobby,
              problemSet: res.problemSet,
              progress: res.progress,
              resumed: true,
            });
          }
        }
      );
    };

    const onDisconnect = (reason) => {
      setStatus(reason === 'io client disconnect' ? 'idle' : 'offline');
    };

    const onConnectError = () => {
      setStatus('error');
      setError(CONNECT_HELP);
    };

    const onLobbyUpdate = applyLobby;

    const onQuizStarted = (payload) => {
      applyLobby({ ...payload, problemSet: null });
      callbacksRef.current.onRoundStart?.(payload);
    };

    const onQuizFinished = (payload) => {
      callbacksRef.current.onRoundFinish?.(payload);
    };

    const onKicked = () => {
      clearLobby();
      setNotice('The host removed you from the lobby.');
    };

    const onTakeover = () => {
      clearLobby();
      setNotice('This lobby was opened in another tab.');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('lobby:update', onLobbyUpdate);
    socket.on('quiz:started', onQuizStarted);
    socket.on('quiz:finished', onQuizFinished);
    socket.on('lobby:kicked', onKicked);
    socket.on('lobby:takeover', onTakeover);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('lobby:update', onLobbyUpdate);
      socket.off('quiz:started', onQuizStarted);
      socket.off('quiz:finished', onQuizFinished);
      socket.off('lobby:kicked', onKicked);
      socket.off('lobby:takeover', onTakeover);
    };
  }, [enabled]);

  const saveName = useCallback((name) => {
    setPlayerName(name);
    nameRef.current = name;
    savePlayerName(name);
    if (getSocket().connected) getSocket().emit('lobby:name', { name });
  }, []);

  const create = useCallback((settings) => {
    setError('');
    setNotice('');
    connectSocket().emit(
      'lobby:create',
      { name: nameRef.current || 'Player', settings },
      (res) => {
        if (!res?.ok) {
          setError(res?.error || 'Could not create lobby');
          return;
        }
        setLobby(res.lobby);
        rememberLobbyCode(res.lobby.code);
      }
    );
  }, []);

  const join = useCallback((code, onJoined) => {
    setError('');
    setNotice('');
    connectSocket().emit(
      'lobby:join',
      { code, name: nameRef.current || 'Player' },
      (res) => {
        if (!res?.ok) {
          setError(res?.error || 'Could not join lobby');
          return;
        }
        setLobby(res.lobby);
        rememberLobbyCode(res.lobby.code);
        onJoined?.(res);
      }
    );
  }, []);

  const leave = useCallback(() => {
    getSocket().emit('lobby:leave');
    setLobby(null);
    rememberLobbyCode(null);
  }, []);

  const updateSettings = useCallback((settings) => {
    if (!getSocket().connected) return;
    getSocket().emit('lobby:settings', { settings });
  }, []);

  const kick = useCallback((targetId) => {
    getSocket().emit('lobby:kick', { playerId: targetId });
  }, []);

  const startRound = useCallback((problemSet) => {
    setError('');
    getSocket().emit('quiz:start', { problemSet }, (res) => {
      if (!res?.ok) setError(res?.error || 'Could not start the round');
    });
  }, []);

  const reportProgress = useCallback((update, onAck) => {
    getSocket().emit('quiz:progress', update, (res) => onAck?.(res));
  }, []);

  const endRound = useCallback(() => {
    getSocket().emit('quiz:end-round');
  }, []);

  const retryConnection = useCallback(() => {
    setError('');
    setStatus('connecting');
    connectSocket();
  }, []);

  const me = useMemo(
    () => lobby?.players.find((p) => p.id === playerId) || null,
    [lobby, playerId]
  );

  const actions = useMemo(
    () => ({
      create,
      join,
      leave,
      saveName,
      updateSettings,
      kick,
      startRound,
      reportProgress,
      endRound,
      retryConnection,
      clearNotice: () => setNotice(''),
      clearError: () => setError(''),
    }),
    [
      create,
      join,
      leave,
      saveName,
      updateSettings,
      kick,
      startRound,
      reportProgress,
      endRound,
      retryConnection,
    ]
  );

  return {
    playerId,
    playerName,
    lobby,
    me,
    isHost: Boolean(lobby && lobby.hostId === playerId),
    isSpectating: Boolean(me?.spectating),
    status,
    error,
    notice,
    actions,
  };
}
