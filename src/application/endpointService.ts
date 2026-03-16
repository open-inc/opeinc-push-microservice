import { encryptString } from '../common/crypto.js';
import type { PushEndpoint } from '../domain/types.js';
import { pushEndpointRepository } from '../persistence/repositories.js';
import type { RegisterEndpointInput, UpdateEndpointInput } from '../api/schemas.js';

export class EndpointService {
  async register(clientAppId: string, input: RegisterEndpointInput): Promise<PushEndpoint> {
    return pushEndpointRepository.create({
      clientAppId,
      channel: input.channel,
      externalRef: input.externalRef,
      tokenOrSubscriptionEncrypted: encryptString(input.tokenOrSubscription),
      platformMetadata: input.platformMetadata,
      status: 'active',
    });
  }

  async update(
    clientAppId: string,
    endpointId: string,
    input: UpdateEndpointInput,
  ): Promise<PushEndpoint | null> {
    const patch: Partial<Omit<PushEndpoint, 'id' | 'clientAppId' | 'createdAt'>> = {};

    if (input.tokenOrSubscription) {
      patch.tokenOrSubscriptionEncrypted = encryptString(input.tokenOrSubscription);
    }

    if (input.platformMetadata) {
      patch.platformMetadata = input.platformMetadata;
    }

    if (input.status) {
      patch.status = input.status;
    }

    return pushEndpointRepository.update(endpointId, clientAppId, patch);
  }

  async deactivate(clientAppId: string, endpointId: string): Promise<boolean> {
    return pushEndpointRepository.deactivate(endpointId, clientAppId);
  }
}
