import { describe, expect, it } from 'vitest';
import { registerEndpointSchema, sendNotificationSchema } from '../src/api/schemas.js';

describe('API schemas', () => {
  it('accepts valid endpoint registration payload', () => {
    const parsed = registerEndpointSchema.safeParse({
      channel: 'email',
      tokenOrSubscription: 'ops@example.com',
      platformMetadata: { source: 'm2m' },
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects invalid send payload', () => {
    const parsed = sendNotificationSchema.safeParse({
      payload: {
        title: '',
        body: 'hello',
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts send payload with email override', () => {
    const parsed = sendNotificationSchema.safeParse({
      payload: {
        title: 'Service Alert',
        body: 'Queue is growing',
        email: {
          subject: 'Alert: Queue growth',
          html: '<strong>Queue is growing</strong>',
        },
      },
    });

    expect(parsed.success).toBe(true);
  });
});
