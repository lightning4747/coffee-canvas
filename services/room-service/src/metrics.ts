import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'room_service_' });

export const graphqlQueryDuration = new Histogram({
  name: 'room_service_graphql_query_duration_seconds',
  help: 'Duration of GraphQL queries in seconds',
  labelNames: ['operation_name', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const dbReadDuration = new Histogram({
  name: 'room_service_db_read_duration_seconds',
  help: 'Duration of database read operations in seconds',
  labelNames: ['query_type'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry],
});

export const errorTotal = new Counter({
  name: 'room_service_errors_total',
  help: 'Total number of errors encountered in the room service',
  labelNames: ['error_type'],
  registers: [metricsRegistry],
});
