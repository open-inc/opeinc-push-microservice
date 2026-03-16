import apn from 'apn';
import { config } from '../config.js';
import type { PushEndpoint } from '../domain/types.js';
import type { ProviderSendInput, ProviderSendResult, PushProvider } from './provider.js';

export class ApnsProvider implements PushProvider {
  public readonly channel = 'apns' as const;

  private readonly provider: apn.Provider | null;

  constructor() {
    if (
      !config.APNS_KEY_PATH ||
      !config.APNS_KEY_ID ||
      !config.APNS_TEAM_ID ||
      !config.APNS_TOPIC
    ) {
      this.provider = null;
      return;
    }

    this.provider = new apn.Provider({
      token: {
        key: config.APNS_KEY_PATH,
        keyId: config.APNS_KEY_ID,
        teamId: config.APNS_TEAM_ID,
      },
      production: config.APNS_PRODUCTION,
    });
  }

  validateEndpoint(endpoint: PushEndpoint): { valid: boolean; reason?: string } {
    if (endpoint.channel !== 'apns') {
      return { valid: false, reason: 'Invalid channel for APNs provider' };
    }

    if (!this.provider) {
      return { valid: false, reason: 'APNs provider not configured' };
    }

    return { valid: true };
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    if (!this.provider || !config.APNS_TOPIC) {
      return {
        outcome: 'permanent_failure',
        errorCode: 'APNS_NOT_CONFIGURED',
        errorMessage: 'APNs provider not configured',
      };
    }

    try {
      const apnsData =
        typeof input.options.data === 'object' && input.options.data
          ? (input.options.data as Record<string, unknown>)
          : {};

      const notification = new apn.Notification({
        payload: apnsData,
        topic: config.APNS_TOPIC,
        priority:
          typeof input.options.apnsPriority === 'number' ? input.options.apnsPriority : undefined,
        collapseId:
          typeof input.options.apnsCollapseId === 'string'
            ? input.options.apnsCollapseId
            : undefined,
        alert: {
          title: input.topic,
          body: input.payload,
        },
      });

      const result = await this.provider.send(notification, input.target);

      if (result.failed.length > 0) {
        const failed = result.failed[0];
        if (!failed) {
          return {
            outcome: 'retryable_failure',
            errorCode: 'APNS_UNKNOWN_FAILURE',
            errorMessage: 'Unknown APNs failure',
          };
        }

        const reason =
          typeof failed.response?.reason === 'string'
            ? failed.response.reason
            : typeof failed.error === 'object' && failed.error
              ? String(failed.error)
              : 'APNs failure';

        const retryable = /TooManyRequests|InternalServerError|ServiceUnavailable/i.test(reason);

        return {
          outcome: retryable ? 'retryable_failure' : 'permanent_failure',
          errorCode: retryable ? 'APNS_RETRYABLE' : 'APNS_PERMANENT',
          errorMessage: reason,
        };
      }

      return {
        outcome: 'success',
        providerResponse: {
          sent: result.sent.length,
          failed: result.failed.length,
        },
      };
    } catch (error) {
      const message = String(error);
      return {
        outcome: 'retryable_failure',
        errorCode: 'APNS_SEND_ERROR',
        errorMessage: message,
      };
    }
  }
}
