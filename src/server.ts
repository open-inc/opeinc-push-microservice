import './api/types.js';
import { buildApp } from './app.js';
import { config } from './config.js';
import { ensureClientApp } from './persistence/bootstrapClientApp.js';
import { connectMongo, ensureIndexes } from './persistence/mongo.js';
import { logger } from './observability/logger.js';
import { startDispatchWorker } from './worker/dispatchWorker.js';

const bootstrap = async (): Promise<void> => {
  await connectMongo();
  await ensureIndexes();

  if (config.BOOTSTRAP_CLIENT_APP_NAME && config.BOOTSTRAP_CLIENT_APP_API_KEY) {
    await ensureClientApp(config.BOOTSTRAP_CLIENT_APP_NAME, config.BOOTSTRAP_CLIENT_APP_API_KEY);
    logger.info('Bootstrap client app ensured');
  }

  startDispatchWorker();

  const app = await buildApp();

  await app.listen({
    host: '0.0.0.0',
    port: config.PORT,
  });
};

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Server bootstrap failed');
  process.exit(1);
});
