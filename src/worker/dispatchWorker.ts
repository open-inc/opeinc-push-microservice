import { decryptString } from '../common/crypto.js';
import { config } from '../config.js';
import {
  deliveryAttemptRepository,
  dispatchJobRepository,
  notificationRequestRepository,
  pushEndpointRepository,
} from '../persistence/repositories.js';
import { getProvider } from '../providers/providerRegistry.js';
import type { ProviderSendInput } from '../providers/provider.js';
import { logger } from '../observability/logger.js';
import { metrics } from '../observability/metrics.js';
import { NotificationService } from '../application/notificationService.js';

const notificationService = new NotificationService();

const calculateBackoff = (attemptCount: number): number => {
  const base = 1000;
  const max = 60_000;
  return Math.min(base * 2 ** Math.max(0, attemptCount - 1), max);
};

const summarizeOutcomes = (
  outcomes: Array<'success' | 'retryable_failure' | 'permanent_failure'>,
) => {
  const successCount = outcomes.filter((outcome) => outcome === 'success').length;
  const retryableCount = outcomes.filter((outcome) => outcome === 'retryable_failure').length;

  if (retryableCount > 0) {
    return { finalStatus: 'processing' as const, hasRetryable: true, successCount };
  }

  if (successCount === outcomes.length) {
    return { finalStatus: 'sent' as const, hasRetryable: false, successCount };
  }

  if (successCount > 0) {
    return { finalStatus: 'partially_sent' as const, hasRetryable: false, successCount };
  }

  return { finalStatus: 'failed' as const, hasRetryable: false, successCount };
};

const buildProviderSendInput = (
  channel: 'webpush' | 'fcm' | 'apns' | 'email',
  target: string,
  normalizedPayload: Record<string, unknown>,
): ProviderSendInput => {
  const baseOptions: Record<string, unknown> = {
    data:
      typeof normalizedPayload.data === 'object' && normalizedPayload.data
        ? (normalizedPayload.data as Record<string, unknown>)
        : {},
    ttl: typeof normalizedPayload.ttl === 'number' ? normalizedPayload.ttl : undefined,
    priority:
      typeof normalizedPayload.priority === 'string' ? normalizedPayload.priority : undefined,
    collapseKey:
      typeof normalizedPayload.collapseKey === 'string' ? normalizedPayload.collapseKey : undefined,
  };

  const channelOptions =
    typeof normalizedPayload[channel] === 'object' && normalizedPayload[channel]
      ? (normalizedPayload[channel] as Record<string, unknown>)
      : {};

  const mergedOptions = {
    ...baseOptions,
    ...channelOptions,
  };

  const defaultTopic =
    typeof normalizedPayload.title === 'string' && normalizedPayload.title.length > 0
      ? normalizedPayload.title
      : 'Notification';

  const topic =
    channel === 'email' &&
    typeof mergedOptions.subject === 'string' &&
    mergedOptions.subject.length > 0
      ? mergedOptions.subject
      : defaultTopic;

  return {
    target,
    topic,
    payload: typeof normalizedPayload.body === 'string' ? normalizedPayload.body : '',
    options: mergedOptions,
  };
};

