import type { DeliveryAttempt, NotificationRequest, PushEndpoint } from '../domain/types.js';
import {
  deliveryAttemptRepository,
  dispatchJobRepository,
  notificationRequestRepository,
  pushEndpointRepository,
} from '../persistence/repositories.js';
import type { SendNotificationInput } from '../api/schemas.js';

export class NotificationService {
  async submit(
    clientAppId: string,
    input: SendNotificationInput,
    idempotencyKey?: string,
  ): Promise<NotificationRequest> {
    if (idempotencyKey) {
      const existing = await notificationRequestRepository.findByIdempotencyKey(
        clientAppId,
        idempotencyKey,
      );

      if (existing) {
        return existing;
      }
    }

    const notificationRequest = await notificationRequestRepository.create({
      clientAppId,
      idempotencyKey,
      payloadNormalized: input.payload,
      targeting: {
        endpointIds: input.endpointIds ?? [],
        externalRefs: input.externalRefs ?? [],
      },
      status: 'accepted',
    });

    await dispatchJobRepository.create(notificationRequest.id);

    return notificationRequest;
  }

  async status(notificationRequestId: string): Promise<{
    request: NotificationRequest | null;
    attempts: DeliveryAttempt[];
  }> {
    const request = await notificationRequestRepository.findById(notificationRequestId);
    if (!request) {
      return { request: null, attempts: [] };
    }

    const attempts =
      await deliveryAttemptRepository.listByNotificationRequest(notificationRequestId);

    return { request, attempts };
  }

  async resolveTargetEndpoints(
    clientAppId: string,
    targeting: Record<string, unknown>,
  ): Promise<PushEndpoint[]> {
    const endpointIds = Array.isArray(targeting.endpointIds)
      ? targeting.endpointIds.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (endpointIds.length > 0) {
      return pushEndpointRepository.findByIds(endpointIds, clientAppId);
    }

    return pushEndpointRepository.listActiveByClient(clientAppId);
  }
}
