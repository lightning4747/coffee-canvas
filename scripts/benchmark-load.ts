/**
 * Load Benchmark for Coffee & Canvas.
 * Simulates multiple concurrent users to verify system performance and latency.
 */

import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const CANVAS_SERVICE_URL =
  process.env.CANVAS_SERVICE_URL || 'http://localhost:3001';
const ROOM_ID = 'benchmark-room-' + Date.now();
const USER_COUNT = 50;
const DURATION_MS = 30000; // 30 seconds
const EVENTS_PER_SECOND = 10;

interface ClientMetrics {
  connected: boolean;
  eventsSent: number;
  errors: number;
  latencies: number[];
}

const clients: Map<string, Socket> = new Map();
const metrics: Map<string, ClientMetrics> = new Map();

async function createClient(userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = io(CANVAS_SERVICE_URL, {
      query: {
        roomId: ROOM_ID,
        userId: userId,
        displayName: `Bench-${userId.substring(0, 4)}`,
        token: 'mock-token', // In real scenario, generate a valid JWT
      },
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      metrics.set(userId, {
        connected: true,
        eventsSent: 0,
        errors: 0,
        latencies: [],
      });
      console.log(`Client ${userId} connected`);
      resolve();
    });

    socket.on('connect_error', err => {
      console.error(`Client ${userId} connection error:`, err.message);
      reject(err);
    });

    socket.on('error', () => {
      const m = metrics.get(userId);
      if (m) m.errors++;
    });

    clients.set(userId, socket);
  });
}

function simulateDrawing(userId: string) {
  const socket = clients.get(userId);
  const m = metrics.get(userId);
  if (!socket || !m) return;

  const strokeId = uuidv4();

  // stroke_begin
  socket.emit('stroke_begin', {
    roomId: ROOM_ID,
    userId: userId,
    strokeId,
    tool: 'pen',
    color: '#FF0000',
    width: 2,
    point: { x: Math.random() * 1000, y: Math.random() * 1000 },
    timestamp: Date.now(),
  });
  m.eventsSent++;

  // stroke_segment (simulated)
  let segments = 0;
  const interval = setInterval(() => {
    socket.emit('stroke_segment', {
      roomId: ROOM_ID,
      strokeId,
      point: { x: Math.random() * 1000, y: Math.random() * 1000 },
      timestamp: Date.now(),
    });
    m.eventsSent++;
    segments++;

    if (segments >= 10) {
      clearInterval(interval);
      // stroke_end
      socket.emit('stroke_end', {
        roomId: ROOM_ID,
        userId: userId,
        strokeId,
        timestamp: Date.now(),
      });
      m.eventsSent++;
    }
  }, 100);
}

async function runBenchmark() {
  console.log(
    `Starting benchmark with ${USER_COUNT} users in room ${ROOM_ID}...`
  );

  // 1. Connect clients
  const connectPromises = [];
  for (let i = 0; i < USER_COUNT; i++) {
    connectPromises.push(createClient(`user-${i}`));
    await new Promise(r => setTimeout(r, 50)); // Stagger connections
  }
  await Promise.all(connectPromises);
  console.log('All clients connected.');

  // 2. Run simulation
  const simulationInterval = setInterval(
    () => {
      const randomUserIndex = Math.floor(Math.random() * USER_COUNT);
      simulateDrawing(`user-${randomUserIndex}`);
    },
    1000 / (EVENTS_PER_SECOND * USER_COUNT)
  );

  // 3. Monitor
  await new Promise(r => setTimeout(r, DURATION_MS));
  clearInterval(simulationInterval);

  // 4. Report
  console.log('\n--- Benchmark Report ---');
  console.log(`Duration: ${DURATION_MS / 1000}s`);
  console.log(`Target Users: ${USER_COUNT}`);

  let totalEvents = 0;
  let totalErrors = 0;
  metrics.forEach(m => {
    totalEvents += m.eventsSent;
    totalErrors += m.errors;
  });

  console.log(`Total Events Sent: ${totalEvents}`);
  console.log(
    `Average Throughput: ${(totalEvents / (DURATION_MS / 1000)).toFixed(2)} events/s`
  );
  console.log(`Total Errors: ${totalErrors}`);

  // 5. Cleanup
  clients.forEach(s => s.disconnect());
  process.exit(0);
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
