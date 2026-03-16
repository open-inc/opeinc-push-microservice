import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { AuthService } from '../application/authService.js';

const authService = new AuthService();

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (
      request.url.startsWith('/health') ||
      request.url.startsWith('/metrics') ||
      request.url.startsWith('/docs') ||
      request.url.startsWith('/webpush/') ||
      request.url.startsWith('/email/')
    ) {
      return;
    }

    const apiKey = request.headers['x-api-key'];
    const normalized = Array.isArray(apiKey) ? apiKey[0] : apiKey;

    try {
      request.clientApp = await authService.authenticate(normalized);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
};

export const authPlugin = fp(plugin);
