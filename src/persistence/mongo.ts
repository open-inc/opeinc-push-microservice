import { MongoClient, type Collection, type Document } from 'mongodb';
import { config } from '../config.js';
import { logger } from '../observability/logger.js';

const client = new MongoClient(config.MONGODB_URI);

let connected = false;

const prefixed = (name: string): string => `${config.MONGODB_COLLECTION_PREFIX}${name}`;

export const collections = {
  clientApps: (): Collection<Document> =>
    client.db(config.MONGODB_DB_NAME).collection(prefixed('client_apps')),
  pushEndpoints: (): Collection<Document> =>
    client.db(config.MONGODB_DB_NAME).collection(prefixed('push_endpoints')),
  notificationRequests: (): Collection<Document> =>
    client.db(config.MONGODB_DB_NAME).collection(prefixed('notification_requests')),
  deliveryAttempts: (): Collection<Document> =>
    client.db(config.MONGODB_DB_NAME).collection(prefixed('delivery_attempts')),
  dispatchJobs: (): Collection<Document> =>
    client.db(config.MONGODB_DB_NAME).collection(prefixed('dispatch_jobs')),
};

export const connectMongo = async (): Promise<void> => {
  if (connected) {
    return;
  }

  await client.connect();
  connected = true;
  logger.info('Connected to MongoDB');
};

export const disconnectMongo = async (): Promise<void> => {
  if (!connected) {
    return;
  }

  await client.close();
  connected = false;
};

export const ensureIndexes = async (): Promise<void> => {
  await collections.clientApps().createIndex({ apiKeyHash: 1 }, { unique: true });

  await collections
    .pushEndpoints()
    .createIndexes([
      { key: { clientAppId: 1, status: 1 } },
      { key: { clientAppId: 1, externalRef: 1 } },
    ]);

  await collections
    .notificationRequests()
    .createIndexes([
      { key: { clientAppId: 1, idempotencyKey: 1 }, unique: true, sparse: true },
      { key: { status: 1 } },
    ]);

  await collections
    .deliveryAttempts()
    .createIndexes([{ key: { notificationRequestId: 1 } }, { key: { pushEndpointId: 1 } }]);

  await collections
    .dispatchJobs()
    .createIndexes([{ key: { status: 1, availableAt: 1 } }, { key: { leaseUntil: 1 } }]);
};

export const isMongoConnected = (): boolean => connected;
