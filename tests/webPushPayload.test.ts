import { beforeAll, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn().mockResolvedValue({ statusCode: 201 });

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

const SUBSCRIPTION = JSON.stringify({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  expirationTime: null,
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

beforeAll(() => {
  process.env.OPENINC_PUSH_MONGODB_URI = 'mongodb://localhost:27017';
  process.env.OPENINC_PUSH_MONGODB_DB_NAME = 'test';
  process.env.OPENINC_PUSH_API_KEY_SALT = 'test-salt-value';
  process.env.OPENINC_PUSH_ENCRYPTION_KEY_BASE64 = 'kELtyq0hs3+JpMstEh+FlrqLreKjkqM0CFrN+FA7SEg=';
});

/**
 * The pushed JSON is a wire contract with the open.DASH service worker: a shape
 * change is invisible on the server and silently renders nothing in the
 * browser. Pin it.
 */
describe('web push payload envelope', () => {
  it('sends the open.DASH notification envelope', async () => {
    const { WebPushProvider } = await import('../src/providers/webPushProvider.js');

    await new WebPushProvider().send({
      target: SUBSCRIPTION,
      topic: 'Service Alert',
      payload: 'Queue length exceeded threshold',
      options: {
        data: { url: '/service/tickets/abc', notificationId: 'XsD36g91jG' },
        icon: 'https://example.com/icon.png',
        ttl: 0,
      },
    });

    expect(sendNotification).toHaveBeenCalledOnce();

    const [, body] = sendNotification.mock.calls[0] as [unknown, string];

    expect(JSON.parse(body)).toEqual({
      type: 'notification',
      title: 'Service Alert',
      options: {
        body: 'Queue length exceeded threshold',
        data: { url: '/service/tickets/abc', notificationId: 'XsD36g91jG' },
        icon: 'https://example.com/icon.png',
      },
    });
  });

  it('omits icon when none was supplied and defaults data to an object', async () => {
    sendNotification.mockClear();

    const { WebPushProvider } = await import('../src/providers/webPushProvider.js');

    await new WebPushProvider().send({
      target: SUBSCRIPTION,
      topic: 'Plain',
      payload: 'No icon',
      options: {},
    });

    const [, body] = sendNotification.mock.calls[0] as [unknown, string];

    expect(JSON.parse(body)).toEqual({
      type: 'notification',
      title: 'Plain',
      options: { body: 'No icon', data: {} },
    });
  });

  it('treats an empty icon string as no icon', async () => {
    sendNotification.mockClear();

    const { WebPushProvider } = await import('../src/providers/webPushProvider.js');

    await new WebPushProvider().send({
      target: SUBSCRIPTION,
      topic: 'Plain',
      payload: 'Unset icon config',
      options: { icon: '' },
    });

    const [, body] = sendNotification.mock.calls[0] as [unknown, string];

    expect(JSON.parse(body).options).not.toHaveProperty('icon');
  });
});
