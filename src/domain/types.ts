export type Channel = 'webpush' | 'fcm' | 'apns' | 'email';

export type EndpointStatus = 'active' | 'invalid' | 'unsubscribed';

export type NotificationStatus =
  | 'accepted'
  | 'processing'
  | 'sent'
  | 'partially_sent'
  | 'failed'
  | 'expired';

export type AttemptOutcome = 'success' | 'retryable_failure' | 'permanent_failure';

export type DispatchJobStatus = 'pending' | 'leased' | 'done' | 'dead';

export interface ClientApp {
  id: string;
  name: string;
  apiKeyHash: string;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

export interface PushEndpoint {
  id: string;
  clientAppId: string;
  channel: Channel;
  externalRef?: string;
  tokenOrSubscriptionEncrypted: string;
  platformMetadata?: Record<string, unknown>;
  status: EndpointStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRequest {
  id: string;
  clientAppId: string;
  idempotencyKey?: string;
  payloadNormalized: Record<string, unknown>;
  targeting: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryAttempt {
  id: string;
  notificationRequestId: string;
  pushEndpointId: string;
  provider: Channel;
  attemptNumber: number;
  outcome: AttemptOutcome;
  errorCode?: string;
  errorMessage?: string;
  providerResponse?: Record<string, unknown>;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchJob {
  id: string;
  notificationRequestId: string;
  status: DispatchJobStatus;
  availableAt: Date;
  leaseUntil?: Date;
  attemptCount: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}
