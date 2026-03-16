import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushEndpoint } from '../domain/types.js';
import { config } from '../config.js';
import type { ProviderSendInput, ProviderSendResult, PushProvider } from './provider.js';

export class FcmProvider implements PushProvider {
  public readonly channel = 'fcm' as const;

  constructor() {
    if (!config.FCM_SERVICE_ACCOUNT_JSON) {
      return;
    }

    if (getApps().length === 0) {
      const credentials = JSON.parse(config.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
      initializeApp({ credential: cert(credentials) });
    }
  }

  validateEndpoint(endpoint: PushEndpoint): { valid: boolean; reason?: string } {
    if (endpoint.channel !== 'fcm') {
      return { valid: false, reason: 'Invalid channel for FCM provider' };
    }
    return { valid: true };
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    try {
      const dataPayload = {
        topic: input.topic,
        payload: input.payload,
        ...(typeof input.options.data === 'object' && input.options.data
          ? (input.options.data as Record<string, unknown>)
          : {}),
      };

      const response = await getMessaging().send({
        token: input.target,
        data: Object.entries(dataPayload).reduce<Record<string, string>>(
          (accumulator, [key, value]) => {
            accumulator[key] = typeof value === 'string' ? value : JSON.stringify(value);
            return accumulator;
          },
          {},
        ),
      });

      return { outcome: 'success', providerResponse: { messageId: response } };
    } catch (error) {
      const message = String(error);
      const retryable = /unavailable|internal|deadline|resource-exhausted/i.test(message);

      return {
        outcome: retryable ? 'retryable_failure' : 'permanent_failure',
        errorCode: retryable ? 'FCM_RETRYABLE' : 'FCM_PERMANENT',
        errorMessage: message,
      };
    }
  }
}
