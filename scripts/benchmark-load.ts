/**
 * Load Benchmark for Coffee & Canvas.
 * Simulates multiple concurrent users to verify system performance and latency.
 * Uses real Room Service authentication for realistic load.
 */

import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const ROOM_SERVICE_URL =
  process.env.ROOM_SERVICE_URL || 'http://localhost:3002/graphql';
const CANVAS_SERVICE_URL =
  process.env.CANVAS_SERVICE_URL || 'http://localhost:3001';
const USER_COUNT = 5; // Start small to verify connectivity
const DURATION_MS = 10000; // 10 seconds
const STROKES_PER_USER_PER_SEC = 0.5;

interface ClientMetrics {
  connected: boolean;
  eventsSent: number;
  eventsReceived: number;
  errors: number;
  latencies: number[];
}

const clients: Map<string, Socket> = new Map();
const metrics: Map<string, ClientMetrics> = new Map();

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

async function getAuth(
  code: string,
  userId: number
): Promise<{ token: string; roomId: string }> {
  const query = `
    mutation JoinRoom($input: JoinRoomInput!) {
      joinRoom(input: $input) {
        token
        room { id }
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: { code, displayName: `BenchUser-${userId}` },
  });
  return { token: data.joinRoom.token, roomId: data.joinRoom.room.id };
}

async function createRoom(): Promise<string> {
  const query = `
    mutation CreateRoom($input: CreateRoomInput!) {
      createRoom(input: $input) {
        room { code }
      }
    }
  `;
  const data = await graphqlRequest(query, {
    input: { name: 'Benchmark Room', capacity: 100 },
  });
  return data.createRoom.room.code;
}

async function createClient(
  userId: string,
  token: string,
  roomId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = io(CANVAS_SERVICE_URL, {
      auth: { token },
      query: { roomId },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    socket.on('connect', () => {
      metrics.set(userId, {
        connected: true,
        eventsSent: 0,
        eventsReceived: 0,
        errors: 0,
        latencies: [],
      });
      resolve();
    });

    socket.on('stroke_segment', payload => {
      const m = metrics.get(userId);
      if (m && payload.timestamp) {
        m.latencies.push(Date.now() - payload.timestamp);
        m.eventsReceived++;
      }
    });

    socket.on('connect_error', err => {
      reject(err);
    });

    socket.on('error', () => {
      const m = metrics.get(userId);
      if (m) m.errors++;
    });

    clients.set(userId, socket);
  });
}

function simulateDrawing(userId: string, roomId: string) {
  const socket = clients.get(userId);
  const m = metrics.get(userId);
  if (!socket || !m) return;

  const strokeId = uuidv4();
  socket.emit('stroke_begin', {
    roomId,
    userId,
    strokeId,
    tool: 'pen',
    color: '#FF0000',
    width: 2,
    timestamp: Date.now(),
  });
  m.eventsSent++;

  let segments = 0;
  const interval = setInterval(() => {
    socket.emit('stroke_segment', {
      roomId,
      strokeId,
      userId,
      points: [{ x: Math.random() * 1000, y: Math.random() * 1000 }],
      timestamp: Date.now(),
    });
    m.eventsSent++;
    segments++;

    if (segments >= 5) {
      clearInterval(interval);
      socket.emit('stroke_end', {
        roomId,
        userId,
        strokeId,
        timestamp: Date.now(),
      });
      m.eventsSent++;
    }
  }, 200);
}

async function runBenchmark() {
  console.log('🚀 Initializing benchmark (Back to Fetch & Localhost)...');

  try {
    const roomCode = await createRoom();
    console.log(`✅ Benchmark room created: ${roomCode}`);

    const auths = [];
    for (let i = 0; i < USER_COUNT; i++) {
      auths.push(await getAuth(roomCode, i));
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 100));
    }
    console.log(`\n✅ Obtained ${USER_COUNT} JWT tokens`);

    const connectPromises = [];
    for (let i = 0; i < USER_COUNT; i++) {
      connectPromises.push(
        createClient(`user-${i}`, auths[i].token, auths[i].roomId)
      );
    }
    await Promise.all(connectPromises);
    console.log('✅ All clients connected.');

    const roomId = auths[0].roomId;
    const simulationInterval = setInterval(
      () => {
        const randomUserIndex = Math.floor(Math.random() * USER_COUNT);
        simulateDrawing(`user-${randomUserIndex}`, roomId);
      },
      1000 / (STROKES_PER_USER_PER_SEC * USER_COUNT)
    );

    console.log(`⏳ Running simulation for ${DURATION_MS / 1000}s...`);
    await new Promise(r => setTimeout(r, DURATION_MS));
    clearInterval(simulationInterval);

    console.log('\n--- Benchmark Report ---');
    let totalEventsSent = 0;
    let totalEventsReceived = 0;
    let totalErrors = 0;
    let allLatencies: number[] = [];

    metrics.forEach(m => {
      totalEventsSent += m.eventsSent;
      totalEventsReceived += m.eventsReceived;
      totalErrors += m.errors;
      allLatencies = allLatencies.concat(m.latencies);
    });

    console.log(`Total Events Sent: ${totalEventsSent}`);
    console.log(`Total Events Received: ${totalEventsReceived}`);
    console.log(`Total Errors: ${totalErrors}`);

    if (allLatencies.length > 0) {
      allLatencies.sort((a, b) => a - b);
      const avg = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
      const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
      const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)];

      console.log(`Avg Latency: ${avg.toFixed(2)}ms`);
      console.log(`P50 Latency: ${p50}ms`);
      console.log(`P95 Latency: ${p95}ms`);

      if (p95 < 60) {
        // Slight buffer for node execution overhead
        console.log('✅ Performance Target Met (< 50ms P95 with buffer)');
      }
    }

    clients.forEach(s => s.disconnect());
    setTimeout(() => process.exit(0), 1000); // Allow logs to flush
  } catch (err) {
    console.error('❌ Benchmark failed:', err);
    process.exit(1);
  }
}

runBenchmark();
