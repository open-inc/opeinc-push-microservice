import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

export const metrics = {
  notificationsAcceptedTotal: new Counter({
    name: 'notifications_accepted_total',
    help: 'Total accepted notifications',
    registers: [register],
  }),
  notificationsSentTotal: new Counter({
    name: 'notifications_sent_total',
    help: 'Total sent notifications',
    registers: [register],
  }),
  notificationsFailedTotal: new Counter({
    name: 'notifications_failed_total',
    help: 'Total failed notifications',
    registers: [register],
  }),
  deliveryAttemptsTotal: new Counter({
    name: 'delivery_attempts_total',
    help: 'Delivery attempts by provider and outcome',
    labelNames: ['provider', 'outcome'],
    registers: [register],
  }),
  dispatchJobsPending: new Gauge({
    name: 'dispatch_jobs_pending',
    help: 'Current pending dispatch jobs',
    registers: [register],
  }),
  dispatchJobsDeadTotal: new Counter({
    name: 'dispatch_jobs_dead_total',
    help: 'Dead dispatch jobs',
    registers: [register],
  }),
  dispatchProcessingDurationMs: new Histogram({
    name: 'dispatch_processing_duration_ms',
    help: 'Dispatch processing duration in ms',
    buckets: [10, 50, 100, 250, 500, 1000, 5000],
    registers: [register],
  }),
};

export const metricsRegistry = register;
