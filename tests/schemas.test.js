import { describe, expect, it } from 'vitest';
import { registerEndpointSchema, sendNotificationSchema } from '../src/api/schemas.js';
describe('API schemas', () => {
    it('accepts valid endpoint registration payload', () => {
        const parsed = registerEndpointSchema.safeParse({
            channel: 'fcm',
            tokenOrSubscription: 'device-token',
            platformMetadata: { os: 'android' }
        });
        expect(parsed.success).toBe(true);
    });
    it('rejects invalid send payload', () => {
        const parsed = sendNotificationSchema.safeParse({
            payload: {
                title: '',
                body: 'hello'
            }
        });
        expect(parsed.success).toBe(false);
    });
});
