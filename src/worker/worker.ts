import { connectMongo, ensureIndexes } from '../persistence/mongo.js';
import { logger } from '../observability/logger.js';
import { startDispatchWorker } from './dispatchWorker.js';

const bootstrap = async (): Promise<void> => {
  await connectMongo();
  await ensureIndexes();
  startDispatchWorker();
};

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Worker bootstrap failed');
  process.exit(1);
});
