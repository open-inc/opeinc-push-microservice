import type { Channel } from '../domain/types.js';
import type { PushProvider } from './provider.js';
import { WebPushProvider } from './webPushProvider.js';
import { FcmProvider } from './fcmProvider.js';
import { ApnsProvider } from './apnsProvider.js';
import { EmailProvider } from './emailProvider.js';

const providers: Record<Channel, PushProvider> = {
  webpush: new WebPushProvider(),
  fcm: new FcmProvider(),
  apns: new ApnsProvider(),
  email: new EmailProvider(),
};

export const getProvider = (channel: Channel): PushProvider => providers[channel];
