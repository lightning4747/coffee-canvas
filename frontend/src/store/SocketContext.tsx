import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from './useStore';
import {
  StrokeBeginPayload,
  StrokeSegmentPayload,
  StrokeEndPayload,
  CoffeePourPayload,
  CursorPositionPayload,
} from '../../../shared/src/types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emitStrokeBegin: (
    payload: Omit<StrokeBeginPayload, 'userId' | 'roomId' | 'timestamp'>
  ) => void;
  emitStrokeSegment: (
    payload: Omit<StrokeSegmentPayload, 'userId' | 'roomId' | 'timestamp'>
  ) => void;
  emitStrokeEnd: (
    payload: Omit<StrokeEndPayload, 'userId' | 'roomId' | 'timestamp'>
  ) => void;
  emitCoffeePour: (
    payload: Omit<CoffeePourPayload, 'userId' | 'roomId' | 'timestamp'>
  ) => void;
  emitCursorMove: (
    payload: Omit<
      CursorPositionPayload,
      'userId' | 'roomId' | 'userName' | 'userColor' | 'timestamp'
    >
  ) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { roomId, userId, userName, userColor, token, brushSettings } =
    useStore();
  const pendingEventsRef = useRef<{ event: string; payload: unknown }[]>([]);
  const lastCursorEmitRef = useRef<number>(0);
  const CURSOR_THROTTLE_MS = 50;

  useEffect(() => {
    // Only connect once we have real auth credentials from the lobby
    if (!roomId || !userId || !token) return;

    console.log(`[Socket] Initializing for room=${roomId}, user=${userId}`);

    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

    console.log(`[Socket] Connecting to ${socketUrl}...`);

    const newSocket = io(socketUrl, {
      auth: {
        token, // Real JWT from Room Service
      },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected');
      setIsConnected(true);

      // Flush buffered events that were queued before connection
      if (pendingEventsRef.current.length > 0) {
        console.log(
          `[Socket] Flushing ${pendingEventsRef.current.length} buffered events`
        );
        pendingEventsRef.current.forEach(({ event, payload }) => {
          newSocket.emit(event, payload);
        });
        pendingEventsRef.current = [];
      }
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    newSocket.on('connect_error', error => {
      console.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
    });

    newSocket.on('error', (payload: { message: string }) => {
      console.error('[Socket] Application error:', payload.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, userId, token]);

  const emitStrokeBegin = useCallback(
    (payload: Omit<StrokeBeginPayload, 'userId' | 'roomId' | 'timestamp'>) => {
      if (!roomId || !userId) return;
      const fullPayload = {
        ...payload,
        roomId,
        userId,
        timestamp: Date.now(),
      };

      if (!socket || !isConnected) {
        pendingEventsRef.current.push({
          event: 'stroke_begin',
          payload: fullPayload,
        });
        return;
      }
      socket.emit('stroke_begin', fullPayload);
    },
    [socket, isConnected, roomId, userId]
  );

  const emitStrokeSegment = useCallback(
    (
      payload: Omit<StrokeSegmentPayload, 'userId' | 'roomId' | 'timestamp'>
    ) => {
      if (!roomId || !userId) return;
      const fullPayload = {
        ...payload,
        roomId,
        userId,
        timestamp: Date.now(),
      };

      if (!socket || !isConnected) {
        pendingEventsRef.current.push({
          event: 'stroke_segment',
          payload: fullPayload,
        });
        return;
      }
      socket.emit('stroke_segment', fullPayload);
    },
    [socket, isConnected, roomId, userId]
  );

  const emitStrokeEnd = useCallback(
    (payload: Omit<StrokeEndPayload, 'userId' | 'roomId' | 'timestamp'>) => {
      if (!roomId || !userId) return;
      const fullPayload = {
        ...payload,
        roomId,
        userId,
        timestamp: Date.now(),
      };

      if (!socket || !isConnected) {
        pendingEventsRef.current.push({
          event: 'stroke_end',
          payload: fullPayload,
        });
        return;
      }
      socket.emit('stroke_end', fullPayload);
    },
    [socket, isConnected, roomId, userId]
  );

  const emitCoffeePour = useCallback(
    (payload: Omit<CoffeePourPayload, 'userId' | 'roomId' | 'timestamp'>) => {
      if (!roomId || !userId) return;
      const fullPayload = {
        ...payload,
        roomId,
        userId,
        timestamp: Date.now(),
      };

      if (!socket || !isConnected) {
        pendingEventsRef.current.push({
          event: 'coffee_pour',
          payload: fullPayload,
        });
        return;
      }
      socket.emit('coffee_pour', fullPayload);
    },
    [socket, isConnected, roomId, userId]
  );

  const emitCursorMove = useCallback(
    (
      payload: Omit<
        CursorPositionPayload,
        'userId' | 'roomId' | 'userName' | 'userColor' | 'timestamp'
      >
    ) => {
      if (!roomId || !userId || !socket || !isConnected) return;

      const now = Date.now();
      if (now - lastCursorEmitRef.current < CURSOR_THROTTLE_MS) return;
      lastCursorEmitRef.current = now;

      const fullPayload: CursorPositionPayload = {
        ...payload,
        roomId,
        userId,
        userName: userName || 'Anonymous',
        userColor: userColor || brushSettings.color,
        timestamp: now,
      };

      socket.emit('cursor_move', fullPayload);
    },
    [
      socket,
      isConnected,
      roomId,
      userId,
      userName,
      userColor,
      brushSettings.color,
    ]
  );

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        emitStrokeBegin,
        emitStrokeSegment,
        emitStrokeEnd,
        emitCoffeePour,
        emitCursorMove,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
