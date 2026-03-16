import type { Channel, PushEndpoint } from '../domain/types.js';

export interface ProviderSendInput {
  target: string;
  topic: string;
  payload: string;
  options: Record<string, unknown>;
}

export interface ProviderSendResult {
  outcome: 'success' | 'retryable_failure' | 'permanent_failure';
  providerResponse?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface PushProvider {
  readonly channel: Channel;
  validateEndpoint(endpoint: PushEndpoint): { valid: boolean; reason?: string };
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}
