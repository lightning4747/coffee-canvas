import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Custom Prometheus metrics registry for Canvas Service.
 */
export const metricsRegistry = new Registry();

// Add default node metrics (CPU, Memory, etc.)
collectDefaultMetrics({ register: metricsRegistry, prefix: 'canvas_service_' });

/**
 * Metric to track the total number of connected clients.
 */
export const activeConnections = new Gauge({
  name: 'canvas_service_active_connections',
  help: 'Total number of active Socket.IO connections',
  labelNames: ['room_id'],
  registers: [metricsRegistry],
});

/**
 * Metric to track WebSocket event processing latency.
 */
export const socketEventDuration = new Histogram({
  name: 'canvas_service_socket_event_duration_seconds',
  help: 'Duration of socket event processing in seconds',
  labelNames: ['event_type', 'room_id'],
  buckets: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1], // up to 1s
  registers: [metricsRegistry],
});

/**
 * Metric to track broadcast latency (end-to-end server delay).
 */
export const broadcastLatency = new Histogram({
  name: 'canvas_service_broadcast_latency_seconds',
  help: 'Latency from event reception to broadcast dispatch in seconds',
  labelNames: ['event_type', 'room_id'],
  buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.2], // focus on <50ms target
  registers: [metricsRegistry],
});

/**
 * Metric to track database persistence latency.
 */
export const dbWriteDuration = new Histogram({
  name: 'canvas_service_db_write_duration_seconds',
  help: 'Duration of database write operations in seconds',
  labelNames: ['operation_type'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

/**
 * Metric to track error rates.
 */
export const errorTotal = new Counter({
  name: 'canvas_service_errors_total',
  help: 'Total number of errors encountered in the canvas service',
  labelNames: ['error_type', 'room_id'],
  registers: [metricsRegistry],
});
