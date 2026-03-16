import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from './api/authPlugin.js';
import { routes } from './api/routes.js';
import { logger } from './observability/logger.js';

export const buildApp = async () => {
  const app = Fastify({ loggerInstance: logger });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OpenInc Push Microservice API',
        version: '1.0.0',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(authPlugin);
  await app.register(routes);

  return app;
};
