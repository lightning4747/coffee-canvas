/**
 * System Integration Test for Coffee & Canvas.
 * Validates the full flow across Room Service, Canvas Service, and Physics Service.
 */

import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const ROOM_SERVICE_URL =
  process.env.ROOM_SERVICE_URL || 'http://localhost:3002/graphql';
const CANVAS_SERVICE_URL =
  process.env.CANVAS_SERVICE_URL || 'http://localhost:3001';

interface UserContext {
  userId: string;
  token: string;
  displayName: string;
  color: string;
}

interface RoomContext {
  id: string;
  code: string;
}

async function graphqlRequest(query: string, variables: any = {}) {
  const response = await fetch(ROOM_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

async function createRoom(): Promise<{ room: RoomContext; user: UserContext }> {
  const query = `
    mutation CreateRoom($input: CreateRoomInput!) {
      createRoom(input: $input) {
        token
        room { id code }
        user { id displayName color }
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: { name: 'Integration Test Room', capacity: 10 },
  });
  return {
    room: data.createRoom.room,
    user: {
      userId: data.createRoom.user.id,
      token: data.createRoom.token,
      displayName: data.createRoom.user.displayName,
      color: data.createRoom.user.color,
    },
  };
}

async function joinRoom(
  code: string,
  displayName: string
): Promise<{ room: RoomContext; user: UserContext }> {
  const query = `
    mutation JoinRoom($input: JoinRoomInput!) {
      joinRoom(input: $input) {
        token
        room { id code }
        user { id displayName color }
      }
    }
  `;
  const data = await graphqlRequest(query, { input: { code, displayName } });
  return {
    room: data.joinRoom.room,
    user: {
      userId: data.joinRoom.user.id,
      token: data.joinRoom.token,
      displayName: data.joinRoom.user.displayName,
      color: data.joinRoom.user.color,
    },
  };
}

function connectSocket(
  url: string,
  token: string,
  roomId: string
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      auth: { token },
      query: { roomId },
      transports: ['websocket'],
    });

    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', err => reject(err));
  });
}

async function runTest() {
  console.log('🚀 Starting System Integration Test...');

  try {
    // 1. Create a room
    const { room, user: creator } = await createRoom();
    console.log(`✅ Room created: ${room.code} (${room.id})`);

    // 2. Join as a second user
    const { user: joiner } = await joinRoom(room.code, 'Collaborator');
    console.log(`✅ Second user joined: ${joiner.displayName}`);

    // 3. Connect both users to Canvas Service
    const creatorSocket = await connectSocket(
      CANVAS_SERVICE_URL,
      creator.token,
      room.id
    );
    const joinerSocket = await connectSocket(
      CANVAS_SERVICE_URL,
      joiner.token,
      room.id
    );
    console.log('✅ Both users connected to Canvas Service');

    // 4. Test Drawing Synchronization
    console.log('✍️ Testing drawing synchronization...');
    const strokeId = uuidv4();
    const startTime = Date.now();
    let broadcastLatency = -1;

    const segmentPromise = new Promise<void>(resolve => {
      joinerSocket.on('stroke_segment', payload => {
        // In shared types, StrokeSegmentPayload has strokeId at top level
        if (payload.strokeId === strokeId) {
          broadcastLatency = Date.now() - startTime;
          resolve();
        }
      });
    });

    creatorSocket.emit('stroke_begin', {
      roomId: room.id,
      userId: creator.userId,
      strokeId,
      tool: 'pen',
      color: creator.color,
      width: 2,
      timestamp: startTime,
    });

    creatorSocket.emit('stroke_segment', {
      roomId: room.id,
      userId: creator.userId,
      strokeId,
      points: [
        { x: 100, y: 100 },
        { x: 110, y: 110 },
      ],
      timestamp: Date.now(),
    });

    await Promise.race([
      segmentPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Drawing broadcast timeout')), 5000)
      ),
    ]);

    console.log(
      `✅ Drawing broadcast received. Latency: ${broadcastLatency}ms`
    );
    if (broadcastLatency > 50) {
      console.warn('⚠️ Drawing latency exceeds 50ms target!');
    }

    // 5. Test Coffee Pour Physics Integration
    console.log('☕ Testing coffee pour physics integration...');
    const pourId = uuidv4();
    const pourStartTime = Date.now();
    let physicsLatency = -1;

    const stainPromise = new Promise<void>(resolve => {
      // The event emitted by server is 'stain_result'
      joinerSocket.on('stain_result', payload => {
        if (payload.pourId === pourId) {
          physicsLatency = Date.now() - pourStartTime;
          resolve();
        }
      });
    });

    creatorSocket.emit('coffee_pour', {
      roomId: room.id,
      userId: creator.userId,
      pourId,
      origin: { x: 150, y: 150 },
      intensity: 0.8,
      timestamp: pourStartTime,
    });

    await Promise.race([
      stainPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stain broadcast timeout')), 10000)
      ),
    ]);

    console.log(`✅ Physics stain received. Latency: ${physicsLatency}ms`);
    if (physicsLatency > 150) {
      // 100ms processing + network overhead
      console.warn('⚠️ Physics latency exceeds 100ms processing target!');
    }

    // 6. Finalize stroke
    creatorSocket.emit('stroke_end', {
      roomId: room.id,
      userId: creator.userId,
      strokeId,
      timestamp: Date.now(),
    });

    console.log('🏁 System Integration Test Completed Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Integration Test Failed:', err);
    process.exit(1);
  }
}

runTest();
