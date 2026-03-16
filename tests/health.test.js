import { beforeAll, describe, expect, it } from 'vitest';
const setupEnv = () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    process.env.MONGODB_DB_NAME = 'openinc_push_test';
    process.env.MONGODB_COLLECTION_PREFIX = 'openinc_push_test_';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_KEY_SALT = 'test-salt-1234';
    process.env.DEFAULT_MAX_ATTEMPTS = '3';
    process.env.WORKER_POLL_INTERVAL_MS = '1000';
    process.env.WORKER_BATCH_SIZE = '1';
    process.env.WORKER_LEASE_MS = '10000';
    process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
};
describe('health endpoints', () => {
    beforeAll(() => {
        setupEnv();
    });
    it('returns live status', async () => {
        const { buildApp } = await import('../src/app.js');
        const app = await buildApp();
        const response = await app.inject({
            method: 'GET',
            url: '/health/live'
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
        await app.close();
    });
});
