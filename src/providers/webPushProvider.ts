import webPush from 'web-push';
import type { PushSubscription } from 'web-push';
import { config } from '../config.js';
import type { PushEndpoint } from '../domain/types.js';
import type { ProviderSendInput, ProviderSendResult, PushProvider } from './provider.js';

const normalizeBase64Url = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error('Invalid Base64URL value');
  }

  return normalized;
};

const normalizeWebPushTopic = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return /^[A-Za-z0-9_-]{1,32}$/.test(normalized) ? normalized : undefined;
};

type WebPushSubscriptionLike = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

const normalizeSubscription = (subscription: WebPushSubscriptionLike): PushSubscription => {
  if (!subscription || typeof subscription !== 'object') {
    throw new Error('Invalid webpush subscription payload');
  }

  if (typeof subscription.endpoint !== 'string' || subscription.endpoint.length === 0) {
    throw new Error('Invalid webpush subscription endpoint');
  }

  const keys = subscription.keys;
  if (!keys || typeof keys !== 'object') {
    throw new Error('Invalid webpush subscription keys');
  }

  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    throw new Error('Invalid webpush subscription key values');
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === 'number' || subscription.expirationTime === null
        ? subscription.expirationTime
        : null,
    keys: {
      p256dh: normalizeBase64Url(keys.p256dh),
      auth: normalizeBase64Url(keys.auth),
    },
  };
};

export class WebPushProvider implements PushProvider {
  public readonly channel = 'webpush' as const;

  constructor() {
    if (config.WEB_PUSH_VAPID_PUBLIC_KEY && config.WEB_PUSH_VAPID_PRIVATE_KEY) {
      webPush.setVapidDetails(
        config.WEB_PUSH_VAPID_SUBJECT,
        normalizeBase64Url(config.WEB_PUSH_VAPID_PUBLIC_KEY),
        normalizeBase64Url(config.WEB_PUSH_VAPID_PRIVATE_KEY),
      );
    }
  }

  validateEndpoint(endpoint: PushEndpoint): { valid: boolean; reason?: string } {
    if (endpoint.channel !== 'webpush') {
      return { valid: false, reason: 'Invalid channel for WebPush provider' };
    }

    return { valid: true };
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    try {
      const parsedSubscription = JSON.parse(input.target) as WebPushSubscriptionLike;
      const subscription = normalizeSubscription(parsedSubscription);
      const urgencyRaw = input.options.urgency;
      const urgency: 'very-low' | 'low' | 'normal' | 'high' | undefined =
        urgencyRaw === 'very-low' ||
        urgencyRaw === 'low' ||
        urgencyRaw === 'normal' ||
        urgencyRaw === 'high'
          ? urgencyRaw
          : undefined;

      const payload = {
        topic: input.topic,
        payload: input.payload,
        data: input.options.data,
      };

      const webpushOptions = {
        TTL: typeof input.options.ttl === 'number' ? input.options.ttl : undefined,
        urgency,
        topic: normalizeWebPushTopic(input.options.topic) ?? normalizeWebPushTopic(input.topic),
      };

      await webPush.sendNotification(subscription, JSON.stringify(payload), webpushOptions);
      return { outcome: 'success', providerResponse: { accepted: true } };
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;

      if (statusCode && statusCode >= 500) {
        return {
          outcome: 'retryable_failure',
          errorCode: 'WEBPUSH_RETRYABLE',
          errorMessage: String(error),
        };
      }

      return {
        outcome: 'permanent_failure',
        errorCode: 'WEBPUSH_PERMANENT',
        errorMessage: String(error),
      };
    }
  }
}
