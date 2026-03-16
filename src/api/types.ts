import type { ClientApp } from '../domain/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    clientApp?: ClientApp;
  }
}