export const runDispatchCycle = async (): Promise<void> => {
  const jobs = await dispatchJobRepository.leaseBatch(
    config.WORKER_BATCH_SIZE,
    config.WORKER_LEASE_MS,
  );
  metrics.dispatchJobsPending.set(await dispatchJobRepository.pendingCount());

  if (jobs.length === 0) {
    return;
  }

  for (const job of jobs) {
    const endTimer = metrics.dispatchProcessingDurationMs.startTimer();
    try {
      const request = await notificationRequestRepository.findById(job.notificationRequestId);
      if (!request) {
        await dispatchJobRepository.markDead(job.id, 'Request not found');
        metrics.dispatchJobsDeadTotal.inc();
        continue;
      }

      await notificationRequestRepository.updateStatus(request.id, 'processing');

      const endpoints = await notificationService.resolveTargetEndpoints(
        request.clientAppId,
        request.targeting,
      );
      const outcomes: Array<'success' | 'retryable_failure' | 'permanent_failure'> = [];

      for (const endpoint of endpoints) {
        const provider = getProvider(endpoint.channel);
        const payload = {
          ...request.payloadNormalized,
          data: {
            ...(typeof request.payloadNormalized.data === 'object' && request.payloadNormalized.data
              ? (request.payloadNormalized.data as Record<string, unknown>)
              : {}),
          },
        };

        const endpointForProvider = {
          ...endpoint,
          tokenOrSubscriptionEncrypted: decryptString(endpoint.tokenOrSubscriptionEncrypted),
        };

        const validation = provider.validateEndpoint(endpointForProvider);
        if (!validation.valid) {
          outcomes.push('permanent_failure');
          await deliveryAttemptRepository.create({
            notificationRequestId: request.id,
            pushEndpointId: endpoint.id,
            provider: endpoint.channel,
            attemptNumber: job.attemptCount + 1,
            outcome: 'permanent_failure',
            errorCode: 'ENDPOINT_INVALID',
            errorMessage: validation.reason,
          });
          continue;
        }

        const sendInput = buildProviderSendInput(
          endpoint.channel,
          endpointForProvider.tokenOrSubscriptionEncrypted,
          payload,
        );

        const result = await provider.send(sendInput);

        outcomes.push(result.outcome);
        metrics.deliveryAttemptsTotal.inc({ provider: endpoint.channel, outcome: result.outcome });

        await deliveryAttemptRepository.create({
          notificationRequestId: request.id,
          pushEndpointId: endpoint.id,
          provider: endpoint.channel,
          attemptNumber: job.attemptCount + 1,
          outcome: result.outcome,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          providerResponse: result.providerResponse,
          nextRetryAt:
            result.outcome === 'retryable_failure'
              ? new Date(Date.now() + calculateBackoff(job.attemptCount + 1))
              : undefined,
        });

        if (result.outcome === 'permanent_failure') {
          await pushEndpointRepository.markInvalid(endpoint.id);
        }
      }

      const summary = summarizeOutcomes(outcomes);

      if (summary.hasRetryable && job.attemptCount + 1 < config.DEFAULT_MAX_ATTEMPTS) {
        const backoff = calculateBackoff(job.attemptCount + 1);
        await dispatchJobRepository.reschedule(
          job.id,
          job.attemptCount + 1,
          new Date(Date.now() + backoff),
          'Retryable provider failure',
        );
      } else if (summary.hasRetryable) {
        await dispatchJobRepository.markDead(job.id, 'Max attempts reached');
        await notificationRequestRepository.updateStatus(request.id, 'failed');
        metrics.dispatchJobsDeadTotal.inc();
        metrics.notificationsFailedTotal.inc();
      } else {
        await dispatchJobRepository.markDone(job.id);
        await notificationRequestRepository.updateStatus(request.id, summary.finalStatus);
        if (summary.finalStatus === 'sent' || summary.finalStatus === 'partially_sent') {
          metrics.notificationsSentTotal.inc();
        } else {
          metrics.notificationsFailedTotal.inc();
        }
      }
    } catch (error) {
      logger.error({ err: error, jobId: job.id }, 'Dispatch job failed unexpectedly');
      const nextAttempt = job.attemptCount + 1;
      if (nextAttempt >= config.DEFAULT_MAX_ATTEMPTS) {
        await dispatchJobRepository.markDead(job.id, String(error));
        metrics.dispatchJobsDeadTotal.inc();
      } else {
        const backoff = calculateBackoff(nextAttempt);
        await dispatchJobRepository.reschedule(
          job.id,
          nextAttempt,
          new Date(Date.now() + backoff),
          String(error),
        );
      }
    } finally {
      endTimer();
    }
  }
};

export const startDispatchWorker = (): NodeJS.Timeout => {
  logger.info('Starting dispatch worker loop');

  return setInterval(() => {
    runDispatchCycle().catch((error) => {
      logger.error({ err: error }, 'Dispatch cycle failed');
    });
  }, config.WORKER_POLL_INTERVAL_MS);
};
